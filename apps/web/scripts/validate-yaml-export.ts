import { createClient } from '@supabase/supabase-js';
import { assembleScraperConfigBySlug } from '@/lib/admin/scraper-configs/assemble-config';
import fs from 'fs/promises';
import path from 'path';
import YAML from 'yaml';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

interface PublishedVersionRow {
  config_id: string;
  scraper_configs:
    | {
        slug: string | null;
      }
    | {
        slug: string | null;
      }[]
    | null;
}

interface FieldMismatch {
  field: string;
  database: string;
  yaml: string;
}

interface ValidationResult {
  slug: string;
  mismatches: FieldMismatch[];
}

const FIELDS_TO_COMPARE = [
  'schema_version',
  'name',
  'display_name',
  'base_url',
  'scraper_type',
  'selectors',
  'workflows',
  'ai_config',
  'anti_detection',
  'validation',
  'login',
  'http_status',
  'normalization',
  'timeout',
  'retries',
  'image_quality',
  'test_skus',
  'fake_skus',
  'edge_case_skus',
] as const;

async function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase configuration (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
  }

  return createClient(url, key);
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function loadEnvFileIfPresent(filePath: string) {
  try {
    const contents = await fs.readFile(filePath, 'utf-8');
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      let value = line.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function loadLocalEnv() {
  const projectRoot = path.resolve(__dirname, '..');
  await loadEnvFileIfPresent(path.join(projectRoot, '.env.local'));
  await loadEnvFileIfPresent(path.join(projectRoot, '.env'));
}

async function getPublishedSlugs() {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from('scraper_config_versions')
    .select('config_id, scraper_configs!fk_config_id (slug)')
    .eq('status', 'published');

  if (error) {
    throw new Error(`Failed to query published versions: ${error.message}`);
  }

  const slugSet = new Set<string>();
  for (const row of ((data || []) as unknown as PublishedVersionRow[])) {
    const relation = Array.isArray(row.scraper_configs)
      ? row.scraper_configs[0] ?? null
      : row.scraper_configs;
    const slug = relation?.slug;
    if (slug) {
      slugSet.add(slug);
    }
  }

  return {
    slugs: Array.from(slugSet).sort(),
  };
}

async function loadYamlConfig(configPath: string) {
  const yamlText = await fs.readFile(configPath, 'utf-8');
  return YAML.parse(yamlText) as Record<string, unknown>;
}

function normalizeForComparison(value: unknown): JsonValue {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => normalizeForComparison(item));
  }

  if (isPlainObject(value)) {
    const normalizedEntries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, normalizeForComparison(nestedValue)] as const);

    return Object.fromEntries(normalizedEntries);
  }

  return String(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatValue(value: unknown) {
  return JSON.stringify(normalizeForComparison(value), null, 2) ?? 'undefined';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

function compareConfigValues(
  slug: string,
  databaseConfig: Record<string, unknown>,
  yamlConfig: Record<string, unknown>
): ValidationResult {
  const mismatches: FieldMismatch[] = [];

  for (const field of FIELDS_TO_COMPARE) {
    const databaseValue = normalizeForComparison(databaseConfig[field]);
    const yamlValue = normalizeForComparison(yamlConfig[field]);

    if (JSON.stringify(databaseValue) !== JSON.stringify(yamlValue)) {
      mismatches.push({
        field,
        database: formatValue(databaseConfig[field]),
        yaml: formatValue(yamlConfig[field]),
      });
    }
  }

  return { slug, mismatches };
}

function buildReport(slugs: string[], results: ValidationResult[]) {
  const matchedConfigs = results.filter(result => result.mismatches.length === 0);
  const mismatchedConfigs = results.filter(result => result.mismatches.length > 0);

  const sections: string[] = [
    'Config Validation Report',
    '========================',
    `Total configs checked: ${slugs.length}`,
    `Matches: ${matchedConfigs.length}`,
    `Mismatches: ${mismatchedConfigs.length}`,
    '',
  ];

  if (mismatchedConfigs.length === 0) {
    sections.push('All published configs match their YAML exports.');
    return sections.join('\n');
  }

  sections.push('Mismatches:');
  sections.push('');

  mismatchedConfigs.forEach((result, index) => {
    sections.push(`${index + 1}. ${result.slug}`);
    for (const mismatch of result.mismatches) {
      sections.push(`   - Field: ${mismatch.field}`);
      sections.push(`     DB: ${mismatch.database}`);
      sections.push(`     YAML: ${mismatch.yaml}`);
    }
    sections.push('');
  });

  return sections.join('\n').trimEnd();
}

async function main() {
  await loadLocalEnv();
  const { slugs } = await getPublishedSlugs();

  const repoConfigsDir = path.resolve(__dirname, '..', '..', 'scraper', 'scrapers', 'configs');
  const evidenceDir = path.resolve(__dirname, '..', '..', '..', '.sisyphus', 'evidence');
  const reportPath = path.join(evidenceDir, 'task-2-6-validation-report.txt');

  await ensureDir(evidenceDir);

  if (slugs.length === 0) {
    const emptyReport = buildReport([], []);
    await fs.writeFile(reportPath, emptyReport, 'utf-8');
    console.log(emptyReport);
    console.log(`\nReport written to ${reportPath}`);
    return;
  }

  const results: ValidationResult[] = [];

  for (const slug of slugs) {
    const configPath = path.join(repoConfigsDir, `${slug}.yaml`);
    const databaseConfig = await assembleScraperConfigBySlug(slug);

    if (!databaseConfig) {
      results.push({
        slug,
        mismatches: [
          {
            field: 'database_config',
            database: 'null',
            yaml: 'Unable to assemble database config payload',
          },
        ],
      });
      continue;
    }

    let yamlConfig: Record<string, unknown>;

    try {
      yamlConfig = await loadYamlConfig(configPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        slug,
        mismatches: [
          {
            field: 'yaml_file',
            database: formatValue(databaseConfig),
            yaml: `Unable to load ${configPath}: ${message}`,
          },
        ],
      });
      continue;
    }

    results.push(compareConfigValues(slug, asRecord(databaseConfig), yamlConfig));
  }

  const report = buildReport(slugs, results);
  await fs.writeFile(reportPath, report + '\n', 'utf-8');

  console.log(report);
  console.log(`\nReport written to ${reportPath}`);

  process.exitCode = results.some(result => result.mismatches.length > 0) ? 1 : 0;
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error instanceof Error ? error.message : error);
    process.exit(2);
  });
}
