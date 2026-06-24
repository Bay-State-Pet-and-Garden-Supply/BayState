-- Migration: Add assertion_results JSONB column to scraper_test_runs
-- Created: 2026-04-20
-- Purpose: Store per-SKU assertion results from QA test runs
-- Part of: scraper-qa-integration plan (Task 2)

-- Add assertion_results column for structured per-SKU assertion data
-- Expected JSONB shape:
-- {
--   "sku": "ABC123",
--   "assertions": [
--     {
--       "field": "name",
--       "expected": "Product Name",
--       "actual": "Product Name",
--       "passed": true
--     }
--   ],
--   "passed": true,
--   "summary": { "total": 1, "passed": 1, "failed": 0 }
-- }
ALTER TABLE scraper_test_runs
  ADD COLUMN IF NOT EXISTS assertion_results JSONB DEFAULT '[]'::JSONB;

-- Add GIN index for JSONB containment queries (e.g., finding runs with specific assertion failures)
CREATE INDEX IF NOT EXISTS idx_test_runs_assertion_results_gin
  ON scraper_test_runs USING GIN (assertion_results);

-- Add composite index for scraper_id + created_at (common query pattern: latest runs per scraper)
-- Note: idx_test_runs_scraper on (scraper_id) and idx_test_runs_created on (created_at desc)
-- already exist from migration 20260103000000, but a composite index is more efficient for
-- "latest N runs for scraper X" queries
CREATE INDEX IF NOT EXISTS idx_test_runs_scraper_created
  ON scraper_test_runs (scraper_id, created_at DESC);

-- Add index for finding runs with assertion failures (where any assertion failed)
CREATE INDEX IF NOT EXISTS idx_test_runs_has_failures
  ON scraper_test_runs (scraper_id)
  WHERE (assertion_results IS NOT NULL
    AND jsonb_array_length(assertion_results) > 0);

COMMENT ON COLUMN scraper_test_runs.assertion_results IS 'Per-SKU assertion results from QA test runs. Array of objects with sku, assertions[], passed, and summary fields.';

-- Rollback:
-- DROP INDEX IF EXISTS idx_test_runs_has_failures;
-- DROP INDEX IF EXISTS idx_test_runs_scraper_created;
-- DROP INDEX IF EXISTS idx_test_runs_assertion_results_gin;
-- ALTER TABLE scraper_test_runs DROP COLUMN IF EXISTS assertion_results;