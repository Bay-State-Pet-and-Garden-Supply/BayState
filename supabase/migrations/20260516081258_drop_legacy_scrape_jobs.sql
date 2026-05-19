-- Drop legacy scraping tables that have been replaced by the enrichment pipeline
DROP TABLE IF EXISTS "scrape_jobs" CASCADE;
DROP TABLE IF EXISTS "scraper_runners" CASCADE;
DROP TABLE IF EXISTS "scrape_logs" CASCADE;
