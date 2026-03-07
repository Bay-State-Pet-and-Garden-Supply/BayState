-- Update the scrape_jobs type constraint to allow 'crawl4ai'

ALTER TABLE scrape_jobs DROP CONSTRAINT IF EXISTS scrape_jobs_type_check;
ALTER TABLE scrape_jobs ADD CONSTRAINT scrape_jobs_type_check CHECK (type IN ('standard', 'discovery', 'crawl4ai'));
