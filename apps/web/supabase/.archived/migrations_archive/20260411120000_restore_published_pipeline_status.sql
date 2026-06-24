-- Migration: Restore published as a persisted terminal pipeline status.
-- Purpose: keep finalized as the explicit review queue and move successful
-- storefront syncs into a durable published state.

BEGIN;

-- Remove any prior pipeline_status check constraints so the canonical one can
-- be recreated safely even if prior cleanup migrations already ran.
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

-- Backfill the terminal published state from existing storefront rows so
-- products that have already been exported do not remain in finalized review.
UPDATE public.products_ingestion AS pi
SET
    pipeline_status = 'published',
    updated_at = COALESCE(
        GREATEST(pi.updated_at, p.published_at),
        p.published_at,
        pi.updated_at
    )
FROM public.products AS p
WHERE p.sku = pi.sku
  AND p.published_at IS NOT NULL
  AND pi.pipeline_status IN ('finalized', 'published');

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
       OR pipeline_status::text NOT IN ('imported', 'scraped', 'finalized', 'published', 'failed');

    IF remaining_statuses IS NOT NULL THEN
        RAISE EXCEPTION
            'products_ingestion contains non-canonical pipeline_status values: %',
            remaining_statuses;
    END IF;
END $$;

ALTER TABLE public.products_ingestion
    ADD CONSTRAINT products_ingestion_pipeline_status_check
    CHECK (pipeline_status::text IN ('imported', 'scraped', 'finalized', 'published', 'failed'));

COMMENT ON COLUMN public.products_ingestion.pipeline_status IS
    'Canonical persisted ingestion status: imported, scraped, finalized, published, or failed. Published is the terminal storefront-sync state.';

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
WHERE pi.pipeline_status = 'published';

COMMENT ON VIEW public.products_published IS
    'Projects published ingestion records into storefront-ready products. Only rows with pipeline_status=published are included.';

COMMIT;
