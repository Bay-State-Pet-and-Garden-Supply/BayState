-- ============================================================================
-- FIX: Broken FK References from Dropped scrapers Table
-- Created: 2026-02-25
-- ============================================================================
-- This migration fixes FK constraints that still reference the dropped 
-- `scrapers` table and updates the update_health_metrics() function to
-- reference scraper_configs directly.
-- ============================================================================

-- Step 0: Handle orphan rows before adding FK constraints
-- Some scraper_test_runs may have scraper_id values that don't exist in scraper_configs
-- (they referenced the old scrapers table). Set these to NULL.

-- Set orphan scraper_test_runs to NULL (they can't be mapped to scraper_configs)
UPDATE public.scraper_test_runs 
SET scraper_id = NULL
WHERE scraper_id IS NOT NULL 
AND NOT EXISTS (
    SELECT 1 FROM public.scraper_configs WHERE id = scraper_test_runs.scraper_id
);

-- Set orphan selector_suggestions to NULL
UPDATE public.selector_suggestions 
SET scraper_id = NULL
WHERE scraper_id IS NOT NULL 
AND NOT EXISTS (
    SELECT 1 FROM public.scraper_configs WHERE id = selector_suggestions.scraper_id
);

-- Step 1: Drop existing FK constraints that reference the dropped scrapers table
-- These constraints may or may not exist depending on prior migration state

-- Drop FK on scraper_test_runs if it exists
ALTER TABLE public.scraper_test_runs 
DROP CONSTRAINT IF EXISTS scraper_test_runs_scraper_id_fkey;

-- Drop FK on selector_suggestions if it exists  
ALTER TABLE public.selector_suggestions 
DROP CONSTRAINT IF EXISTS selector_suggestions_scraper_id_fkey;

-- Step 2: Add new FK constraints pointing to scraper_configs

-- Add FK to scraper_test_runs.scraper_id -> scraper_configs.id
ALTER TABLE public.scraper_test_runs 
ADD CONSTRAINT scraper_test_runs_scraper_id_fkey 
FOREIGN KEY (scraper_id) 
REFERENCES public.scraper_configs(id) 
ON DELETE CASCADE;

-- Add FK to selector_suggestions.scraper_id -> scraper_configs.id
ALTER TABLE public.selector_suggestions 
ADD CONSTRAINT selector_suggestions_scraper_id_fkey 
FOREIGN KEY (scraper_id) 
REFERENCES public.scraper_configs(id) 
ON DELETE SET NULL;

-- Step 3: Update the update_health_metrics() function to use scraper_configs directly
-- The old version joined through the dropped `scrapers` table

CREATE OR REPLACE FUNCTION public.update_health_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.scraper_health_metrics (
        config_id,
        metric_date,
        total_runs,
        passed_runs,
        failed_runs,
        avg_duration_ms,
        selector_health,
        updated_at
    )
    SELECT 
        sc.id AS config_id,
        DATE(str.created_at) AS metric_date,
        COUNT(*) AS total_runs,
        COUNT(*) FILTER (WHERE str.status = 'passed') AS passed_runs,
        COUNT(*) FILTER (WHERE str.status = 'failed') AS failed_runs,
        AVG(str.duration_ms)::INTEGER AS avg_duration_ms,
        '{}'::JSONB AS selector_health,
        NOW() AS updated_at
    FROM public.scraper_test_runs str
    -- FIXED: Join directly to scraper_configs instead of through dropped scrapers table
    JOIN public.scraper_configs sc ON str.scraper_id = sc.id
    WHERE str.created_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY sc.id, DATE(str.created_at)
    ON CONFLICT (config_id, metric_date) 
    DO UPDATE SET
        total_runs = EXCLUDED.total_runs,
        passed_runs = EXCLUDED.passed_runs,
        failed_runs = EXCLUDED.failed_runs,
        avg_duration_ms = EXCLUDED.avg_duration_ms,
        selector_health = EXCLUDED.selector_health,
        updated_at = NOW();
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_health_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_health_metrics() TO service_role;

-- Verify the function works (will return void or error)
-- SELECT * FROM update_health_metrics();

-- Add comment documenting the fix
COMMENT ON FUNCTION public.update_health_metrics() IS 'Aggregates daily health metrics from scraper_test_runs for trend analysis. Fixed 2026-02-25 to join scraper_configs directly instead of through dropped scrapers table.';
