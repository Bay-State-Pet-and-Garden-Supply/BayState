-- Migration: Inventory Drift and Sync Health RPCs
-- Created: 2026-04-25
-- Description: Adds RPCs to support the Inventory Drift Monitor and Sync Health dashboard.

BEGIN;

-- 1. Function to get inventory drift from the most recent successful register_inventory sync
CREATE OR REPLACE FUNCTION public.get_inventory_drift(p_days int DEFAULT 7)
RETURNS TABLE (
    sku text,
    name text,
    field text,
    before_value text,
    after_value text,
    sync_at timestamptz
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Security check: only admin and staff can access drift data
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'staff')
    ) THEN
        RAISE EXCEPTION 'Access denied. Admin or staff role required.';
    END IF;

    RETURN QUERY
    WITH latest_sync AS (
        SELECT 
            ml.metadata->'preview' as preview,
            ml.started_at as sync_at
        FROM public.migration_log ml
        WHERE ml.sync_type = 'register_inventory'
          AND ml.status = 'completed'
          AND ml.metadata ? 'preview'
          AND jsonb_typeof(ml.metadata->'preview') = 'array'
          AND ml.started_at >= now() - (p_days || ' days')::interval
        ORDER BY ml.started_at DESC
        LIMIT 1
    ),
    expanded_preview AS (
        SELECT 
            jsonb_array_elements(preview) as item,
            sync_at
        FROM latest_sync
    ),
    expanded_changes AS (
        SELECT 
            item->>'sku' as sku,
            item->>'name' as name,
            jsonb_array_elements(CASE WHEN jsonb_typeof(item->'changes') = 'array' THEN item->'changes' ELSE '[]'::jsonb END) as change,
            sync_at
        FROM expanded_preview
    )
    SELECT 
        ec.sku,
        ec.name,
        ec.change->>'field' as field,
        ec.change->>'before' as before_value,
        ec.change->>'after' as after_value,
        ec.sync_at
    FROM expanded_changes ec;
END;
$$;

-- 2. Function to get summarized sync status from migration_log
CREATE OR REPLACE FUNCTION public.get_sync_health(p_days int DEFAULT 30)
RETURNS TABLE (
    started_at timestamptz,
    sync_type text,
    status text,
    processed integer,
    created integer,
    updated integer,
    failed integer,
    duration_ms integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Security check: only admin and staff can access sync health
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'staff')
    ) THEN
        RAISE EXCEPTION 'Access denied. Admin or staff role required.';
    END IF;

    RETURN QUERY
    SELECT 
        ml.started_at,
        ml.sync_type,
        ml.status,
        ml.processed,
        ml.created,
        ml.updated,
        ml.failed,
        ml.duration_ms
    FROM public.migration_log ml
    WHERE ml.started_at >= now() - (p_days || ' days')::interval
    ORDER BY ml.started_at DESC;
END;
$$;

-- Grant access to authenticated users (role check is handled inside the functions)
GRANT EXECUTE ON FUNCTION public.get_inventory_drift(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sync_health(int) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION public.get_inventory_drift(int) IS 'Returns inventory changes from the most recent successful register_inventory sync within the specified number of days.';
COMMENT ON FUNCTION public.get_sync_health(int) IS 'Returns summarized sync status from migration_log for the specified number of days.';

COMMIT;
