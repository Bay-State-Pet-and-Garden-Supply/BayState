-- ============================================================================
-- CLEANUP: Drop legacy scraper tables and unused AI cost tracking
-- ============================================================================
-- This migration removes:
-- 1. scrapers (legacy) - replaced by scraper_configs + scraper_config_versions
-- 2. scraper_extraction_results, scraper_login_results, scraper_selector_results 
--    - empty tables that reference legacy scrapers table
-- 3. ai_scraper_costs + related views - unused AI cost tracking
-- ============================================================================

-- Drop views that depend on ai_scraper_costs
DROP VIEW IF EXISTS public.ai_cost_summary_monthly;
DROP VIEW IF EXISTS public.ai_cost_summary_daily;

-- Drop policies on ai_scraper_costs
DROP POLICY IF EXISTS "Admin and staff can view AI costs" ON public.ai_scraper_costs;
DROP POLICY IF EXISTS "Service role can manage AI costs" ON public.ai_scraper_costs;

-- Drop ai_scraper_costs (empty, no code references)
DROP TABLE IF EXISTS public.ai_scraper_costs;

-- Drop tables that reference legacy scrapers table (all empty)
DROP TABLE IF EXISTS public.scraper_extraction_results;
DROP TABLE IF EXISTS public.scraper_login_results;
DROP TABLE IF EXISTS public.scraper_selector_results;

-- Drop policies on scrapers
DROP POLICY IF EXISTS "Allow all on scrapers" ON public.scrapers;

-- Drop legacy scrapers table (replaced by scraper_configs)
DROP TABLE IF EXISTS public.scrapers;
