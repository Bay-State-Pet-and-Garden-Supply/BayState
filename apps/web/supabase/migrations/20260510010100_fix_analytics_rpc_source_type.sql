-- Migration: Fix analytics RPCs to filter on source_type (canonical) instead of source (legacy text)
-- Prerequisite for Phase A5: "New Website" channel filter in analytics
--
-- The get_sales_metrics and get_sales_trends RPCs filtered on orders.source (legacy text column),
-- which was never populated for 'web' source orders and had only partial backfill for shopsite/integra.
-- The canonical source classification is now orders.source_type (enum), backfilled in PR 1.
--
-- This fix switches the filter to source_type::text so that:
--   ?source=web      returns new website orders (would have been empty before)
--   ?source=shopsite returns ShopSite orders (more accurate than legacy heuristic)
--   ?source=integra  returns register sales

BEGIN;

CREATE OR REPLACE FUNCTION public.get_sales_metrics(
    start_date timestamp, 
    end_date timestamp,
    p_source text DEFAULT NULL
)
RETURNS TABLE (
    total_revenue numeric,
    total_orders bigint,
    average_order_value numeric,
    total_tax numeric
) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(total), 0)::numeric AS total_revenue,
        COUNT(id) AS total_orders,
        CASE WHEN COUNT(id) > 0 THEN ROUND(SUM(total) / COUNT(id), 2)::numeric ELSE 0::numeric END AS average_order_value,
        COALESCE(SUM(tax), 0)::numeric AS total_tax
    FROM public.orders
    WHERE status IN ('completed', 'processing')
      AND created_at >= start_date 
      AND created_at <= end_date
      AND (p_source IS NULL OR source_type::text = p_source);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_trends(
    start_date timestamp, 
    end_date timestamp, 
    period text DEFAULT 'day',
    p_source text DEFAULT NULL
)
RETURNS TABLE (
    period_date text,
    revenue numeric,
    orders bigint
) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        to_char(date_trunc(period, created_at), 'YYYY-MM-DD') AS period_date,
        COALESCE(SUM(total), 0)::numeric AS revenue,
        COUNT(id) AS orders
    FROM public.orders
    WHERE status IN ('completed', 'processing')
      AND created_at >= start_date 
      AND created_at <= end_date
      AND (p_source IS NULL OR source_type::text = p_source)
    GROUP BY date_trunc(period, created_at)
    ORDER BY date_trunc(period, created_at) ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_metrics(timestamp, timestamp, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_trends(timestamp, timestamp, text, text) TO authenticated;

COMMIT;
