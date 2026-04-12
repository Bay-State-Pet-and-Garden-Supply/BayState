-- Migration: make the admin workflow the canonical persisted pipeline state model.
-- Purpose: align products_ingestion.pipeline_status with the real workflow
-- (imported -> scraping -> scraped -> consolidating -> finalizing -> exporting -> failed)
-- and retire successfully exported rows from active pipeline views without deleting audit history.

BEGIN;

DROP VIEW IF EXISTS public.products_published;
DROP VIEW IF EXISTS public.pipeline_export_queue;
DROP VIEW IF EXISTS public.pipeline_finalized_review;
DROP VIEW IF EXISTS public.pipeline_finalizing_queue;

ALTER TABLE public.products_ingestion
    ADD COLUMN IF NOT EXISTS exported_at timestamptz;

DROP POLICY IF EXISTS "Public Read Published Ingestion" ON public.products_ingestion;

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

DROP TYPE IF EXISTS public.pipeline_status_workflow;
CREATE TYPE public.pipeline_status_workflow AS ENUM (
    'imported',
    'scraping',
    'scraped',
    'consolidating',
    'finalizing',
    'exporting',
    'failed'
);

ALTER TABLE public.products_ingestion
    ALTER COLUMN pipeline_status DROP DEFAULT;

ALTER TABLE public.products_ingestion
    ALTER COLUMN pipeline_status TYPE text
    USING pipeline_status::text;

UPDATE public.products_ingestion pi
SET pipeline_status = CASE
    WHEN pi.pipeline_status = 'published' THEN 'exporting'
    WHEN pi.pipeline_status = 'finalized' THEN
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM public.products p
                WHERE p.sku = pi.sku
                  AND p.published_at IS NOT NULL
            ) THEN 'exporting'
            ELSE 'finalizing'
        END
    WHEN pi.pipeline_status = 'scraped' THEN
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM public.scrape_jobs sj
                WHERE sj.status IN ('pending', 'claimed', 'running')
                  AND sj.skus @> ARRAY[pi.sku]::text[]
            ) THEN 'scraping'
            ELSE 'scraped'
        END
    WHEN pi.pipeline_status = 'imported' THEN
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM public.scrape_jobs sj
                WHERE sj.status IN ('pending', 'claimed', 'running')
                  AND sj.skus @> ARRAY[pi.sku]::text[]
            ) THEN 'scraping'
            ELSE 'imported'
        END
    WHEN pi.pipeline_status = 'failed' THEN 'failed'
    ELSE 'imported'
END;

ALTER TABLE public.products_ingestion
    ALTER COLUMN pipeline_status TYPE public.pipeline_status_workflow
    USING pipeline_status::public.pipeline_status_workflow;

DROP TYPE IF EXISTS public.pipeline_status_five;
ALTER TYPE public.pipeline_status_workflow RENAME TO pipeline_status_five;

ALTER TABLE public.products_ingestion
    ADD CONSTRAINT products_ingestion_exported_at_requires_exporting_check
    CHECK (exported_at IS NULL OR pipeline_status = 'exporting');

CREATE POLICY "Public Read Published Ingestion" ON public.products_ingestion
    FOR SELECT
    USING (exported_at IS NOT NULL);

COMMENT ON COLUMN public.products_ingestion.pipeline_status IS
    'Canonical workflow state: imported, scraping, scraped, consolidating, finalizing, exporting, or failed.';

COMMENT ON COLUMN public.products_ingestion.exported_at IS
    'Timestamp of successful downstream export completion. Rows stay in products_ingestion for audit but leave active pipeline views once exported_at is set.';

CREATE INDEX IF NOT EXISTS idx_products_ingestion_pipeline_status_active
    ON public.products_ingestion (pipeline_status, exported_at);

CREATE OR REPLACE VIEW public.pipeline_finalizing_queue AS
SELECT
  pi.*
FROM public.products_ingestion pi
WHERE pi.pipeline_status = 'finalizing'
  AND pi.exported_at IS NULL;

COMMENT ON VIEW public.pipeline_finalizing_queue IS
    'Products awaiting final review before they move into exporting.';

CREATE OR REPLACE VIEW public.pipeline_finalized_review AS
SELECT *
FROM public.pipeline_finalizing_queue;

COMMENT ON VIEW public.pipeline_finalized_review IS
    'Legacy compatibility alias for the finalizing queue.';

CREATE OR REPLACE VIEW public.pipeline_export_queue AS
SELECT
  pi.*
FROM public.products_ingestion pi
WHERE pi.pipeline_status = 'exporting'
  AND pi.exported_at IS NULL;

COMMENT ON VIEW public.pipeline_export_queue IS
    'Products queued for downstream export workflows and still active in the pipeline.';

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
LEFT JOIN public.brands b ON ((pi.consolidated->>'brand_id')::uuid = b.id);
WHERE pi.pipeline_status = 'exporting'
  AND pi.exported_at IS NOT NULL;

COMMENT ON VIEW public.products_published IS
    'Legacy compatibility view for completed exports retained in products_ingestion audit history.';

COMMIT;
