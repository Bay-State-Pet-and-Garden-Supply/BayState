-- Migration: Pipeline Performance RPCs
-- Purpose: Optimize data fetching for the admin pipeline by moving aggregations to the database

-- 1. Function to get status counts efficiently
CREATE OR REPLACE FUNCTION public.get_pipeline_status_counts()
RETURNS TABLE (status text, count bigint) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT pipeline_status as status, COUNT(*) as count
    FROM products_ingestion
    WHERE exported_at IS NULL
    GROUP BY pipeline_status;
END;
$$;

-- 2. Function to get available sources for a stage efficiently
CREATE OR REPLACE FUNCTION public.get_pipeline_stage_sources(p_stage_status text)
RETURNS TABLE (source_key text) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT jsonb_object_keys(sources) as source_key
    FROM products_ingestion
    WHERE pipeline_status = p_stage_status
      AND exported_at IS NULL
      AND sources IS NOT NULL;
END;
$$;

-- Grant access to authenticated users (admin/staff)
GRANT EXECUTE ON FUNCTION public.get_pipeline_status_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pipeline_stage_sources(text) TO authenticated;

COMMENT ON FUNCTION public.get_pipeline_status_counts() IS 'Aggregates pipeline status counts database-side to avoid fetching all rows.';
COMMENT ON FUNCTION public.get_pipeline_stage_sources(text) IS 'Extracts unique source keys from JSONB database-side to avoid fetching all rows.';
