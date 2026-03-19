-- Migration: Add pipeline_status_new column to products_ingestion table
-- Purpose: New simplified pipeline status with 3 states: registered, enriched, finalized
-- Mapping:
--   - staging → registered
--   - scraped → enriched
--   - consolidated → finalized
--   - approved → finalized
--   - published → finalized
--   - failed → registered (for retry)

BEGIN;

-- Create new enum type for pipeline status
CREATE TYPE pipeline_status_new_enum AS ENUM ('registered', 'enriched', 'finalized');

-- Add new column with enum type
ALTER TABLE public.products_ingestion 
ADD COLUMN IF NOT EXISTS pipeline_status_new pipeline_status_new_enum;

-- Migrate existing data from old status to new status
UPDATE public.products_ingestion
SET pipeline_status_new = 'registered'
WHERE pipeline_status = 'staging'
  OR pipeline_status = 'failed';

UPDATE public.products_ingestion
SET pipeline_status_new = 'enriched'
WHERE pipeline_status = 'scraped';

UPDATE public.products_ingestion
SET pipeline_status_new = 'finalized'
WHERE pipeline_status = 'consolidated'
  OR pipeline_status = 'approved'
  OR pipeline_status = 'published';

-- Add index for efficient queries on new status column
CREATE INDEX IF NOT EXISTS idx_products_ingestion_pipeline_status_new 
ON public.products_ingestion(pipeline_status_new);

-- Add comment describing the column
COMMENT ON COLUMN public.products_ingestion.pipeline_status_new IS 'New simplified pipeline status: registered (initial), enriched (scraped data added), finalized (ready for storefront).';

-- Add NOT NULL constraint after all data is migrated
ALTER TABLE public.products_ingestion 
ALTER COLUMN pipeline_status_new SET NOT NULL;

COMMIT;
