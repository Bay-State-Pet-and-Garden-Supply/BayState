-- Migration: repair scrape_job_logs drift and add durable scrape job runtime state
-- Purpose:
-- 1. Ensure scrape_job_logs matches the richer runner logging contract already used by the app.
-- 2. Persist the latest progress/runtime snapshot directly on scrape_jobs so monitoring pages
--    can subscribe to a durable source of truth instead of relying on transient broadcasts.

ALTER TABLE public.scrape_job_logs
  ADD COLUMN IF NOT EXISTS event_id text,
  ADD COLUMN IF NOT EXISTS runner_id text,
  ADD COLUMN IF NOT EXISTS runner_name text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS scraper_name text,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS phase text,
  ADD COLUMN IF NOT EXISTS sequence bigint;

UPDATE public.scrape_job_logs
SET event_id = COALESCE(event_id, id::text)
WHERE event_id IS NULL;

ALTER TABLE public.scrape_job_logs
  ALTER COLUMN event_id SET DEFAULT gen_random_uuid()::text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scrape_job_logs_job_id_event_id
  ON public.scrape_job_logs(job_id, event_id);

CREATE INDEX IF NOT EXISTS idx_scrape_job_logs_job_id_sequence
  ON public.scrape_job_logs(job_id, sequence);

CREATE INDEX IF NOT EXISTS idx_scrape_job_logs_job_id_runner_name
  ON public.scrape_job_logs(job_id, runner_name);

ALTER TABLE public.scrape_jobs
  ADD COLUMN IF NOT EXISTS progress_percent integer,
  ADD COLUMN IF NOT EXISTS progress_message text,
  ADD COLUMN IF NOT EXISTS progress_phase text,
  ADD COLUMN IF NOT EXISTS progress_details jsonb,
  ADD COLUMN IF NOT EXISTS progress_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_sku text,
  ADD COLUMN IF NOT EXISTS items_processed integer,
  ADD COLUMN IF NOT EXISTS items_total integer,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_log_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_log_level text,
  ADD COLUMN IF NOT EXISTS last_log_message text;

UPDATE public.scrape_jobs
SET progress_percent = CASE
  WHEN status = 'completed' THEN 100
  ELSE COALESCE(progress_percent, 0)
END
WHERE progress_percent IS NULL;

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status_last_event_at
  ON public.scrape_jobs(status, last_event_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_last_log_at
  ON public.scrape_jobs(last_log_at DESC NULLS LAST);

COMMENT ON COLUMN public.scrape_job_logs.event_id IS 'Stable runner-generated event identifier used to dedupe optimistic realtime logs.';
COMMENT ON COLUMN public.scrape_job_logs.runner_id IS 'Runner instance identifier that emitted the log entry.';
COMMENT ON COLUMN public.scrape_job_logs.runner_name IS 'Human-readable runner name that emitted the log entry.';
COMMENT ON COLUMN public.scrape_job_logs.source IS 'Logical logger/source name for the log entry.';
COMMENT ON COLUMN public.scrape_job_logs.scraper_name IS 'Scraper slug associated with the log entry.';
COMMENT ON COLUMN public.scrape_job_logs.sku IS 'SKU being processed when the log entry was emitted.';
COMMENT ON COLUMN public.scrape_job_logs.phase IS 'High-level execution phase such as claimed, configuring, scraping, completed, or failed.';
COMMENT ON COLUMN public.scrape_job_logs.sequence IS 'Per-job monotonic sequence used to preserve runner log ordering.';

COMMENT ON COLUMN public.scrape_jobs.progress_percent IS 'Durable latest progress percent for the active or most recent scrape run.';
COMMENT ON COLUMN public.scrape_jobs.progress_message IS 'Latest human-readable runtime message emitted by the scraper runner.';
COMMENT ON COLUMN public.scrape_jobs.progress_phase IS 'Latest high-level runtime phase emitted by the scraper runner.';
COMMENT ON COLUMN public.scrape_jobs.progress_details IS 'Structured runtime details for the latest progress update.';
COMMENT ON COLUMN public.scrape_jobs.progress_updated_at IS 'Timestamp of the latest persisted progress update.';
COMMENT ON COLUMN public.scrape_jobs.current_sku IS 'Current SKU being processed according to the latest persisted progress update.';
COMMENT ON COLUMN public.scrape_jobs.items_processed IS 'Processed item count from the latest persisted progress update.';
COMMENT ON COLUMN public.scrape_jobs.items_total IS 'Total item count from the latest persisted progress update.';
COMMENT ON COLUMN public.scrape_jobs.last_event_at IS 'Timestamp of the latest persisted runtime event (log or progress).';
COMMENT ON COLUMN public.scrape_jobs.last_log_at IS 'Timestamp of the latest persisted job log entry.';
COMMENT ON COLUMN public.scrape_jobs.last_log_level IS 'Level of the latest persisted job log entry.';
COMMENT ON COLUMN public.scrape_jobs.last_log_message IS 'Message of the latest persisted job log entry.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'scrape_job_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scrape_job_logs;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'scrape_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scrape_jobs;
  END IF;
END $$;
