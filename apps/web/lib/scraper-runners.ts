import type { Database, Json } from '@/types/supabase';

export type ScraperRunnerRow = Database['public']['Tables']['scraper_runners']['Row'];
export type RunnerDurableStatus = 'online' | 'offline' | 'busy' | 'idle' | 'polling' | 'paused';
export type RunnerPresenceStatus = 'online' | 'offline' | 'busy' | 'idle';
type JsonObject = { [key: string]: Json | undefined };

export const RUNNER_STALE_AFTER_MS = 5 * 60 * 1000;

const RUNNER_STATUSES = new Set<RunnerDurableStatus>([
  'online',
  'offline',
  'busy',
  'idle',
  'polling',
  'paused',
]);

function isRecord(value: Json | null): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function coerceRunnerMetadata(metadata: Json | null): JsonObject | null {
  return isRecord(metadata) ? metadata : null;
}

export function getRunnerLastSeen(
  runner: Pick<ScraperRunnerRow, 'last_seen_at' | 'created_at'>,
): string {
  return runner.last_seen_at ?? runner.created_at ?? new Date(0).toISOString();
}

export function isRunnerStale(lastSeenIso: string | null | undefined, now = new Date()): boolean {
  if (!lastSeenIso) {
    return true;
  }

  const lastSeenMs = new Date(lastSeenIso).getTime();
  if (Number.isNaN(lastSeenMs)) {
    return true;
  }

  return now.getTime() - lastSeenMs > RUNNER_STALE_AFTER_MS;
}

export function getStoredRunnerStatus(
  runner: Pick<ScraperRunnerRow, 'status' | 'current_job_id'>,
): RunnerDurableStatus {
  if (runner.status && RUNNER_STATUSES.has(runner.status as RunnerDurableStatus)) {
    return runner.status as RunnerDurableStatus;
  }

  return runner.current_job_id ? 'busy' : 'offline';
}

export function getEffectiveRunnerStatus(
  runner: Pick<ScraperRunnerRow, 'status' | 'current_job_id' | 'last_seen_at' | 'created_at'>,
  now = new Date(),
): RunnerDurableStatus {
  const storedStatus = getStoredRunnerStatus(runner);

  if (storedStatus === 'offline') {
    return 'offline';
  }

  return isRunnerStale(getRunnerLastSeen(runner), now) ? 'offline' : storedStatus;
}

export function getRunnerPresenceStatus(status: RunnerDurableStatus): RunnerPresenceStatus {
  switch (status) {
    case 'busy':
      return 'busy';
    case 'idle':
    case 'polling':
    case 'paused':
      return 'idle';
    case 'online':
      return 'online';
    default:
      return 'offline';
  }
}

export function getRunnerConnectivityStatus(
  status: RunnerDurableStatus,
): 'online' | 'offline' {
  return status === 'offline' ? 'offline' : 'online';
}

export function getRunnerVersion(metadata: JsonObject | null): string | null {
  if (!metadata) {
    return null;
  }

  const candidate = metadata.build_sha ?? metadata.build_id ?? metadata.version;
  return typeof candidate === 'string' && candidate.trim() ? candidate : null;
}

export function getRunnerBuildCheckReason(
  metadata: JsonObject | null,
): string | null {
  if (!metadata) {
    return null;
  }

  const candidate = metadata.build_check_reason;
  return typeof candidate === 'string' && candidate.trim() ? candidate : null;
}

export function getRunnerLabels(metadata: JsonObject | null): string[] {
  if (!metadata) {
    return [];
  }

  const labels = metadata.labels;
  if (!Array.isArray(labels)) {
    return [];
  }

  return labels.filter((label): label is string => typeof label === 'string' && label.trim().length > 0);
}

export function getRunnerOs(metadata: JsonObject | null): string {
  if (!metadata) {
    return 'Unknown';
  }

  const os = metadata.os;
  return typeof os === 'string' && os.trim() ? os : 'Unknown';
}
