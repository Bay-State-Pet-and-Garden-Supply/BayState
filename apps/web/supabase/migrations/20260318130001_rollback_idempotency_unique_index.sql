-- Rollback: Remove idempotency unique index from scrape_results

BEGIN;

DROP INDEX IF EXISTS idx_scrape_results_idempotency_key;
DROP INDEX IF EXISTS idx_scrape_results_data_gin;

COMMIT;
