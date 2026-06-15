-- Remove legacy UPC-prefix cohort infrastructure.
-- Imported pipeline grouping now uses products_ingestion.brand_id directly.

BEGIN;

DROP TABLE IF EXISTS public.cohort_members CASCADE;

ALTER TABLE IF EXISTS public.products_ingestion
  DROP CONSTRAINT IF EXISTS products_ingestion_cohort_id_fkey;

DROP INDEX IF EXISTS public.idx_products_ingestion_cohort_id;

ALTER TABLE IF EXISTS public.products_ingestion
  DROP COLUMN IF EXISTS cohort_id;

ALTER TABLE IF EXISTS public.consolidation_review_requests
  DROP COLUMN IF EXISTS cohort_id;

ALTER TABLE IF EXISTS public.official_brand_url_candidates
  DROP COLUMN IF EXISTS cohort_id;

DROP TABLE IF EXISTS public.cohort_batches CASCADE;

DROP FUNCTION IF EXISTS public.update_cohort_batches_updated_at() CASCADE;

COMMIT;
