-- Migration: Create dashboard metrics views
-- Purpose: Provide aggregated data for the admin dashboard

-- 1. Product Statistics View
CREATE OR REPLACE VIEW public.dashboard_product_stats AS
SELECT
  count(*) as total_count,
  count(*) FILTER (WHERE published_at IS NOT NULL) as published_count,
  count(*) FILTER (WHERE stock_status = 'out_of_stock') as out_of_stock_count,
  count(*) FILTER (WHERE quantity <= low_stock_threshold) as low_stock_count,
  max(updated_at) as last_updated
FROM public.products;

-- 2. Scrape Job Statistics View (Last 24 hours)
CREATE OR REPLACE VIEW public.dashboard_scraper_stats AS
SELECT
  count(*) as total_jobs,
  count(*) FILTER (WHERE status = 'completed') as completed_jobs,
  count(*) FILTER (WHERE status = 'failed') as failed_jobs,
  count(*) FILTER (WHERE status = 'running') as active_jobs,
  max(created_at) as last_job_created
FROM public.scrape_jobs
WHERE created_at > now() - interval '24 hours';

-- 3. Recent Activity Function (Unified feed)
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
    -- Recent Scrape Jobs
    SELECT 
      j.id,
      'pipeline' as type,
      'Scraper Job ' || j.status as title,
      array_to_string(j.scrapers, ', ') as description,
      CASE 
        WHEN j.status = 'completed' THEN 'success'
        WHEN j.status = 'failed' THEN 'warning'
        WHEN j.status = 'running' THEN 'info'
        ELSE 'pending'
      END as status,
      j.created_at as activity_timestamp,
      '/admin/scraper/jobs/' || j.id as href
    FROM public.scrape_jobs j
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

-- Grant access to authenticated users (admin/staff)
GRANT SELECT ON public.dashboard_product_stats TO authenticated;
GRANT SELECT ON public.dashboard_scraper_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_recent_activity(int) TO authenticated;
