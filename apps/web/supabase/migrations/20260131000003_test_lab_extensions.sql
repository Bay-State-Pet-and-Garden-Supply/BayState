-- Migration: Test Lab Schema Extensions
-- Created: 2026-01-31
-- Purpose: Add tables and columns for real-time Test Lab updates
-- Includes: selector validation, login status, extraction results

-- =============================================================================
-- TABLE: scraper_selector_results
-- Stores individual selector validation results during test runs
-- =============================================================================

CREATE TABLE IF NOT EXISTS scraper_selector_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID NOT NULL REFERENCES scraper_test_runs(id) ON DELETE CASCADE,
    scraper_id UUID NOT NULL REFERENCES scrapers(id) ON DELETE CASCADE,
    sku VARCHAR(255) NOT NULL,
    selector_name VARCHAR(255) NOT NULL,
    selector_value TEXT NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('FOUND', 'MISSING', 'ERROR', 'SKIPPED')),
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying selector results by test run
CREATE INDEX IF NOT EXISTS idx_selector_results_test_run
    ON scraper_selector_results(test_run_id);

-- Index for querying selector results by scraper
CREATE INDEX IF NOT EXISTS idx_selector_results_scraper
    ON scraper_selector_results(scraper_id);

-- Index for querying selector results by status
CREATE INDEX IF NOT EXISTS idx_selector_results_status
    ON scraper_selector_results(status);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_selector_results_scraper_sku
    ON scraper_selector_results(scraper_id, sku);

-- =============================================================================
-- TABLE: scraper_login_results
-- Stores login validation results during test runs
-- =============================================================================

CREATE TABLE IF NOT EXISTS scraper_login_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID NOT NULL REFERENCES scraper_test_runs(id) ON DELETE CASCADE,
    scraper_id UUID NOT NULL REFERENCES scrapers(id) ON DELETE CASCADE,
    sku VARCHAR(255) NOT NULL,
    username_field_status VARCHAR(50),
    password_field_status VARCHAR(50),
    submit_button_status VARCHAR(50),
    success_indicator_status VARCHAR(50),
    overall_status VARCHAR(50) NOT NULL CHECK (overall_status IN ('SUCCESS', 'FAILED', 'SKIPPED', 'ERROR')),
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying login results by test run
CREATE INDEX IF NOT EXISTS idx_login_results_test_run
    ON scraper_login_results(test_run_id);

-- Index for querying login results by scraper
CREATE INDEX IF NOT EXISTS idx_login_results_scraper
    ON scraper_login_results(scraper_id);

-- =============================================================================
-- TABLE: scraper_extraction_results
-- Stores field-level extraction results during test runs
-- =============================================================================

CREATE TABLE IF NOT EXISTS scraper_extraction_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID NOT NULL REFERENCES scraper_test_runs(id) ON DELETE CASCADE,
    scraper_id UUID NOT NULL REFERENCES scrapers(id) ON DELETE CASCADE,
    sku VARCHAR(255) NOT NULL,
    field_name VARCHAR(255) NOT NULL,
    field_value TEXT,
    status VARCHAR(50) NOT NULL CHECK (status IN ('SUCCESS', 'EMPTY', 'ERROR', 'NOT_FOUND')),
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying extraction results by test run
CREATE INDEX IF NOT EXISTS idx_extraction_results_test_run
    ON scraper_extraction_results(test_run_id);

-- Index for querying extraction results by scraper
CREATE INDEX IF NOT EXISTS idx_extraction_results_scraper
    ON scraper_extraction_results(scraper_id);

-- Index for querying extraction results by field name
CREATE INDEX IF NOT EXISTS idx_extraction_results_field
    ON scraper_extraction_results(field_name);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_extraction_results_scraper_sku_field
    ON scraper_extraction_results(scraper_id, sku, field_name);

-- =============================================================================
-- COLUMNS: Add to scraper_test_runs
-- Extended tracking for test run metadata
-- =============================================================================

-- Add selector results summary column
ALTER TABLE scraper_test_runs ADD COLUMN IF NOT EXISTS selector_results JSONB;

-- Add login results summary column
ALTER TABLE scraper_test_runs ADD COLUMN IF NOT EXISTS login_results JSONB;

-- Add extraction results summary column
ALTER TABLE scraper_test_runs ADD COLUMN IF NOT EXISTS extraction_results JSONB;

-- Add test run duration tracking
ALTER TABLE scraper_test_runs ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

-- Add updated_at for tracking changes
ALTER TABLE scraper_test_runs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Update updated_at trigger
CREATE OR REPLACE FUNCTION update_scraper_test_runs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS trigger_scraper_test_runs_updated ON scraper_test_runs;

