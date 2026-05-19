-- Migration: Add pipeline_status column with five-stage enum
-- Purpose: Five-stage pipeline status: imported, scraped, consolidated, finalized, published
-- Mapping from existing pipeline_status_new:
--   - registered → imported
--   - enriched → scraped
--   - finalized → finalized (keep)
-- Rollback: DROP COLUMN IF EXISTS pipeline_status; DROP TYPE IF EXISTS pipeline_status_five;

BEGIN;

-- Create new enum type for five-stage pipeline status
CREATE TYPE pipeline_status_five AS ENUM ('imported', 'scraped', 'consolidated', 'finalized', 'published');

-- Add new column with enum type
ALTER TABLE public.products_ingestion 
ADD COLUMN IF NOT EXISTS pipeline_status pipeline_status_five;

-- Migrate existing data from pipeline_status_new to new five-stage status
UPDATE public.products_ingestion
SET pipeline_status = 'imported'
WHERE pipeline_status_new = 'registered';

UPDATE public.products_ingestion
SET pipeline_status = 'scraped'
WHERE pipeline_status_new = 'enriched';

UPDATE public.products_ingestion
SET pipeline_status = 'finalized'
WHERE pipeline_status_new = 'finalized';

-- Add index for efficient queries on new status column
CREATE INDEX IF NOT EXISTS idx_products_ingestion_pipeline_status 
ON public.products_ingestion(pipeline_status);

-- Add comment describing the column
COMMENT ON COLUMN public.products_ingestion.pipeline_status IS 'Five-stage pipeline status: imported (initial), scraped (data collected), consolidated (AI processed), finalized (approved), published (live on storefront).';

-- Add NOT NULL constraint after all data is migrated
ALTER TABLE public.products_ingestion 
ALTER COLUMN pipeline_status SET NOT NULL;

COMMIT;
