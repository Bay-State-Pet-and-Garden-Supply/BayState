-- Migration: Add AI cost tracking table
-- Date: 2026-02-19
-- Purpose: Track costs and usage for AI-powered scrapers

-- =============================================================================
-- Table: ai_scraper_costs
-- Tracks per-run costs for AI scraper operations
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ai_scraper_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID REFERENCES public.scraper_configs(id) ON DELETE SET NULL,
    version_id UUID REFERENCES public.scraper_config_versions(id) ON DELETE SET NULL,
    run_id UUID,  -- Could reference scraper_test_runs or scrape_jobs in future
    run_type TEXT NOT NULL DEFAULT 'test' CHECK (run_type IN ('test', 'production', 'validation')),
    
    -- Cost breakdown
    total_cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    step_count INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER,
    
    -- AI configuration snapshot
    llm_model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    use_vision BOOLEAN NOT NULL DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ai_scraper_costs_config 
ON public.ai_scraper_costs(config_id);

CREATE INDEX IF NOT EXISTS idx_ai_scraper_costs_created 
ON public.ai_scraper_costs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_scraper_costs_run_type 
ON public.ai_scraper_costs(run_type);

-- =============================================================================
-- View: ai_cost_summary_daily
-- Daily aggregated cost summaries
-- =============================================================================
CREATE OR REPLACE VIEW public.ai_cost_summary_daily AS
SELECT 
    DATE(created_at) AS date,
    run_type,
    llm_model,
    COUNT(*) AS run_count,
    SUM(total_cost_usd) AS total_cost,
    SUM(input_tokens) AS total_input_tokens,
    SUM(output_tokens) AS total_output_tokens,
    AVG(total_cost_usd) AS avg_cost_per_run,
    AVG(duration_ms) AS avg_duration_ms
FROM public.ai_scraper_costs
GROUP BY DATE(created_at), run_type, llm_model
ORDER BY DATE(created_at) DESC;

-- =============================================================================
-- View: ai_cost_summary_monthly
-- Monthly aggregated cost summaries
-- =============================================================================
CREATE OR REPLACE VIEW public.ai_cost_summary_monthly AS
SELECT 
    DATE_TRUNC('month', created_at) AS month,
    run_type,
    llm_model,
    COUNT(*) AS run_count,
    SUM(total_cost_usd) AS total_cost,
    SUM(input_tokens) AS total_input_tokens,
    SUM(output_tokens) AS total_output_tokens,
    AVG(total_cost_usd) AS avg_cost_per_run
FROM public.ai_scraper_costs
GROUP BY DATE_TRUNC('month', created_at), run_type, llm_model
ORDER BY DATE_TRUNC('month', created_at) DESC;

-- =============================================================================
-- Function: get_ai_cost_stats
-- Get cost statistics for a date range
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_ai_cost_stats(
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    total_cost DECIMAL,
    total_runs BIGINT,
    avg_cost_per_run DECIMAL,
    total_input_tokens BIGINT,
    total_output_tokens BIGINT
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(total_cost_usd), 0)::DECIMAL,
        COUNT(*)::BIGINT,
        COALESCE(AVG(total_cost_usd), 0)::DECIMAL,
        COALESCE(SUM(input_tokens), 0)::BIGINT,
        COALESCE(SUM(output_tokens), 0)::BIGINT
    FROM public.ai_scraper_costs
    WHERE DATE(created_at) BETWEEN p_start_date AND p_end_date;
END;
$$;

-- =============================================================================
-- Enable RLS
-- =============================================================================
ALTER TABLE public.ai_scraper_costs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admin and staff can view AI costs"
    ON public.ai_scraper_costs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

CREATE POLICY "Service role can manage AI costs"
    ON public.ai_scraper_costs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON public.ai_cost_summary_daily TO authenticated;
GRANT SELECT ON public.ai_cost_summary_monthly TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_cost_stats(DATE, DATE) TO authenticated;
GRANT SELECT ON public.ai_cost_summary_daily TO service_role;
GRANT SELECT ON public.ai_cost_summary_monthly TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_cost_stats(DATE, DATE) TO service_role;

-- Comments
COMMENT ON TABLE public.ai_scraper_costs IS 'Tracks costs for AI-powered scraper operations';
COMMENT ON VIEW public.ai_cost_summary_daily IS 'Daily aggregated AI scraper costs';
COMMENT ON VIEW public.ai_cost_summary_monthly IS 'Monthly aggregated AI scraper costs';
COMMENT ON FUNCTION public.get_ai_cost_stats IS 'Get AI cost statistics for a date range';
