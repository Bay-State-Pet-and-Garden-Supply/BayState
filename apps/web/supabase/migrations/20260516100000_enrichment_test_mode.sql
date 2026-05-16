-- Add test_mode and test_metadata to enrichment_jobs
-- This enables using the enrichment pipeline for testing (e.g. Scraper Studio)
-- without side effects on the production product ingestion table.

ALTER TABLE public.enrichment_jobs 
ADD COLUMN IF NOT EXISTS test_mode boolean NOT NULL DEFAULT false;

ALTER TABLE public.enrichment_jobs 
ADD COLUMN IF NOT EXISTS test_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Update the enrichment-callback route logic will be handled in code, 
-- but we should ensure these columns are available for the callback to check.
