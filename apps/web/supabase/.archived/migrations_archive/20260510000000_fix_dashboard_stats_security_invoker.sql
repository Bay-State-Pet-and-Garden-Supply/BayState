-- Migration: Fix dashboard stats views — remove security_invoker
-- 
-- The dashboard stats views are aggregate views returning single rows.
-- They are queried by the browser client (anon key), so security_invoker = true
-- causes them to run as anon, which has no RLS access to orders/inventory tables.
-- 
-- This matches the existing pattern: dashboard_product_stats and 
-- dashboard_scraper_stats (20260320170000) do NOT use security_invoker.
-- The security_invoker fix was correct for admin_orders_list (row-level data)
-- but incorrect for aggregate stats views.

BEGIN;

DROP VIEW IF EXISTS public.dashboard_order_stats;
CREATE OR REPLACE VIEW public.dashboard_order_stats AS
SELECT
    count(*) FILTER (WHERE created_at::date = current_date) AS today_order_count,
    coalesce(sum(total) FILTER (WHERE created_at::date = current_date), 0) AS today_sales,
    count(*) FILTER (WHERE status IN ('pending', 'processing')) AS open_orders,
    count(*) FILTER (WHERE payment_status IN ('unpaid', 'authorized')) AS unpaid_orders,
    count(*) FILTER (WHERE fulfillment_status = 'ready_for_pickup') AS ready_for_pickup,
    count(*) FILTER (WHERE source_type = 'integra' AND created_at::date = current_date) AS today_register_orders,
    count(*) FILTER (WHERE source_type = 'web' AND created_at::date = current_date) AS today_web_orders
FROM public.orders;

DROP VIEW IF EXISTS public.dashboard_inventory_reconciliation_stats;
CREATE OR REPLACE VIEW public.dashboard_inventory_reconciliation_stats AS
SELECT
    count(*) FILTER (WHERE status = 'open') AS open_issues,
    count(*) FILTER (WHERE issue_type = 'register_only' AND status = 'open') AS register_only_products,
    count(*) FILTER (WHERE issue_type = 'price_mismatch' AND status = 'open') AS price_mismatches,
    count(*) FILTER (WHERE issue_type = 'quantity_mismatch' AND status = 'open') AS quantity_mismatches,
    max(created_at) AS last_issue_created_at
FROM public.inventory_reconciliation_items;

GRANT SELECT ON public.dashboard_order_stats TO authenticated;
GRANT SELECT ON public.dashboard_inventory_reconciliation_stats TO authenticated;

COMMIT;
