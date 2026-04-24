-- 20260424000000_order_analytics_rpcs.sql
-- Migration to add RPC functions for order analytics and reporting

BEGIN;

CREATE OR REPLACE FUNCTION public.get_sales_metrics(start_date timestamp, end_date timestamp)
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
      AND created_at >= start_date AND created_at <= end_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_trends(start_date timestamp, end_date timestamp, period text DEFAULT 'day')
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
      AND created_at >= start_date AND created_at <= end_date
    GROUP BY date_trunc(period, created_at)
    ORDER BY date_trunc(period, created_at) ASC;
END;
$$;

-- Grant access to authenticated users (staff/admin)
GRANT EXECUTE ON FUNCTION public.get_sales_metrics(timestamp, timestamp) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_trends(timestamp, timestamp, text) TO authenticated;

COMMIT;
