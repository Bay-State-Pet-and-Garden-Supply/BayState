-- Migration: Unified Test Architecture
-- Purpose: Add columns to scrape_jobs and scrape_job_chunks to support
-- the unified test/production architecture, eliminating the need for
-- separate scraper_test_runs tables.

-- 1. Add test_metadata to scrape_jobs
-- Stores config_id, version_id, triggered_by, test_type for test jobs
ALTER TABLE public.scrape_jobs
  ADD COLUMN IF NOT EXISTS test_metadata JSONB DEFAULT NULL;

COMMENT ON COLUMN public.scrape_jobs.test_metadata IS
  'Test-specific metadata: config_id, version_id, triggered_by, test_type. NULL for production jobs.';

-- 2. Add timeout_at to scrape_jobs
-- Enables auto-fail of stale/hanging jobs
ALTER TABLE public.scrape_jobs
  ADD COLUMN IF NOT EXISTS timeout_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.scrape_jobs.timeout_at IS
  'When set, jobs not completed by this time should be auto-failed. Used for test jobs.';

-- 3. Add telemetry JSONB to scrape_job_chunks
-- Stores step events, selector results, extraction results per chunk
ALTER TABLE public.scrape_job_chunks
  ADD COLUMN IF NOT EXISTS telemetry JSONB DEFAULT '{}';

COMMENT ON COLUMN public.scrape_job_chunks.telemetry IS
  'Telemetry data from chunk execution: steps, selectors, extractions, login results.';

-- 4. Ensure scrape_job_chunks in realtime publication (scrape_jobs already added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'scrape_job_chunks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scrape_job_chunks;
  END IF;
END $$;

-- 5. Index for fast test job lookups
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_test_mode_status
  ON public.scrape_jobs (test_mode, status)
  WHERE test_mode = true;

-- 6. Index for timeout sweeps
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_timeout_at
  ON public.scrape_jobs (timeout_at)
  WHERE timeout_at IS NOT NULL AND status IN ('pending', 'running');
