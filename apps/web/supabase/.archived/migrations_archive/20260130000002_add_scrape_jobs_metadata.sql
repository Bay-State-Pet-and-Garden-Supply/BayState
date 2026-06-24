-- Migration: Add metadata column to scrape_jobs for test run tracking
-- Run this in Supabase SQL Editor

-- Add metadata column to scrape_jobs if it doesn't exist
ALTER TABLE public.scrape_jobs ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Add comment explaining the column
COMMENT ON COLUMN public.scrape_jobs.metadata IS 'Additional metadata for jobs, e.g., test_run_id for test jobs';
