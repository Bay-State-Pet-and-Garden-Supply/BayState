-- ============================================================================
-- FIX: update_health_metrics() function references dropped scrapers table
-- Created: 2026-02-26
-- ============================================================================
-- The original function joined scraper_test_runs -> scrapers -> scraper_configs.
-- The `scrapers` table has been dropped; scraper_test_runs.scraper_id now
-- references scraper_configs.id directly.
-- ============================================================================

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

-- Grant execute to authenticated users (admin/staff will have access via RLS)
GRANT EXECUTE ON FUNCTION public.update_health_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_health_metrics() TO service_role;

COMMENT ON FUNCTION public.update_health_metrics() IS 'Aggregates daily health metrics from scraper_test_runs for trend analysis. Call on-demand or via scheduled job.';
