-- Migration: Update dashboard metrics views for enrichment-first architecture
-- Purpose: Point telemetry views to enrichment_jobs and update status logic

-- 1. Update Scrape Job Statistics View
-- Note: We still call the view 'dashboard_scraper_stats' for UI compatibility
CREATE OR REPLACE VIEW public.dashboard_scraper_stats AS
SELECT
  count(*) as total_jobs,
  count(*) FILTER (WHERE status = 'completed') as completed_jobs,
  count(*) FILTER (WHERE status = 'failed') as failed_jobs,
  count(*) FILTER (WHERE status = 'running' OR status = 'claimed') as active_jobs,
  max(created_at) as last_job_created
FROM public.enrichment_jobs
WHERE created_at > now() - interval '24 hours';

-- 2. Update Recent Activity Function
CREATE OR REPLACE FUNCTION public.get_dashboard_recent_activity(limit_count int DEFAULT 10)
RETURNS TABLE (
  id uuid,
  type text,
  title text,
  description text,
  status text,
  activity_timestamp timestamptz,
  href text
) AS $$
BEGIN
  RETURN QUERY
  (
    -- Recent Enrichment Jobs (Replaces legacy scrape jobs)
    SELECT 
      j.id,
      'pipeline' as type,
      'Pipeline Job ' || j.status as title,
      CASE 
        WHEN j.config->'scrapers' IS NOT NULL THEN (SELECT string_agg(s::text, ', ') FROM jsonb_array_elements_text(j.config->'scrapers') s)
        ELSE 'General Enrichment'
      END as description,
      CASE 
        WHEN j.status = 'completed' THEN 'success'
        WHEN j.status = 'failed' THEN 'warning'
        WHEN j.status = 'running' OR j.status = 'claimed' THEN 'info'
        ELSE 'pending'
      END as status,
      j.created_at as activity_timestamp,
      '/admin/pipeline/active-runs' as href
    FROM public.enrichment_jobs j
    ORDER BY j.created_at DESC
    LIMIT limit_count
  )
  UNION ALL
  (
    -- Recent Product Updates
    SELECT 
      p.id,
      'product' as type,
      'Product Updated: ' || p.name as title,
      p.sku as description,
      'info' as status,
      p.updated_at as activity_timestamp,
      '/admin/products/' || p.id as href
    FROM public.products p
    ORDER BY p.updated_at DESC
    LIMIT limit_count
  )
  ORDER BY activity_timestamp DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
