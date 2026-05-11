-- Drop ai_scraper_stats view before security lint migration recreates it
-- scraper_config_versions table no longer exists
DROP VIEW IF EXISTS public.ai_scraper_stats;
