-- Migration: Create scraper_test_results table
-- Created: 2026-01-24
-- Purpose: Store test results for scraper configurations
-- Note: Uses existing scraper_test_runs table structure

-- Create the scraper_test_results table (uses existing scraper_test_runs table structure)
-- This table stores test results with full details for history tracking

-- Add columns to scraper_test_runs if they don't exist
ALTER TABLE scraper_test_runs ADD COLUMN IF NOT EXISTS result_data JSONB;

-- Create a function to update scraper health from test results
CREATE OR REPLACE FUNCTION update_scraper_health_from_test(
  p_scraper_id UUID,
  p_status TEXT,
  p_result_data JSONB DEFAULT NULL::JSONB
)
RETURNS void AS $$
DECLARE
  test_passed INT := 0;
  test_total INT := 0;
  fake_passed INT := 0;
  fake_total INT := 0;
  score INT := 0;
  health_status TEXT := 'unknown';
BEGIN
  -- Calculate score from result_data if provided
  IF p_result_data IS NOT NULL AND p_result_data ? 'summary' THEN
    -- Extract summary data from the new format
    test_total := (p_result_data->'summary'->>'total')::INT;
    test_passed := (p_result_data->'summary'->>'success')::INT;
    
    IF test_total > 0 THEN
      score := ((test_passed::FLOAT / test_total::FLOAT) * 100)::INT;
    END IF;
    
    IF score >= 90 THEN
      health_status := 'healthy';
    ELSIF score >= 60 THEN
      health_status := 'degraded';
    ELSE
      health_status := 'broken';
    END IF;
  ELSE
    -- Use legacy calculation from scraper_test_runs.results
    SELECT 
      COUNT(*) FILTER (WHERE (r->>'sku_type') = 'test' AND (r->>'status') = 'success'),
      COUNT(*) FILTER (WHERE (r->>'sku_type') = 'test'),
      COUNT(*) FILTER (WHERE (r->>'sku_type') = 'fake' AND (r->>'status') = 'no_results'),
      COUNT(*) FILTER (WHERE (r->>'sku_type') = 'fake')
    INTO test_passed, test_total, fake_passed, fake_total
    FROM jsonb_array_elements(
      (SELECT results FROM scraper_test_runs 
       WHERE scraper_id = p_scraper_id 
       ORDER BY created_at DESC LIMIT 1)
    ) r;
    
    IF test_total > 0 THEN
      score := score + ((test_passed::FLOAT / test_total::FLOAT) * 70)::INT;
    END IF;
    
    IF fake_total > 0 THEN
      score := score + ((fake_passed::FLOAT / fake_total::FLOAT) * 30)::INT;
    ELSE
      score := score + 30;
    END IF;
    
    IF score >= 90 THEN
      health_status := 'healthy';
    ELSIF score >= 60 THEN
      health_status := 'degraded';
    ELSE
      health_status := 'broken';
    END IF;
  END IF;

  -- Update scrapers.health_status
  UPDATE scrapers
  SET 
    health_status = health_status,
    health_score = score,
    updated_at = NOW()
  WHERE id = p_scraper_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute on the function
GRANT EXECUTE ON FUNCTION update_scraper_health_from_test(UUID, TEXT, JSONB) TO authenticated;

COMMENT ON TABLE scraper_test_runs IS 'History of scraper test executions with per-SKU results. Extended with result_data column for detailed JSON results.';
COMMENT ON FUNCTION update_scraper_health_from_test IS 'Calculates and updates health status based on test results. Supports both legacy and new result formats.';
