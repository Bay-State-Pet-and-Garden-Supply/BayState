export interface LoggedSyncError {
  record: string;
  error: string;
  timestamp: string;
}

export interface MigrationLogEntry {
  id: string;
  sync_type: string;
  started_at: string;
  completed_at: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'partial';
  processed: number;
  created: number;
  updated: number;
  failed: number;
  duration_ms: number | null;
  errors: LoggedSyncError[];
}

export interface IntegrationSyncRunHistoryRow {
  id: string;
  source_type?: string | null;
  source_system?: string | null;
  sync_kind: string;
  status: string;
  row_count?: number | null;
  inserted_count?: number | null;
  updated_count?: number | null;
  error_count?: number | null;
  started_at: string;
  completed_at?: string | null;
  error_summary?: string | null;
  metadata?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isLoggedSyncError(value: unknown): value is LoggedSyncError {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.record === 'string' &&
    typeof value.error === 'string' &&
    typeof value.timestamp === 'string'
  );
}

function normalizeStatus(
  status: string,
): MigrationLogEntry['status'] {
  switch (status) {
    case 'queued':
    case 'running':
    case 'completed':
    case 'failed':
    case 'partial':
      return status;
    default:
      return 'running';
  }
}

function calculateDurationMs(
  startedAt: string,
  completedAt: string | null | undefined,
): number | null {
  if (!completedAt) {
    return null;
  }

  const started = new Date(startedAt).getTime();
  const completed = new Date(completedAt).getTime();

  if (!Number.isFinite(started) || !Number.isFinite(completed)) {
    return null;
  }

  return Math.max(0, Math.round(completed - started));
}

function buildFallbackError(
  errorSummary: string | null | undefined,
  startedAt: string,
): LoggedSyncError[] {
  if (!errorSummary) {
    return [];
  }

  return [
    {
      record: '__summary__',
      error: errorSummary,
      timestamp: startedAt,
    },
  ];
}

function extractLoggedErrors(
  metadata: unknown,
  errorSummary: string | null | undefined,
  startedAt: string,
): LoggedSyncError[] {
  if (!isRecord(metadata)) {
    return buildFallbackError(errorSummary, startedAt);
  }

  const errors = metadata.errors;
  if (!Array.isArray(errors)) {
    return buildFallbackError(errorSummary, startedAt);
  }

  const normalizedErrors = errors.filter(isLoggedSyncError);
  if (normalizedErrors.length > 0) {
    return normalizedErrors;
  }

  return buildFallbackError(errorSummary, startedAt);
}

function formatSyncType(run: IntegrationSyncRunHistoryRow): string {
  if (!run.source_type || run.source_type === 'shopsite') {
    return run.sync_kind;
  }

  return `${run.source_type}:${run.sync_kind}`;
}

export function mapIntegrationSyncRunToMigrationLogEntry(
  run: IntegrationSyncRunHistoryRow,
): MigrationLogEntry {
  return {
    id: run.id,
    sync_type: formatSyncType(run),
    started_at: run.started_at,
    completed_at: run.completed_at ?? null,
    status: normalizeStatus(run.status),
    processed: run.row_count ?? 0,
    created: run.inserted_count ?? 0,
    updated: run.updated_count ?? 0,
    failed: run.error_count ?? 0,
    duration_ms:
      calculateDurationMs(run.started_at, run.completed_at) ?? null,
    errors: extractLoggedErrors(run.metadata, run.error_summary, run.started_at),
  };
}
