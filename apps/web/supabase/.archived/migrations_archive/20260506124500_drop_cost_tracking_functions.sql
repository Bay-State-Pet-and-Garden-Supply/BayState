-- Migration: Drop remaining AI cost tracking functions
-- Date: 2026-05-06
-- Purpose: Complete deprecation of costs page by removing unused DB functions

-- Drop the get_ai_cost_stats function
DROP FUNCTION IF EXISTS public.get_ai_cost_stats(DATE, DATE);

-- Ensure views are gone (they should be from previous migrations, but for safety)
DROP VIEW IF EXISTS public.ai_cost_summary_monthly;
DROP VIEW IF EXISTS public.ai_cost_summary_daily;

-- Ensure table is gone
DROP TABLE IF EXISTS public.ai_scraper_costs;

-- Drop service_costs if it exists (mentioned in some tests but not in migrations)
DROP TABLE IF EXISTS public.service_costs;

-- Final cleanup of any potential leftover types or sequences
-- (None identified in search, but good practice if any were missed)
