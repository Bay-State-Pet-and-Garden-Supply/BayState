-- Migration: Fix Security Lints
-- Purpose: Address security linter errors by enabling RLS and setting security_invoker = true on views.

BEGIN;

-- 1. Enable RLS on image_retry_queue
-- This was missed in migration 20260327192421_ensure_image_retry_queue_schema_uses_sku.sql
ALTER TABLE public.image_retry_queue ENABLE ROW LEVEL SECURITY;

-- Re-assert policies to ensure the table is usable
DROP POLICY IF EXISTS "Admin view image retry queue" ON public.image_retry_queue;
CREATE POLICY "Admin view image retry queue" ON public.image_retry_queue FOR SELECT
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

DROP POLICY IF EXISTS "Admin manage image retry queue" ON public.image_retry_queue;
CREATE POLICY "Admin manage image retry queue" ON public.image_retry_queue FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

DROP POLICY IF EXISTS "Service role insert image retry queue" ON public.image_retry_queue;
CREATE POLICY "Service role insert image retry queue" ON public.image_retry_queue FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role update image retry queue" ON public.image_retry_queue;
CREATE POLICY "Service role update image retry queue" ON public.image_retry_queue FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- 2. Redefine views with security_invoker = true
-- This ensures that views respect the RLS policies of the querying user.

-- 2.1 pipeline_finalizing_queue
CREATE OR REPLACE VIEW public.pipeline_finalizing_queue
WITH (security_invoker = true)
AS
SELECT
  pi.*
FROM public.products_ingestion pi
WHERE pi.pipeline_status = 'finalizing'
  AND pi.exported_at IS NULL;

-- 2.2 pipeline_finalized_review (alias for finalizing queue)
CREATE OR REPLACE VIEW public.pipeline_finalized_review
WITH (security_invoker = true)
AS
SELECT *
FROM public.pipeline_finalizing_queue;

-- 2.3 pipeline_export_queue
CREATE OR REPLACE VIEW public.pipeline_export_queue
WITH (security_invoker = true)
AS
SELECT
  pi.*
FROM public.products_ingestion pi
WHERE pi.pipeline_status = 'exporting'
  AND pi.exported_at IS NULL;

-- 2.4 products_published
-- Also fixing a semicolon bug from migration 20260412011500_canonicalize_pipeline_workflow.sql
CREATE OR REPLACE VIEW public.products_published
WITH (security_invoker = true)
AS
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
WHERE pi.pipeline_status = 'exporting'
  AND pi.exported_at IS NOT NULL;

-- 2.5 dashboard_product_stats
CREATE OR REPLACE VIEW public.dashboard_product_stats
WITH (security_invoker = true)
AS
SELECT
  count(*) as total_count,
  count(*) FILTER (WHERE published_at IS NOT NULL) as published_count,
  count(*) FILTER (WHERE stock_status = 'out_of_stock') as out_of_stock_count,
  count(*) FILTER (WHERE quantity <= low_stock_threshold) as low_stock_count,
  max(updated_at) as last_updated
FROM public.products;

-- 2.6 dashboard_scraper_stats
CREATE OR REPLACE VIEW public.dashboard_scraper_stats
WITH (security_invoker = true)
AS
SELECT
  count(*) as total_jobs,
  count(*) FILTER (WHERE status = 'completed') as completed_jobs,
  count(*) FILTER (WHERE status = 'failed') as failed_jobs,
  count(*) FILTER (WHERE status = 'running') as active_jobs,
  max(created_at) as last_job_created
FROM public.scrape_jobs
WHERE created_at > now() - interval '24 hours';

-- 2.7 ai_scraper_stats
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scraper_config_versions') THEN
        EXECUTE '
        CREATE OR REPLACE VIEW public.ai_scraper_stats
        WITH (security_invoker = true)
        AS
        SELECT 
            sc.id AS config_id,
            sc.slug,
            sc.display_name,
            cv.version_number,
            cv.status,
            CASE 
                WHEN cv.ai_config IS NOT NULL THEN ''ai''
                ELSE ''static''
            END AS scraper_type,
            cv.ai_config->>''llm_model'' AS llm_model,
            (cv.ai_config->>''max_steps'')::INTEGER AS max_steps,
            (cv.ai_config->>''confidence_threshold'')::NUMERIC AS confidence_threshold,
            cv.published_at,
            cv.created_at
        FROM public.scraper_configs sc
        JOIN public.scraper_config_versions cv ON sc.id = cv.config_id
        WHERE cv.ai_config IS NOT NULL
        ORDER BY cv.created_at DESC';
    END IF;
END $$;

-- 3. Grants
-- Re-applying grants to ensure access is maintained

GRANT SELECT ON public.pipeline_finalizing_queue TO authenticated;
GRANT SELECT ON public.pipeline_finalized_review TO authenticated;
GRANT SELECT ON public.pipeline_export_queue TO authenticated;
GRANT SELECT ON public.products_published TO authenticated;
GRANT SELECT ON public.dashboard_product_stats TO authenticated;
GRANT SELECT ON public.dashboard_scraper_stats TO authenticated;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scraper_config_versions') THEN
        EXECUTE 'GRANT SELECT ON public.ai_scraper_stats TO authenticated';
        EXECUTE 'GRANT SELECT ON public.ai_scraper_stats TO service_role';
    END IF;
END $$;

GRANT SELECT ON public.pipeline_finalizing_queue TO service_role;
GRANT SELECT ON public.pipeline_finalized_review TO service_role;
GRANT SELECT ON public.pipeline_export_queue TO service_role;
GRANT SELECT ON public.products_published TO service_role;
GRANT SELECT ON public.dashboard_product_stats TO service_role;
GRANT SELECT ON public.dashboard_scraper_stats TO service_role;

COMMIT;
