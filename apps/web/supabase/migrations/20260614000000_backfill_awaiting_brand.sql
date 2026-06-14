-- Backfill brandless imported products to awaiting_brand
--
-- The awaiting_brand status is a sub-status of imported for products
-- without an assigned brand. This migration ensures existing products
-- that entered the pipeline before awaiting_brand was actively set
-- are correctly classified.
--
-- Pre-flight preview:
--   SELECT COUNT(*) AS affected_rows FROM products_ingestion
--   WHERE pipeline_status = 'imported' AND brand_id IS NULL;
--
-- Post-apply verification:
--   SELECT pipeline_status, COUNT(*) FROM products_ingestion
--   WHERE brand_id IS NULL
--   GROUP BY pipeline_status;

BEGIN;

UPDATE products_ingestion
SET pipeline_status = 'awaiting_brand',
    updated_at = NOW()
WHERE pipeline_status = 'imported'
  AND brand_id IS NULL;

COMMIT;

-- Rollback:
-- BEGIN;
-- UPDATE products_ingestion
-- SET pipeline_status = 'imported',
--     updated_at = NOW()
-- WHERE pipeline_status = 'awaiting_brand'
--   AND brand_id IS NULL;
-- COMMIT;
