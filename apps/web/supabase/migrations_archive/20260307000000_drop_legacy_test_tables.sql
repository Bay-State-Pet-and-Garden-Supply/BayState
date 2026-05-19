-- Drop legacy test tracking tables as part of the Unified Testing Architecture migration
-- Refer to implementation plan: migrated test runs to use scrape_jobs with test_mode=true

-- Drop tables in order of dependencies (foreign keys pointing to scraper_test_runs)
DROP TABLE IF EXISTS public.scraper_extraction_results;
DROP TABLE IF EXISTS public.scraper_login_results;
DROP TABLE IF EXISTS public.scraper_selector_results;
DROP TABLE IF EXISTS public.scraper_test_run_steps;

-- Finally drop the main test runs table
DROP TABLE IF EXISTS public.scraper_test_runs;
