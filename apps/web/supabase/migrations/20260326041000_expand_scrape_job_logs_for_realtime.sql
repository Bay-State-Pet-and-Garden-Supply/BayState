-- Migration: expand scrape_job_logs for durable realtime runner logging
-- Adds stable event identifiers and structured runner context so the UI can
-- merge optimistic broadcasts with persisted history without duplicates.

ALTER TABLE public.scrape_job_logs
  ADD COLUMN IF NOT EXISTS event_id text DEFAULT gen_random_uuid()::text,
  ADD COLUMN IF NOT EXISTS runner_id text,
  ADD COLUMN IF NOT EXISTS runner_name text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS scraper_name text,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS phase text,
  ADD COLUMN IF NOT EXISTS sequence bigint;

UPDATE public.scrape_job_logs
SET event_id = gen_random_uuid()::text
WHERE event_id IS NULL;

ALTER TABLE public.scrape_job_logs
  ALTER COLUMN event_id SET DEFAULT gen_random_uuid()::text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scrape_job_logs_job_id_event_id
  ON public.scrape_job_logs(job_id, event_id);

CREATE INDEX IF NOT EXISTS idx_scrape_job_logs_job_id_sequence
  ON public.scrape_job_logs(job_id, sequence);

CREATE INDEX IF NOT EXISTS idx_scrape_job_logs_job_id_runner_name
  ON public.scrape_job_logs(job_id, runner_name);

COMMENT ON COLUMN public.scrape_job_logs.event_id IS 'Stable runner-generated event identifier used to dedupe optimistic realtime logs.';
COMMENT ON COLUMN public.scrape_job_logs.runner_name IS 'Human-readable runner name that emitted the log entry.';
COMMENT ON COLUMN public.scrape_job_logs.source IS 'Logical source/logger name for the log entry.';
COMMENT ON COLUMN public.scrape_job_logs.scraper_name IS 'Scraper slug associated with the log entry.';
COMMENT ON COLUMN public.scrape_job_logs.sku IS 'SKU currently being processed when the log was emitted.';
COMMENT ON COLUMN public.scrape_job_logs.phase IS 'High-level execution phase such as starting, configuring, scraping, completed, or failed.';
COMMENT ON COLUMN public.scrape_job_logs.sequence IS 'Per-job monotonic sequence number used to preserve exact runner log ordering.';
