-- Migration: Add details column to scrape_job_logs
-- Purpose: Support optional JSON details for structured logs

ALTER TABLE public.scrape_job_logs
    ADD COLUMN IF NOT EXISTS details jsonb;

COMMENT ON COLUMN public.scrape_job_logs.details IS 'Optional structured JSON details from runner logs';
