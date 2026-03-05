-- Add type column to scrape_jobs table
-- Required for pipeline-scraping.ts which inserts type: 'standard' | 'discovery'

ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'standard' CHECK (type IN ('standard', 'discovery'));
