BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products_ingestion'
      AND column_name = 'pipeline_status_new'
  ) THEN
    UPDATE public.products_ingestion
    SET pipeline_status_new = CASE
      WHEN pipeline_status = 'scraped' THEN 'enriched'::pipeline_status_new_enum
      WHEN pipeline_status IN ('consolidated', 'approved', 'published') THEN 'finalized'::pipeline_status_new_enum
      ELSE 'registered'::pipeline_status_new_enum
    END
    WHERE pipeline_status_new IS DISTINCT FROM CASE
      WHEN pipeline_status = 'scraped' THEN 'enriched'::pipeline_status_new_enum
      WHEN pipeline_status IN ('consolidated', 'approved', 'published') THEN 'finalized'::pipeline_status_new_enum
      ELSE 'registered'::pipeline_status_new_enum
    END;
  END IF;
END
$$;

COMMIT;
