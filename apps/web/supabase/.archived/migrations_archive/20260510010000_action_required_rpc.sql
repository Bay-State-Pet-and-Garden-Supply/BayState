BEGIN;

CREATE OR REPLACE FUNCTION public.get_action_required_items()
RETURNS TABLE (
    category text,
    label text,
    count integer,
    href text,
    severity text
) AS $$
BEGIN
    -- Unpaid pickup orders over 24 hours
    RETURN QUERY
    SELECT
        'orders'::text,
        'unpaid_pickup'::text,
        count(*)::integer,
        '/admin/orders?payment_status=unpaid&fulfillment_method=pickup'::text,
        'warning'::text
    FROM public.orders
    WHERE payment_status = 'unpaid'
      AND fulfillment_method = 'pickup'
      AND created_at < now() - interval '24 hours'
    HAVING count(*) > 0;

    -- Register-only products not yet pushed
    RETURN QUERY
    SELECT
        'inventory'::text,
        'register_only'::text,
        count(*)::integer,
        '/admin/inventory'::text,
        'info'::text
    FROM public.inventory_reconciliation_items
    WHERE issue_type = 'register_only'
      AND status = 'open'
    HAVING count(*) > 0;

    -- Price mismatches (website lower than register by > $1)
    RETURN QUERY
    SELECT
        'inventory'::text,
        'price_mismatch'::text,
        count(*)::integer,
        '/admin/inventory'::text,
        'warning'::text
    FROM public.inventory_reconciliation_items
    WHERE issue_type = 'price_mismatch'
      AND status = 'open'
      AND website_price < register_price - 1
    HAVING count(*) > 0;

    -- Failed syncs in last 7 days
    RETURN QUERY
    SELECT
        'integration'::text,
        'failed_sync'::text,
        count(*)::integer,
        '/admin/inventory/sync-runs'::text,
        'error'::text
    FROM public.integration_sync_runs
    WHERE status = 'failed'
      AND started_at > now() - interval '7 days'
    HAVING count(*) > 0;

    -- Ready-for-pickup orders older than 2 days
    RETURN QUERY
    SELECT
        'orders'::text,
        'aging_pickup'::text,
        count(*)::integer,
        '/admin/orders?fulfillment_status=ready_for_pickup'::text,
        'warning'::text
    FROM public.orders
    WHERE fulfillment_status = 'ready_for_pickup'
      AND updated_at < now() - interval '2 days'
    HAVING count(*) > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO '';

GRANT EXECUTE ON FUNCTION public.get_action_required_items() TO authenticated;

COMMIT;
