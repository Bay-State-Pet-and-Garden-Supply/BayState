import type { SupabaseClient } from '@supabase/supabase-js';

import {
  getLatestScrapeJobLog,
  normalizeScrapeLogEntry,
  toScrapeJobLogRow,
  type ScrapeJobLogEntry,
} from '@/lib/scraper-logs';

export interface PersistScrapeJobLogsOptions {
  fallbackRunnerName?: string;
}

function normalizeIncomingLogs(
  jobId: string,
  logs: Array<Record<string, unknown>>,
  fallbackRunnerName?: string,
): ScrapeJobLogEntry[] {
  return logs
    .map((log) =>
      normalizeScrapeLogEntry(
        {
          ...log,
          job_id: log.job_id ?? jobId,
          runner_name: log.runner_name ?? fallbackRunnerName,
        },
        { persisted: true, jobId },
      ),
    )
    .filter((log) => log.job_id.length > 0 && log.message.length > 0);
}

export async function persistScrapeJobLogs(
  supabase: SupabaseClient,
  jobId: string,
  logs: Array<Record<string, unknown>>,
  options: PersistScrapeJobLogsOptions = {},
): Promise<ScrapeJobLogEntry | null> {
  if (logs.length === 0) {
    return null;
  }

  const normalizedLogs = normalizeIncomingLogs(jobId, logs, options.fallbackRunnerName);
  if (normalizedLogs.length === 0) {
    return null;
  }

  const logRows = normalizedLogs.map((log) => toScrapeJobLogRow(log));
  const { error } = await supabase
    .from('scrape_job_logs')
    .upsert(logRows, { onConflict: 'job_id,event_id', ignoreDuplicates: true });

  if (error) {
    throw error;
  }

  return getLatestScrapeJobLog(normalizedLogs);
}

export async function updateScrapeJobLogSummary(
  supabase: SupabaseClient,
  jobId: string,
  latestLog: ScrapeJobLogEntry | null,
): Promise<void> {
  if (!latestLog) {
    return;
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    last_event_at: latestLog.timestamp,
    last_log_at: latestLog.timestamp,
    last_log_level: latestLog.level,
    last_log_message: latestLog.message,
  };

  if (latestLog.runner_name) {
    updateData.runner_name = latestLog.runner_name;
  }

  const { error } = await supabase
    .from('scrape_jobs')
    .update(updateData)
    .eq('id', jobId);

  if (error) {
    throw error;
  }
}
