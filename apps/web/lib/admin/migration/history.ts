/**
 * Migration History Utilities
 *
 * Legacy ShopSite migration helpers now write to integration_sync_runs.
 */

import { createClient } from '@/lib/supabase/server';
import { SyncResult } from './types';
import {
  mapIntegrationSyncRunToMigrationLogEntry,
  type IntegrationSyncRunHistoryRow,
  type LoggedSyncError,
  type MigrationLogEntry,
} from './history-entry';

export type { LoggedSyncError, MigrationLogEntry } from './history-entry';

type SyncResultWithAudit = SyncResult & {
  skipped?: number;
  audit?: {
    crossSell?: {
      sourcesProcessed?: number;
      linked?: number;
      skipped?: number;
      skippedDuplicates?: number;
      skippedSelfLinks?: number;
      skippedMissing?: number;
    };
  };
};

const LEGACY_MIGRATION_SOURCE_TYPE = 'shopsite';
const LEGACY_MIGRATION_SOURCE_SYSTEM = 'shopsite_15';

function buildLoggedErrors(result: SyncResult): LoggedSyncError[] {
  const resultWithAudit = result as SyncResultWithAudit;
  const errors = [...result.errors];
  const timestamp = new Date().toISOString();

  if (typeof resultWithAudit.skipped === 'number') {
    errors.push({
      record: '__audit__',
      error: `Audit summary: processed=${result.processed}, skipped=${resultWithAudit.skipped}, failed=${result.failed}`,
      timestamp,
    });
  }

  if (resultWithAudit.audit?.crossSell) {
    const crossSell = resultWithAudit.audit.crossSell;
    errors.push({
      record: '__audit_cross_sell__',
      error: `Cross-sell summary: sources=${crossSell.sourcesProcessed ?? 0}, linked=${crossSell.linked ?? 0}, skipped=${crossSell.skipped ?? 0}, duplicate=${crossSell.skippedDuplicates ?? 0}, self=${crossSell.skippedSelfLinks ?? 0}, missing=${crossSell.skippedMissing ?? 0}`,
      timestamp,
    });
  }

  return errors;
}

function buildSyncRunUpdate(result: SyncResult) {
  const loggedErrors = buildLoggedErrors(result);

  return {
    status: result.success ? 'completed' : 'failed',
    row_count: result.processed,
    inserted_count: result.created,
    updated_count: result.updated,
    error_count: result.failed,
    completed_at: new Date().toISOString(),
    error_summary: loggedErrors[0]?.error ?? null,
    metadata: {
      legacy_adapter: 'migration_log',
      errors: loggedErrors,
    },
  };
}

/**
 * Log the start of a migration sync.
 */
export async function startMigrationLog(
  syncType: 'products' | 'customers',
): Promise<string | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('integration_sync_runs')
    .insert({
      source_type: LEGACY_MIGRATION_SOURCE_TYPE,
      source_system: LEGACY_MIGRATION_SOURCE_SYSTEM,
      sync_kind: syncType,
      status: 'running',
      metadata: {
        legacy_adapter: 'migration_log',
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create integration sync run:', error);
    return null;
  }

  return data?.id ?? null;
}

/**
 * Complete a migration log entry with the results.
 */
export async function completeMigrationLog(
  logId: string,
  result: SyncResult,
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('integration_sync_runs')
    .update({
      ...buildSyncRunUpdate(result),
      completed_at: new Date().toISOString(),
    })
    .eq('id', logId);

  if (error) {
    console.error('Failed to update integration sync run:', error);
  }
}

/**
 * Update migration progress (for long-running syncs).
 */
export async function updateMigrationProgress(
  logId: string,
  result: SyncResult,
): Promise<void> {
  const supabase = await createClient();
  const loggedErrors = buildLoggedErrors(result);

  const { error } = await supabase
    .from('integration_sync_runs')
    .update({
      row_count: result.processed,
      inserted_count: result.created,
      updated_count: result.updated,
      error_count: result.failed,
      error_summary: loggedErrors[0]?.error ?? null,
      metadata: {
        legacy_adapter: 'migration_log',
        errors: loggedErrors,
      },
    })
    .eq('id', logId);

  if (error) {
    console.error('Failed to update integration sync progress:', error);
  }
}

/**
 * Get recent sync runs for display.
 */
export async function getRecentMigrationLogs(
  limit: number = 10,
): Promise<MigrationLogEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('integration_sync_runs')
    .select(
      'id, source_type, source_system, sync_kind, status, row_count, inserted_count, updated_count, error_count, started_at, completed_at, error_summary, metadata',
    )
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch integration sync runs:', error);
    return [];
  }

  const MAX_DISPLAY_ERRORS = 10;

  return ((data ?? []) as IntegrationSyncRunHistoryRow[]).map((entry) => {
    const mapped = mapIntegrationSyncRunToMigrationLogEntry(entry);

    return {
      ...mapped,
      errors:
        mapped.errors.length > MAX_DISPLAY_ERRORS
          ? [
              ...mapped.errors.slice(0, MAX_DISPLAY_ERRORS),
              {
                record: '...',
                error: `And ${mapped.errors.length - MAX_DISPLAY_ERRORS} more errors`,
                timestamp: new Date().toISOString(),
              },
            ]
          : mapped.errors,
    };
  });
}
