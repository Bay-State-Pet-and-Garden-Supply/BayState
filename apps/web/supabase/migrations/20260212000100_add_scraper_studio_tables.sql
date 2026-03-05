-- Migration: Add Test SKU and Health Metrics tables for Scraper Studio
-- Created: 2026-02-12
-- Purpose: Support custom test SKU overrides and aggregated health metrics for scraper trend analysis

-- =============================================================================
-- Table 1: scraper_config_test_skus
-- Custom test SKU overrides per config (test, fake, edge_case SKUs)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.scraper_config_test_skus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES public.scraper_configs(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    sku_type TEXT NOT NULL CHECK (sku_type IN ('test', 'fake', 'edge_case')),
    added_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_config_sku UNIQUE (config_id, sku)
);

-- Index for fast lookups by config_id
CREATE INDEX IF NOT EXISTS idx_scraper_config_test_skus_config_id 
ON public.scraper_config_test_skus(config_id);

-- Index for filtering by SKU type
CREATE INDEX IF NOT EXISTS idx_scraper_config_test_skus_type 
ON public.scraper_config_test_skus(config_id, sku_type);

-- Comments for documentation
COMMENT ON TABLE public.scraper_config_test_skus IS 'Custom test SKU overrides per scraper config. Supports test, fake, and edge_case SKU types for validation.';
COMMENT ON COLUMN public.scraper_config_test_skus.config_id IS 'Foreign key to scraper_configs table';
COMMENT ON COLUMN public.scraper_config_test_skus.sku IS 'The SKU value to test';
COMMENT ON COLUMN public.scraper_config_test_skus.sku_type IS 'Type: test (should succeed), fake (should fail gracefully), edge_case (boundary testing)';
COMMENT ON COLUMN public.scraper_config_test_skus.added_by IS 'User who added this test SKU';

-- =============================================================================
-- Table 2: scraper_health_metrics
-- Aggregated health data for trend analysis
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.scraper_health_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES public.scraper_configs(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    total_runs INTEGER NOT NULL DEFAULT 0,
    passed_runs INTEGER NOT NULL DEFAULT 0,
    failed_runs INTEGER NOT NULL DEFAULT 0,
    avg_duration_ms INTEGER,
    top_failing_step TEXT,
    selector_health JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_config_metric_date UNIQUE (config_id, metric_date)
);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_scraper_health_metrics_config_date 
ON public.scraper_health_metrics(config_id, metric_date DESC);

-- Index for recent metrics lookup
CREATE INDEX IF NOT EXISTS idx_scraper_health_metrics_date 
ON public.scraper_health_metrics(metric_date DESC);

-- Comments for documentation
COMMENT ON TABLE public.scraper_health_metrics IS 'Aggregated daily health metrics for scraper trend analysis and monitoring dashboards.';
COMMENT ON COLUMN public.scraper_health_metrics.config_id IS 'Foreign key to scraper_configs table';
COMMENT ON COLUMN public.scraper_health_metrics.metric_date IS 'Date of the aggregated metrics';
COMMENT ON COLUMN public.scraper_health_metrics.total_runs IS 'Total number of test runs on this date';
COMMENT ON COLUMN public.scraper_health_metrics.passed_runs IS 'Number of runs that passed completely';
COMMENT ON COLUMN public.scraper_health_metrics.failed_runs IS 'Number of runs that failed';
COMMENT ON COLUMN public.scraper_health_metrics.avg_duration_ms IS 'Average test run duration in milliseconds';
COMMENT ON COLUMN public.scraper_health_metrics.top_failing_step IS 'Most frequently failing workflow step on this date';
COMMENT ON COLUMN public.scraper_health_metrics.selector_health IS 'JSON object with selector health scores and statuses';

-- =============================================================================
-- Enable RLS on both tables
-- =============================================================================
ALTER TABLE public.scraper_config_test_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraper_health_metrics ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS Policies for scraper_config_test_skus
-- =============================================================================

-- SELECT: Admin/Staff can view all test SKUs
CREATE POLICY "Admin and staff can view test SKUs"
    ON public.scraper_config_test_skus
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- INSERT: Admin/Staff can add test SKUs
CREATE POLICY "Admin and staff can add test SKUs"
    ON public.scraper_config_test_skus
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- UPDATE: Admin/Staff can update test SKUs they created or all if admin
CREATE POLICY "Admin and staff can update test SKUs"
    ON public.scraper_config_test_skus
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- DELETE: Admin/Staff can delete test SKUs
CREATE POLICY "Admin and staff can delete test SKUs"
    ON public.scraper_config_test_skus
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- Service role bypass for all operations
CREATE POLICY "Service role can manage test SKUs"
    ON public.scraper_config_test_skus
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- RLS Policies for scraper_health_metrics
-- =============================================================================

-- SELECT: Admin/Staff can view all health metrics
CREATE POLICY "Admin and staff can view health metrics"
    ON public.scraper_health_metrics
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- INSERT: Admin/Staff and service role can insert health metrics
CREATE POLICY "Admin and staff can add health metrics"
    ON public.scraper_health_metrics
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- UPDATE: Admin/Staff can update health metrics
CREATE POLICY "Admin and staff can update health metrics"
    ON public.scraper_health_metrics
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- DELETE: Only admins can delete health metrics
CREATE POLICY "Admins can delete health metrics"
    ON public.scraper_health_metrics
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Service role bypass for all operations
CREATE POLICY "Service role can manage health metrics"
    ON public.scraper_health_metrics
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- Function: update_health_metrics()
-- Aggregates health metrics from scraper_test_runs for trend analysis
-- =============================================================================
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
    JOIN public.scrapers s ON str.scraper_id = s.id
    JOIN public.scraper_configs sc ON s.name = sc.slug
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

-- =============================================================================
-- Trigger function for updated_at on scraper_health_metrics
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_health_metrics_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scraper_health_metrics_updated_at_trigger ON public.scraper_health_metrics;
CREATE TRIGGER scraper_health_metrics_updated_at_trigger
    BEFORE UPDATE ON public.scraper_health_metrics
    FOR EACH ROW
    EXECUTE FUNCTION public.update_health_metrics_updated_at();
