-- Migration: Order & Inventory Dashboard Views
-- Purpose: Extend admin dashboard with manager-facing metrics and recent activity.
-- PR 6

BEGIN;

-- ============================================================================
-- 1. Order Statistics View
-- ============================================================================
CREATE OR REPLACE VIEW public.dashboard_order_stats
WITH (security_invoker = true)
AS
SELECT
    count(*) FILTER (WHERE created_at::date = current_date) AS today_order_count,
    coalesce(sum(total) FILTER (WHERE created_at::date = current_date), 0) AS today_sales,
    count(*) FILTER (WHERE status IN ('pending', 'processing')) AS open_orders,
    count(*) FILTER (WHERE payment_status IN ('unpaid', 'authorized')) AS unpaid_orders,
    count(*) FILTER (WHERE fulfillment_status = 'ready_for_pickup') AS ready_for_pickup,
    count(*) FILTER (WHERE source_type = 'integra' AND created_at::date = current_date) AS today_register_orders,
    count(*) FILTER (WHERE source_type = 'web' AND created_at::date = current_date) AS today_web_orders
FROM public.orders;

-- ============================================================================
-- 2. Inventory Reconciliation Statistics View
-- ============================================================================
CREATE OR REPLACE VIEW public.dashboard_inventory_reconciliation_stats
WITH (security_invoker = true)
AS
SELECT
    count(*) FILTER (WHERE status = 'open') AS open_issues,
    count(*) FILTER (WHERE issue_type = 'register_only' AND status = 'open') AS register_only_products,
    count(*) FILTER (WHERE issue_type = 'price_mismatch' AND status = 'open') AS price_mismatches,
    count(*) FILTER (WHERE issue_type = 'quantity_mismatch' AND status = 'open') AS quantity_mismatches,
    max(created_at) AS last_issue_created_at
FROM public.inventory_reconciliation_items;

-- ============================================================================
-- 3. Extended Recent Activity Function
-- ============================================================================
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
        -- Recent Orders
        SELECT
            o.id,
            'order'::text AS type,
            'New Order: ' || o.order_number AS title,
            o.customer_name AS description,
            CASE
                WHEN o.status = 'completed' THEN 'success'
                WHEN o.status = 'cancelled' THEN 'warning'
                ELSE 'info'
            END AS status,
            o.created_at AS activity_timestamp,
            '/admin/orders' AS href
        FROM public.orders o
        ORDER BY o.created_at DESC
        LIMIT limit_count
    )
    UNION ALL
    (
        -- Recent Integration Sync Runs
        SELECT
            r.id,
            'integration'::text AS type,
            CASE r.source_type
                WHEN 'shopsite' THEN 'ShopSite Sync'
                WHEN 'integra' THEN 'Integra Sync'
                ELSE r.source_type || ' Sync'
            END || ' ' || r.status AS title,
            COALESCE(r.file_name, r.sync_kind) AS description,
            CASE
                WHEN r.status = 'completed' THEN 'success'
                WHEN r.status = 'failed' THEN 'warning'
                WHEN r.status = 'partial' THEN 'warning'
                ELSE 'info'
            END AS status,
            r.started_at AS activity_timestamp,
            '/admin/inventory/sync-runs/' || r.id AS href
        FROM public.integration_sync_runs r
        ORDER BY r.started_at DESC
        LIMIT limit_count
    )
    UNION ALL
    (
        -- Recent Order Events (fulfillment changes, cancellations, imports)
        SELECT
            e.id,
            'fulfillment'::text AS type,
            'Order ' || o.order_number || ': ' ||
            CASE e.event_type
                WHEN 'fulfillment_status_changed' THEN 'Fulfillment Updated'
                WHEN 'order_cancelled' THEN 'Order Cancelled'
                WHEN 'imported_from_shopsite' THEN 'Imported from ShopSite'
                ELSE e.event_type
            END AS title,
            COALESCE(e.note, '') AS description,
            CASE
                WHEN e.event_type = 'order_cancelled' THEN 'warning'
                WHEN e.event_type LIKE 'imported%' THEN 'info'
                ELSE 'success'
            END AS status,
            e.created_at AS activity_timestamp,
            '/admin/orders' AS href
        FROM public.order_events e
        JOIN public.orders o ON o.id = e.order_id
        ORDER BY e.created_at DESC
        LIMIT limit_count
    )
    UNION ALL
    (
        -- Scrape Jobs (keep existing)
        SELECT
            j.id,
            'pipeline'::text AS type,
            'Scraper Job ' || j.status AS title,
            array_to_string(j.scrapers, ', ') AS description,
            CASE
                WHEN j.status = 'completed' THEN 'success'
                WHEN j.status = 'failed' THEN 'warning'
                WHEN j.status = 'running' THEN 'info'
                ELSE 'pending'
            END AS status,
            j.created_at AS activity_timestamp,
            '/admin/scraper/jobs/' || j.id AS href
        FROM public.scrape_jobs j
        ORDER BY j.created_at DESC
        LIMIT limit_count
    )
    UNION ALL
    (
        -- Product Updates (keep existing)
        SELECT
            p.id,
            'product'::text AS type,
            'Product Updated: ' || p.name AS title,
            p.sku AS description,
            'info'::text AS status,
            p.updated_at AS activity_timestamp,
            '/admin/products/' || p.id AS href
        FROM public.products p
        ORDER BY p.updated_at DESC
        LIMIT limit_count
    )
    ORDER BY activity_timestamp DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. Grants
-- ============================================================================
GRANT SELECT ON public.dashboard_order_stats TO authenticated;
GRANT SELECT ON public.dashboard_inventory_reconciliation_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_recent_activity(int) TO authenticated;

COMMIT;
