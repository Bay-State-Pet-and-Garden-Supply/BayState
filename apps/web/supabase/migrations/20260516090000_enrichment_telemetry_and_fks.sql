-- Add telemetry and progress columns to enrichment_jobs to support dashboard tracking
ALTER TABLE public.enrichment_jobs
ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
ADD COLUMN IF NOT EXISTS last_event_at timestamptz,
ADD COLUMN IF NOT EXISTS last_log_at timestamptz,
ADD COLUMN IF NOT EXISTS last_log_level text,
ADD COLUMN IF NOT EXISTS last_log_message text,
ADD COLUMN IF NOT EXISTS progress_percent integer,
ADD COLUMN IF NOT EXISTS progress_message text,
ADD COLUMN IF NOT EXISTS progress_phase text,
ADD COLUMN IF NOT EXISTS progress_details jsonb,
ADD COLUMN IF NOT EXISTS progress_updated_at timestamptz,
ADD COLUMN IF NOT EXISTS current_sku text,
ADD COLUMN IF NOT EXISTS items_processed integer,
ADD COLUMN IF NOT EXISTS items_total integer;

-- Update foreign keys for legacy logging and runner tracking
-- First, drop existing FKs that point to scrape_jobs
ALTER TABLE IF EXISTS public.scrape_job_logs
DROP CONSTRAINT IF EXISTS scrape_job_logs_job_id_fkey;

ALTER TABLE IF EXISTS public.scraper_runners
DROP CONSTRAINT IF EXISTS scraper_runners_current_job_id_fkey;

-- Add new FKs pointing to enrichment_jobs
ALTER TABLE public.scrape_job_logs
ADD CONSTRAINT scrape_job_logs_job_id_fkey
FOREIGN KEY (job_id) REFERENCES public.enrichment_jobs(id) ON DELETE CASCADE;

ALTER TABLE public.scraper_runners
ADD CONSTRAINT scraper_runners_current_job_id_fkey
FOREIGN KEY (current_job_id) REFERENCES public.enrichment_jobs(id) ON DELETE SET NULL;
