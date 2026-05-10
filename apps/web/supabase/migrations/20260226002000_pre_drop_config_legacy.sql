-- Pre-drop dependent objects so 20260226003000 can drop config_legacy column.

-- Drop views that reference config_legacy or config
DROP VIEW IF EXISTS public.products_published CASCADE;
DROP VIEW IF EXISTS public.scraper_config_versions_view CASCADE;

-- Drop function that references config column
DROP FUNCTION IF EXISTS public.get_next_version_number(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.update_health_metrics() CASCADE;
