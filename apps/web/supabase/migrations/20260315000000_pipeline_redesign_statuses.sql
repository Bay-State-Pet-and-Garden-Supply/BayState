-- Migration: Pipeline Redesign Statuses
-- Deprecate old statuses and map them to the new export-focused flow.

-- 1. Drop existing pipeline_status check constraints first.
-- This must happen before remapping rows so new values do not violate old constraints.
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.products_ingestion'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%pipeline_status%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.products_ingestion DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- 2. Map existing data to new statuses
UPDATE public.products_ingestion
SET pipeline_status = 'registered'
WHERE pipeline_status = 'staging';

UPDATE public.products_ingestion
SET pipeline_status = 'enriched'
WHERE pipeline_status = 'scraped';

UPDATE public.products_ingestion
SET pipeline_status = 'finalized'
WHERE pipeline_status IN ('consolidated', 'approved', 'published');

-- 3. Add the new check constraint enforcing the new status set
ALTER TABLE public.products_ingestion 
ADD CONSTRAINT products_ingestion_pipeline_status_check 
CHECK (pipeline_status IN ('registered', 'enriched', 'finalized', 'failed'));

-- 4. Update products_published to use finalized and preserve existing columns.
CREATE OR REPLACE VIEW public.products_published AS
SELECT
  pi.sku AS id,
  COALESCE(pi.consolidated->>'name', pi.input->>'name') AS name,
  LOWER(REGEXP_REPLACE(COALESCE(pi.consolidated->>'name', pi.input->>'name', pi.sku), '[^a-zA-Z0-9]+', '-', 'g')) AS slug,
  COALESCE(pi.consolidated->>'description', '') AS description,
  COALESCE((pi.consolidated->>'price')::numeric, (pi.input->>'price')::numeric, 0) AS price,
  COALESCE(pi.consolidated->'images', '[]'::jsonb) AS images,
  COALESCE(pi.consolidated->>'stock_status', 'in_stock') AS stock_status,
  (pi.consolidated->>'brand_id')::uuid AS brand_id,
  COALESCE((pi.consolidated->>'is_featured')::boolean, false) AS is_featured,
  pi.created_at,
  pi.updated_at,
  pi.pipeline_status,
  b.name AS brand_name,
  b.slug AS brand_slug,
  b.logo_url AS brand_logo_url
FROM public.products_ingestion pi
LEFT JOIN public.brands b ON ((pi.consolidated->>'brand_id')::uuid = b.id)
WHERE pi.pipeline_status = 'finalized';
