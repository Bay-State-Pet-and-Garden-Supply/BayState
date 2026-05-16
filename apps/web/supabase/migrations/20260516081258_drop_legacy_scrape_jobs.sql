-- Update dashboard_scraper_stats view to use enrichment_jobs
CREATE OR REPLACE VIEW "public"."dashboard_scraper_stats" AS 
SELECT count(*) AS total_jobs,
    count(*) FILTER (WHERE (status = 'completed'::text)) AS completed_jobs,
    count(*) FILTER (WHERE (status = 'failed'::text)) AS failed_jobs,
    count(*) FILTER (WHERE (status = 'running'::text)) AS active_jobs,
    max(created_at) AS last_job_created
   FROM public.enrichment_jobs
  WHERE (created_at > (now() - '24:00:00'::interval));

-- Update get_dashboard_recent_activity function to use enrichment_jobs
CREATE OR REPLACE FUNCTION public.get_dashboard_recent_activity(limit_count integer DEFAULT 10)
 RETURNS TABLE(id uuid, type text, title text, description text, status text, activity_timestamp timestamp with time zone, href text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Restrict to admin/staff to prevent customer data exposure
    SET LOCAL search_path TO '';
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'staff')
    ) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

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
        -- Scrape Jobs (keep existing but from enrichment_jobs)
        SELECT
            j.id,
            'pipeline'::text AS type,
            'Enrichment Job ' || j.status AS title,
            COALESCE(array_to_string(j.skus, ', '), 'No SKUs') AS description,
            CASE
                WHEN j.status = 'completed' THEN 'success'
                WHEN j.status = 'failed' THEN 'warning'
                WHEN j.status = 'running' THEN 'info'
                ELSE 'pending'
            END AS status,
            j.created_at AS activity_timestamp,
            '/admin/pipeline' AS href
        FROM public.enrichment_jobs j
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
$function$;

-- Drop old functions
DROP FUNCTION IF EXISTS claim_next_pending_job(TEXT);
DROP FUNCTION IF EXISTS claim_next_pending_chunk(TEXT);
DROP FUNCTION IF EXISTS claim_next_pending_chunk(TEXT, UUID);
DROP FUNCTION IF EXISTS claim_next_chunk(UUID, TEXT);

-- Drop legacy scrape job architecture tables
DROP TABLE IF EXISTS public.scrape_job_chunks CASCADE;
DROP TABLE IF EXISTS public.scrape_jobs CASCADE;
