-- Migration: Replace persisted published pipeline status with a derived export queue.
-- Purpose: keep finalized as the canonical terminal ingestion status while deriving
-- review/export tabs from storefront presence.

BEGIN;

-- Remove any prior pipeline_status check constraints so the canonical one can
-- be recreated safely regardless of migration order in lower environments.
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

-- Restore published rows back to finalized. Storefront presence is now derived
-- from the products table instead of a dedicated ingestion status.
UPDATE public.products_ingestion
SET pipeline_status = 'finalized'
WHERE pipeline_status = 'published';

-- Abort if unexpected values remain instead of silently constraining bad data.
DO $$
DECLARE
    remaining_statuses text;
BEGIN
    SELECT string_agg(
        DISTINCT COALESCE(pipeline_status::text, '<NULL>'),
        ', ' ORDER BY COALESCE(pipeline_status::text, '<NULL>')
    )
    INTO remaining_statuses
    FROM public.products_ingestion
    WHERE pipeline_status IS NULL
       OR pipeline_status::text NOT IN ('imported', 'scraped', 'finalized', 'failed');

    IF remaining_statuses IS NOT NULL THEN
        RAISE EXCEPTION
            'products_ingestion contains non-canonical pipeline_status values: %',
            remaining_statuses;
    END IF;
END $$;

ALTER TABLE public.products_ingestion
    ADD CONSTRAINT products_ingestion_pipeline_status_check
    CHECK (pipeline_status::text IN ('imported', 'scraped', 'finalized', 'failed'));

COMMENT ON COLUMN public.products_ingestion.pipeline_status IS
    'Canonical persisted ingestion status: imported, scraped, finalized, or failed. Storefront publication/export state is derived from the products table.';

CREATE OR REPLACE VIEW public.pipeline_finalized_review AS
SELECT
  pi.*
FROM public.products_ingestion pi
LEFT JOIN public.products p
  ON p.sku = pi.sku
 AND p.published_at IS NOT NULL
WHERE pi.pipeline_status = 'finalized'
  AND p.sku IS NULL;

COMMENT ON VIEW public.pipeline_finalized_review IS
    'Finalized ingestion rows that are still awaiting storefront publication.';

CREATE OR REPLACE VIEW public.pipeline_export_queue AS
SELECT
  pi.*
FROM public.products_ingestion pi
JOIN public.products p
  ON p.sku = pi.sku
 AND p.published_at IS NOT NULL
WHERE pi.pipeline_status = 'finalized';

COMMENT ON VIEW public.pipeline_export_queue IS
    'Finalized ingestion rows already synced to the storefront and ready for downstream export workflows.';

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
FROM public.pipeline_export_queue pi
LEFT JOIN public.brands b ON ((pi.consolidated->>'brand_id')::uuid = b.id);

COMMENT ON VIEW public.products_published IS
    'Projects storefront-synced finalized ingestion records into storefront-ready products.';

COMMIT;
