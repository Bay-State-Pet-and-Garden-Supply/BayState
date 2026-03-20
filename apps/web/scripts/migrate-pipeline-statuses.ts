import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type LegacyPipelineStatus = 'staging' | 'scraped' | 'consolidated' | 'approved' | 'published' | 'failed';
type NewPipelineStatus = 'registered' | 'enriched' | 'finalized';

type ProductsIngestionRow = {
  sku: string;
  pipeline_status: LegacyPipelineStatus;
  pipeline_status_new: NewPipelineStatus | null;
};

type CliMode = 'dry-run' | 'execute';

const BATCH_SIZE = 100;
const SOURCE_TABLE = 'products_ingestion';
const BACKUP_TABLE = 'products_ingestion_backup';
const STATUS_MAPPING: Record<LegacyPipelineStatus, NewPipelineStatus> = {
  staging: 'registered',
  scraped: 'enriched',
  consolidated: 'finalized',
  approved: 'finalized',
  published: 'finalized',
  failed: 'registered',
};
const LEGACY_STATUSES = Object.keys(STATUS_MAPPING) as LegacyPipelineStatus[];

function loadLocalEnv(): void {
  const envFiles = ['.env.local', '.env'];

  for (const envFile of envFiles) {
    const envPath = path.resolve(process.cwd(), envFile);

    if (!fs.existsSync(envPath)) {
      continue;
    }

    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf('=');

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
      const unwrappedValue = rawValue.replace(/^['"]|['"]$/g, '');

      if (!process.env[key]) {
        process.env[key] = unwrappedValue;
      }
    }
  }
}

function parseArgs(argv: string[]): { mode: CliMode; rollback: boolean } {
  const hasExecute = argv.includes('--execute');
  const hasDryRun = argv.includes('--dry-run');
  const rollback = argv.includes('--rollback');

  if (hasExecute === hasDryRun) {
    throw new Error('Pass exactly one of --execute or --dry-run.');
  }

  return {
    mode: hasExecute ? 'execute' : 'dry-run',
    rollback,
  };
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase configuration. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getDatabaseUrl(): string {
  const databaseUrl =
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;

  if (!databaseUrl) {
    throw new Error(
      'Missing database connection string. Set SUPABASE_DB_URL, DATABASE_URL, POSTGRES_URL, or POSTGRES_PRISMA_URL.'
    );
  }

  return databaseUrl;
}

function runPsql(sql: string): void {
  const databaseUrl = getDatabaseUrl();

  try {
    execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', databaseUrl, '-c', sql], {
      stdio: 'inherit',
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error('`psql` is required for backup-table creation and rollback execution. Install PostgreSQL client tools or run from an environment that provides `psql`.');
    }

    throw error;
  }
}

function toSqlLiteral(value: string | null): string {
  if (value === null) {
    return 'NULL';
  }

  return `'${value.replace(/'/g, "''")}'`;
}

async function countRows(client: ReturnType<typeof getSupabaseAdmin>, table: string): Promise<number> {
  const { count, error } = await client.from(table).select('sku', { count: 'exact', head: true });

  if (error) {
    throw new Error(`Failed to count rows in ${table}: ${error.message}`);
  }

  return count ?? 0;
}

async function countMigratableRows(client: ReturnType<typeof getSupabaseAdmin>): Promise<number> {
  const { count, error } = await client
    .from(SOURCE_TABLE)
    .select('sku', { count: 'exact', head: true })
    .in('pipeline_status', LEGACY_STATUSES);

  if (error) {
    throw new Error(`Failed to count migratable rows: ${error.message}`);
  }

  return count ?? 0;
}

async function ensureBackup(client: ReturnType<typeof getSupabaseAdmin>, mode: CliMode): Promise<void> {
  if (mode === 'dry-run') {
    const sourceCount = await countRows(client, SOURCE_TABLE);
    console.log(`[dry-run] Would create ${BACKUP_TABLE} if missing and backup ${sourceCount} rows before migration.`);
    return;
  }

  console.log(`Ensuring ${BACKUP_TABLE} exists and is populated...`);

  runPsql(`
BEGIN;
CREATE TABLE IF NOT EXISTS public.${BACKUP_TABLE} (LIKE public.${SOURCE_TABLE} INCLUDING ALL);
INSERT INTO public.${BACKUP_TABLE}
SELECT *
FROM public.${SOURCE_TABLE}
ON CONFLICT DO NOTHING;
COMMIT;
`);

  const backupCount = await countRows(client, BACKUP_TABLE);
  console.log(`Backup ready with ${backupCount} rows.`);
}

async function fetchMigrationBatch(
  client: ReturnType<typeof getSupabaseAdmin>,
  offset: number
): Promise<ProductsIngestionRow[]> {
  const { data, error } = await client
    .from(SOURCE_TABLE)
    .select('sku, pipeline_status, pipeline_status_new')
    .in('pipeline_status', LEGACY_STATUSES)
    .order('sku', { ascending: true })
    .range(offset, offset + BATCH_SIZE - 1);

  if (error) {
    throw new Error(`Failed to fetch migration batch at offset ${offset}: ${error.message}`);
  }

  return (data ?? []) as ProductsIngestionRow[];
}

async function migrateStatuses(client: ReturnType<typeof getSupabaseAdmin>, mode: CliMode): Promise<void> {
  const total = await countMigratableRows(client);
  let processed = 0;
  let offset = 0;

  if (total === 0) {
    console.log('No products require pipeline status migration.');
    return;
  }

  console.log(`${mode === 'dry-run' ? 'Scanning' : 'Migrating'} ${total} products in batches of ${BATCH_SIZE}.`);

  while (processed < total) {
    const batch = await fetchMigrationBatch(client, offset);

    if (batch.length === 0) {
      break;
    }

    const updates = new Map<NewPipelineStatus, string[]>();

    for (const row of batch) {
      const nextStatus = STATUS_MAPPING[row.pipeline_status];

      if (row.pipeline_status_new === nextStatus) {
        continue;
      }

      const skus = updates.get(nextStatus) ?? [];
      skus.push(row.sku);
      updates.set(nextStatus, skus);
    }

    if (mode === 'execute') {
      for (const [nextStatus, skus] of updates.entries()) {
        const { error } = await client
          .from(SOURCE_TABLE)
          .update({ pipeline_status_new: nextStatus })
          .in('sku', skus);

        if (error) {
          throw new Error(`Failed to update ${skus.length} rows to ${nextStatus}: ${error.message}`);
        }
      }
    }

    processed += batch.length;
    offset += batch.length;
    console.log(`${mode === 'dry-run' ? 'Scanned' : 'Migrated'} ${Math.min(processed, total)} of ${total} products`);
  }

  console.log(mode === 'dry-run' ? 'Dry run complete. No data was modified.' : 'Migration complete.');
}

type BackupRow = {
  sku: string;
  pipeline_status: LegacyPipelineStatus;
  pipeline_status_new: NewPipelineStatus | null;
};

async function fetchRollbackBatch(
  client: ReturnType<typeof getSupabaseAdmin>,
  offset: number
): Promise<BackupRow[]> {
  const { data, error } = await client
    .from(BACKUP_TABLE)
    .select('sku, pipeline_status, pipeline_status_new')
    .order('sku', { ascending: true })
    .range(offset, offset + BATCH_SIZE - 1);

  if (error) {
    throw new Error(`Failed to fetch rollback batch at offset ${offset}: ${error.message}`);
  }

  return (data ?? []) as BackupRow[];
}

function buildRollbackSql(batch: BackupRow[]): string {
  const values = batch
    .map((row) => `(${toSqlLiteral(row.sku)}, ${toSqlLiteral(row.pipeline_status)}, ${toSqlLiteral(row.pipeline_status_new)})`)
    .join(',\n    ');

  return `
UPDATE public.${SOURCE_TABLE} AS target
SET
  pipeline_status = backup.pipeline_status::text,
  pipeline_status_new = backup.pipeline_status_new::pipeline_status_new_enum
FROM (
  VALUES
    ${values}
) AS backup(sku, pipeline_status, pipeline_status_new)
WHERE target.sku = backup.sku;
`;
}

async function rollbackStatuses(client: ReturnType<typeof getSupabaseAdmin>, mode: CliMode): Promise<void> {
  const total = await countRows(client, BACKUP_TABLE);
  let processed = 0;
  let offset = 0;

  if (total === 0) {
    console.log(`No rows found in ${BACKUP_TABLE}; nothing to roll back.`);
    return;
  }

  console.log(`${mode === 'dry-run' ? 'Scanning rollback for' : 'Rolling back'} ${total} products in batches of ${BATCH_SIZE}.`);

  while (processed < total) {
    const batch = await fetchRollbackBatch(client, offset);

    if (batch.length === 0) {
      break;
    }

    if (mode === 'execute') {
      runPsql(buildRollbackSql(batch));
    }

    processed += batch.length;
    offset += batch.length;
    console.log(`${mode === 'dry-run' ? 'Scanned' : 'Rolled back'} ${Math.min(processed, total)} of ${total} products`);
  }

  console.log(mode === 'dry-run' ? 'Rollback dry run complete. No data was modified.' : 'Rollback complete.');
}

async function main(): Promise<void> {
  loadLocalEnv();

  const { mode, rollback } = parseArgs(process.argv.slice(2));
  const client = getSupabaseAdmin();

  console.log('Pipeline status migration script');
  console.log('Test this in staging before running against production.');

  if (rollback) {
    await rollbackStatuses(client, mode);
    return;
  }

  await ensureBackup(client, mode);
  await migrateStatuses(client, mode);
}

main().catch((error) => {
  console.error('Fatal error:', error instanceof Error ? error.message : error);
  process.exit(1);
});

export { main, migrateStatuses, rollbackStatuses };
