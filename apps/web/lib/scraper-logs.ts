export type ScrapeLogLevel = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export interface ScrapeJobLogEntry {
  id: string;
  event_id?: string;
  job_id: string;
  level: ScrapeLogLevel;
  message: string;
  timestamp: string;
  created_at?: string;
  runner_id?: string | null;
  runner_name?: string | null;
  source?: string | null;
  scraper_name?: string | null;
  sku?: string | null;
  phase?: string | null;
  sequence?: number | null;
  details?: Record<string, unknown> | null;
  persisted?: boolean;
}

export interface ScrapeJobProgressUpdate {
  job_id: string;
  runner_id?: string | null;
  runner_name?: string | null;
  status: string;
  progress: number;
  message?: string | null;
  phase?: string | null;
  current_sku?: string | null;
  items_processed?: number | null;
  items_total?: number | null;
  details?: Record<string, unknown> | null;
  timestamp: string;
}

const VALID_LEVELS = new Set<ScrapeLogLevel>([
  'debug',
  'info',
  'warning',
  'error',
  'critical',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

function toOptionalNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function normalizeScrapeLogLevel(level: unknown): ScrapeLogLevel {
  const normalized = typeof level === 'string' ? level.toLowerCase() : 'info';
  if (normalized === 'warn') {
    return 'warning';
  }
  return VALID_LEVELS.has(normalized as ScrapeLogLevel)
    ? (normalized as ScrapeLogLevel)
    : 'info';
}

export function normalizeScrapeTimestamp(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const seconds = value > 10_000_000_000 ? value / 1000 : value;
    return new Date(seconds * 1000).toISOString();
  }

  return new Date().toISOString();
}

export function normalizeScrapeLogEntry(
  raw: Record<string, unknown>,
  options: { persisted?: boolean; jobId?: string } = {},
): ScrapeJobLogEntry {
  const eventId = toOptionalString(raw.event_id) ?? toOptionalString(raw.id) ?? undefined;
  const timestamp = normalizeScrapeTimestamp(raw.timestamp ?? raw.created_at);
  const createdAt = normalizeScrapeTimestamp(raw.created_at ?? raw.timestamp);
  const details = isRecord(raw.details) ? raw.details : null;
  const sequence = toOptionalNumber(raw.sequence) ?? null;
  const jobId = toOptionalString(raw.job_id) ?? options.jobId ?? '';
  const message = toOptionalString(raw.message) ?? '';

  const fingerprint = [
    jobId,
    sequence ?? 'na',
    timestamp,
    normalizeScrapeLogLevel(raw.level),
    message,
    toOptionalString(raw.runner_name) ?? '',
    toOptionalString(raw.scraper_name) ?? '',
    toOptionalString(raw.sku) ?? '',
  ].join(':');

  return {
    id: eventId ?? fingerprint,
    event_id: eventId,
    job_id: jobId,
    level: normalizeScrapeLogLevel(raw.level),
    message,
    timestamp,
    created_at: createdAt,
    runner_id: toOptionalString(raw.runner_id),
    runner_name: toOptionalString(raw.runner_name),
    source: toOptionalString(raw.source),
    scraper_name: toOptionalString(raw.scraper_name),
    sku: toOptionalString(raw.sku),
    phase: toOptionalString(raw.phase),
    sequence,
    details,
    persisted: options.persisted ?? false,
  };
}

export function buildScrapeLogKey(log: ScrapeJobLogEntry): string {
  if (log.event_id) {
    return log.event_id;
  }

  return [
    log.job_id,
    log.sequence ?? 'na',
    log.timestamp,
    log.level,
    log.message,
    log.runner_name ?? '',
    log.scraper_name ?? '',
    log.sku ?? '',
  ].join(':');
}

function mergeScrapeLogEntry(
  previous: ScrapeJobLogEntry,
  next: ScrapeJobLogEntry,
): ScrapeJobLogEntry {
  const persisted = Boolean(previous.persisted || next.persisted);

  return {
    ...previous,
    ...next,
    id: next.id || previous.id,
    event_id: next.event_id ?? previous.event_id,
    timestamp: next.timestamp || previous.timestamp,
    created_at: next.created_at || previous.created_at,
    details: next.details ?? previous.details,
    persisted,
  };
}

function compareScrapeLogEntries(
  left: ScrapeJobLogEntry,
  right: ScrapeJobLogEntry,
): number {
  const leftTime = new Date(left.timestamp).getTime();
  const rightTime = new Date(right.timestamp).getTime();
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  const leftSequence = left.sequence ?? Number.MAX_SAFE_INTEGER;
  const rightSequence = right.sequence ?? Number.MAX_SAFE_INTEGER;
  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  return buildScrapeLogKey(left).localeCompare(buildScrapeLogKey(right));
}

export function mergeScrapeJobLogs(
  existing: ScrapeJobLogEntry[],
  incoming: ScrapeJobLogEntry[],
  maxEntries = 2000,
): ScrapeJobLogEntry[] {
  const merged = new Map<string, ScrapeJobLogEntry>();

  for (const entry of [...existing, ...incoming]) {
    const key = buildScrapeLogKey(entry);
    const previous = merged.get(key);
    merged.set(key, previous ? mergeScrapeLogEntry(previous, entry) : entry);
  }

  const sorted = Array.from(merged.values()).sort(compareScrapeLogEntries);
  return sorted.length > maxEntries ? sorted.slice(sorted.length - maxEntries) : sorted;
}

export function normalizeScrapeProgressUpdate(
  raw: Record<string, unknown>,
): ScrapeJobProgressUpdate {
  return {
    job_id: toOptionalString(raw.job_id) ?? '',
    runner_id: toOptionalString(raw.runner_id),
    runner_name: toOptionalString(raw.runner_name),
    status: toOptionalString(raw.status) ?? 'running',
    progress: Math.max(0, Math.min(100, toOptionalNumber(raw.progress) ?? 0)),
    message: toOptionalString(raw.message),
    phase: toOptionalString(raw.phase),
    current_sku: toOptionalString(raw.current_sku),
    items_processed: toOptionalNumber(raw.items_processed),
    items_total: toOptionalNumber(raw.items_total),
    details: isRecord(raw.details) ? raw.details : null,
    timestamp: normalizeScrapeTimestamp(raw.timestamp),
  };
}

export function toScrapeJobLogRow(log: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalizeScrapeLogEntry(log, { persisted: true });

  return {
    job_id: normalized.job_id,
    event_id: normalized.event_id ?? normalized.id,
    level: normalized.level,
    message: normalized.message,
    created_at: normalized.timestamp,
    runner_id: normalized.runner_id ?? null,
    runner_name: normalized.runner_name ?? null,
    source: normalized.source ?? null,
    scraper_name: normalized.scraper_name ?? null,
    sku: normalized.sku ?? null,
    phase: normalized.phase ?? null,
    sequence: normalized.sequence ?? null,
    details: normalized.details ?? null,
  };
}
