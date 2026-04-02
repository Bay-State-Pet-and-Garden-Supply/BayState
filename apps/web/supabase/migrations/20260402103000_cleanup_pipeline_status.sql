-- Migration: Clean up pipeline status schema and enforce canonical constraint
-- Purpose: retire the unused pipeline_status_new shadow column and ensure
-- products_ingestion.pipeline_status only stores canonical persisted statuses.

BEGIN;

-- Normalize any surviving legacy values before enforcing the final constraint.
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

-- Remove any prior pipeline_status check constraints so the canonical one can be
-- recreated safely on repeated runs.
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

-- Retire the transitional shadow column and its supporting objects.
DROP INDEX IF EXISTS public.idx_products_ingestion_pipeline_status_new;

ALTER TABLE public.products_ingestion
    DROP COLUMN IF EXISTS pipeline_status_new;

DROP TYPE IF EXISTS public.pipeline_status_new_enum;

-- Fail loudly if unexpected values remain rather than silently constraining bad data.
DO $$
DECLARE
    remaining_statuses text;
BEGIN
    SELECT string_agg(
        DISTINCT COALESCE(pipeline_status, '<NULL>'),
        ', ' ORDER BY COALESCE(pipeline_status, '<NULL>')
    )
    INTO remaining_statuses
    FROM public.products_ingestion
    WHERE pipeline_status IS NULL
       OR pipeline_status NOT IN ('imported', 'scraped', 'finalized', 'failed');

    IF remaining_statuses IS NOT NULL THEN
        RAISE EXCEPTION
            'products_ingestion contains non-canonical pipeline_status values: %',
            remaining_statuses;
    END IF;
END $$;

-- Recreate the canonical check constraint only when it is absent.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.products_ingestion'::regclass
          AND conname = 'products_ingestion_pipeline_status_check'
    ) THEN
        EXECUTE $sql$
            ALTER TABLE public.products_ingestion
            ADD CONSTRAINT products_ingestion_pipeline_status_check
            CHECK (pipeline_status IN ('imported', 'scraped', 'finalized', 'failed'))
        $sql$;
    END IF;
END $$;

COMMENT ON COLUMN public.products_ingestion.pipeline_status IS
    'Canonical persisted ingestion status: imported, scraped, finalized, or failed.';

COMMIT;
