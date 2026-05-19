-- Drop ai_scraper_stats view before config_legacy column is dropped
-- This view depends on scraper_config_versions.config_legacy
DROP VIEW IF EXISTS public.ai_scraper_stats CASCADE;