-- Create trigger
CREATE TRIGGER trigger_scraper_test_runs_updated
    BEFORE UPDATE ON scraper_test_runs
    FOR EACH ROW
    EXECUTE FUNCTION update_scraper_test_runs_timestamp();

-- =============================================================================
-- FUNCTIONS: Helper functions for test results
-- =============================================================================

-- Function to calculate selector health score from results
CREATE OR REPLACE FUNCTION calculate_selector_health(
    p_test_run_id UUID
) RETURNS INTEGER AS $$
DECLARE
    total_count INTEGER := 0;
    found_count INTEGER := 0;
    health_score INTEGER := 0;
BEGIN
    SELECT
        COUNT(*) INTO total_count,
        COUNT(*) FILTER (WHERE status = 'FOUND') INTO found_count
    FROM scraper_selector_results
    WHERE test_run_id = p_test_run_id;

    IF total_count > 0 THEN
        health_score := (found_count::FLOAT / total_count::FLOAT * 100)::INTEGER;
    END IF;

    RETURN health_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get test run summary
CREATE OR REPLACE FUNCTION get_test_run_summary(
    p_test_run_id UUID
) RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'selector_health', calculate_selector_health(p_test_run_id),
        'selector_total', (SELECT COUNT(*) FROM scraper_selector_results WHERE test_run_id = p_test_run_id),
        'login_status', (SELECT overall_status FROM scraper_login_results WHERE test_run_id = p_test_run_id LIMIT 1),
        'extraction_fields', (SELECT COUNT(DISTINCT field_name) FROM scraper_extraction_results WHERE test_run_id = p_test_run_id),
        'extraction_success_rate', (
            SELECT
                CASE WHEN COUNT(*) > 0
                THEN (COUNT(*) FILTER (WHERE status = 'SUCCESS')::FLOAT / COUNT(*) * 100)::INTEGER
                ELSE 100 END
            FROM scraper_extraction_results
            WHERE test_run_id = p_test_run_id
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- RLS POLICIES: Security for test results
-- =============================================================================

-- Enable RLS on new tables
ALTER TABLE scraper_selector_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_login_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_extraction_results ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users (read own org data)
CREATE POLICY IF NOT EXISTS "Users can view selector results for their organization"
    ON scraper_selector_results FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM scrapers s
            WHERE s.id = scraper_selector_results.scraper_id
            AND s.organization_id IN (
                SELECT organization_id FROM profiles WHERE auth_user_id = auth.uid()
            )
        )
    );

CREATE POLICY IF NOT EXISTS "Users can view login results for their organization"
    ON scraper_login_results FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM scrapers s
            WHERE s.id = scraper_login_results.scraper_id
            AND s.organization_id IN (
                SELECT organization_id FROM profiles WHERE auth_user_id = auth.uid()
            )
        )
    );

CREATE POLICY IF NOT EXISTS "Users can view extraction results for their organization"
    ON scraper_extraction_results FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM scrapers s
            WHERE s.id = scraper_extraction_results.scraper_id
            AND s.organization_id IN (
                SELECT organization_id FROM profiles WHERE auth_user_id = auth.uid()
            )
        )
    );

-- Policy for service role (full access for background jobs)
CREATE POLICY IF NOT EXISTS "Service role can manage all test results"
    ON scraper_selector_results FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY IF NOT EXISTS "Service role can manage all login results"
    ON scraper_login_results FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY IF NOT EXISTS "Service role can manage all extraction results"
    ON scraper_extraction_results FOR ALL
    USING (auth.role() = 'service_role');

-- =============================================================================
-- COMMENTS: Documentation
-- =============================================================================

COMMENT ON TABLE scraper_selector_results IS 'Individual selector validation results during test runs. Used for real-time Test Lab updates.';
COMMENT ON TABLE scraper_login_results IS 'Login validation results during test runs. Tracks username, password, submit button, and success indicator status.';
COMMENT ON TABLE scraper_extraction_results IS 'Field-level extraction results during test runs. Tracks success/failure for each extracted field.';

COMMENT ON COLUMN scraper_test_runs.selector_results IS 'JSON summary of selector validation results';
COMMENT ON COLUMN scraper_test_runs.login_results IS 'JSON summary of login validation results';
COMMENT ON COLUMN scraper_test_runs.extraction_results IS 'JSON summary of extraction field results';
COMMENT ON COLUMN scraper_test_runs.duration_ms IS 'Total test run duration in milliseconds';
