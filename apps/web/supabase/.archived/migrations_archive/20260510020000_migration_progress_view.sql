BEGIN;

-- Migration progress: monthly orders by source_type
CREATE OR REPLACE VIEW public.dashboard_migration_progress AS
SELECT
    date_trunc('month', created_at)::date AS month,
    source_type,
    count(*) AS order_count
FROM public.orders
WHERE created_at > now() - interval '12 months'
GROUP BY date_trunc('month', created_at), source_type
ORDER BY month DESC, source_type;

GRANT SELECT ON public.dashboard_migration_progress TO authenticated;

COMMIT;
