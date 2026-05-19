-- Migration: Fix dashboard activity links
-- Purpose: Correct the href for scraper jobs to match the existing Next.js routes

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
      '/admin/scrapers/runs/' || j.id as href
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
