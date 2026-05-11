-- Drop FK constraints referencing legacy scrapers table so
-- 20260221120000_drop_legacy_scraper_and_unused_tables.sql can drop it.

ALTER TABLE public.scraper_test_runs DROP CONSTRAINT IF EXISTS scraper_test_runs_scraper_id_fkey;
ALTER TABLE public.selector_suggestions DROP CONSTRAINT IF EXISTS selector_suggestions_scraper_id_fkey;
