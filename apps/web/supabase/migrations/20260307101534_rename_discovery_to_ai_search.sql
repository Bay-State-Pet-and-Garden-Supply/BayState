-- Rename existing jobs to ai_search
UPDATE scrape_jobs SET type = 'ai_search' WHERE type IN ('discovery', 'crawl4ai');

-- Update the constraint on scrape_jobs
ALTER TABLE scrape_jobs DROP CONSTRAINT IF EXISTS scrape_jobs_type_check;
ALTER TABLE scrape_jobs ADD CONSTRAINT scrape_jobs_type_check CHECK (type IN ('standard', 'ai_search'));
