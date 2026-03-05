-- Migration: Add metadata column to scraper_test_runs
-- Purpose: Store additional test run metadata (config_id, version_id, priority, job_id)

ALTER TABLE scraper_test_runs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB;

-- Also add 'studio' as a valid test_type if not already present
ALTER TABLE scraper_test_runs DROP CONSTRAINT IF EXISTS scraper_test_runs_test_type_check;
ALTER TABLE scraper_test_runs ADD CONSTRAINT scraper_test_runs_test_type_check 
  CHECK (test_type IN ('manual', 'scheduled', 'health_check', 'validation', 'studio'));

COMMENT ON COLUMN scraper_test_runs.metadata IS 'Additional metadata for test runs: config_id, version_id, triggered_by, priority, job_id';
