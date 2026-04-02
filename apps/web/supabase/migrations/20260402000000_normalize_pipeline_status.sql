-- Migration: Normalize persisted pipeline statuses to canonical four-state contract
-- Purpose: Collapse legacy/transitional statuses into imported | scraped | finalized | failed,
-- retire pipeline_status_new, and keep published products derived from finalized rows.

BEGIN;

-- Remove any legacy pipeline_status check constraints before remapping rows.
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.products_ingestion'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%pipeline_status%'
    ) LOOP
        EXECUTE format(
            'ALTER TABLE public.products_ingestion DROP CONSTRAINT %I',
            constraint_record.conname
        );
    END LOOP;
END $$;

-- Normalize every persisted legacy value into the canonical contract.
-- "published" is no longer stored directly; those rows become finalized and are
-- treated as published by downstream views/workflows.
UPDATE public.products_ingestion
SET pipeline_status = CASE pipeline_status
    WHEN 'registered' THEN 'imported'
    WHEN 'staging' THEN 'imported'
    WHEN 'enriched' THEN 'scraped'
    WHEN 'consolidated' THEN 'finalized'
    WHEN 'approved' THEN 'finalized'
    WHEN 'published' THEN 'finalized'
    ELSE pipeline_status
END
WHERE pipeline_status IN (
    'registered',
    'staging',
    'enriched',
    'consolidated',
    'approved',
    'published'
);

-- Abort if any non-canonical values remain so the migration never silently leaves
-- persisted statuses outside the application contract.
DO $$
DECLARE
    remaining_statuses text;
BEGIN
    SELECT string_agg(
        DISTINCT COALESCE(pipeline_status, '<NULL>'),
        ', '
        ORDER BY COALESCE(pipeline_status, '<NULL>')
    )
    INTO remaining_statuses
    FROM public.products_ingestion
    WHERE pipeline_status IS NULL
       OR pipeline_status NOT IN ('imported', 'scraped', 'finalized', 'failed');

    IF remaining_statuses IS NOT NULL THEN
        RAISE EXCEPTION
            'products_ingestion contains non-canonical pipeline_status values after normalization: %',
            remaining_statuses;
    END IF;
END $$;

-- Retire the transitional shadow column now that pipeline_status is canonical.
ALTER TABLE public.products_ingestion
    DROP COLUMN IF EXISTS pipeline_status_new;

DROP TYPE IF EXISTS public.pipeline_status_new_enum;

-- Enforce the canonical persisted status contract at the database layer.
ALTER TABLE public.products_ingestion
    ADD CONSTRAINT products_ingestion_pipeline_status_check
    CHECK (pipeline_status IN ('imported', 'scraped', 'finalized', 'failed'));

COMMENT ON COLUMN public.products_ingestion.pipeline_status IS
    'Canonical persisted ingestion status: imported, scraped, finalized, or failed. Published is derived, not stored.';

-- Published storefront rows are now derived from finalized products instead of a
-- separately persisted published status.
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

COMMENT ON VIEW public.products_published IS
    'Projects finalized ingestion records into storefront-ready products. Published visibility is derived, not persisted in pipeline_status.';

COMMIT;
