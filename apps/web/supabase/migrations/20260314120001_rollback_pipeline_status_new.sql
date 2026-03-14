-- Rollback: Remove pipeline_status_new column from products_ingestion table
-- Purpose: Revert the pipeline_status_new migration if needed

BEGIN;

-- Drop NOT NULL constraint first
ALTER TABLE public.products_ingestion 
ALTER COLUMN pipeline_status_new DROP NOT NULL;

-- Drop index
DROP INDEX IF EXISTS idx_products_ingestion_pipeline_status_new;

-- Drop column
ALTER TABLE public.products_ingestion 
DROP COLUMN IF EXISTS pipeline_status_new;

-- Drop enum type
DROP TYPE IF EXISTS pipeline_status_new_enum;

COMMIT;
