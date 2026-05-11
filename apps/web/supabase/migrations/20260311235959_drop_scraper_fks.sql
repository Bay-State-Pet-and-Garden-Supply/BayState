-- Drop FK constraints that depend on scraper_config_versions
-- before the table is dropped in 20260312000002_drop_scraper_config_versions.sql
ALTER TABLE IF EXISTS public.scraper_selectors 
    DROP CONSTRAINT IF EXISTS scraper_selectors_version_id_fkey CASCADE;
ALTER TABLE IF EXISTS public.scraper_workflow_steps 
    DROP CONSTRAINT IF EXISTS scraper_workflow_steps_version_id_fkey CASCADE;
