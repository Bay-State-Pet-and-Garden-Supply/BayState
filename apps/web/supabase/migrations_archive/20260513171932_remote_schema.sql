alter table "public"."scraper_config_versions" drop constraint "scraper_config_versions_status_check";

alter table "public"."scraper_config_versions" drop constraint "valid_status";

drop view if exists "public"."admin_orders_list";

drop view if exists "public"."ai_scraper_stats";

drop view if exists "public"."dashboard_migration_progress";

drop view if exists "public"."dashboard_order_stats";

drop view if exists "public"."dashboard_product_stats";

drop view if exists "public"."dashboard_scraper_stats";

drop view if exists "public"."pipeline_export_queue";

drop view if exists "public"."pipeline_finalized_review";

drop view if exists "public"."pipeline_finalizing_queue";

drop view if exists "public"."products_published";

alter table "public"."image_retry_queue" add constraint "image_retry_queue_sku_fkey" FOREIGN KEY (sku) REFERENCES public.products_ingestion(sku) ON DELETE CASCADE not valid;

alter table "public"."image_retry_queue" validate constraint "image_retry_queue_sku_fkey";

alter table "public"."inventory_reconciliation_items" add constraint "inventory_reconciliation_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) not valid;

alter table "public"."inventory_reconciliation_items" validate constraint "inventory_reconciliation_items_product_id_fkey";

alter table "public"."official_brand_url_candidates" add constraint "official_brand_url_candidates_sku_fkey" FOREIGN KEY (sku) REFERENCES public.products_ingestion(sku) ON DELETE CASCADE not valid;

alter table "public"."official_brand_url_candidates" validate constraint "official_brand_url_candidates_sku_fkey";

alter table "public"."order_events" add constraint "order_events_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE not valid;

alter table "public"."order_events" validate constraint "order_events_order_id_fkey";

alter table "public"."order_items" add constraint "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE not valid;

alter table "public"."order_items" validate constraint "order_items_order_id_fkey";

alter table "public"."order_source_records" add constraint "order_source_records_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL not valid;

alter table "public"."order_source_records" validate constraint "order_source_records_order_id_fkey";

alter table "public"."product_categories" add constraint "product_categories_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_categories" validate constraint "product_categories_product_id_fkey";

alter table "public"."product_facets" add constraint "product_facets_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_facets" validate constraint "product_facets_product_id_fkey";

alter table "public"."product_group_products" add constraint "product_group_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_group_products" validate constraint "product_group_products_product_id_fkey";

alter table "public"."product_groups" add constraint "product_groups_default_product_id_fkey" FOREIGN KEY (default_product_id) REFERENCES public.products(id) ON DELETE SET NULL not valid;

alter table "public"."product_groups" validate constraint "product_groups_default_product_id_fkey";

alter table "public"."product_pet_types" add constraint "product_pet_types_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_pet_types" validate constraint "product_pet_types_product_id_fkey";

alter table "public"."product_preorder_groups" add constraint "product_preorder_groups_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_preorder_groups" validate constraint "product_preorder_groups_product_id_fkey";

alter table "public"."product_storefront_settings" add constraint "product_storefront_settings_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_storefront_settings" validate constraint "product_storefront_settings_product_id_fkey";

alter table "public"."products_ingestion" add constraint "products_ingestion_exported_at_requires_exporting_check" CHECK (((exported_at IS NULL) OR (pipeline_status = 'exporting'::public.pipeline_status_five))) not valid;

alter table "public"."products_ingestion" validate constraint "products_ingestion_exported_at_requires_exporting_check";

alter table "public"."stripe_webhook_events" add constraint "stripe_webhook_events_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL not valid;

alter table "public"."stripe_webhook_events" validate constraint "stripe_webhook_events_order_id_fkey";

alter table "public"."wishlists" add constraint "wishlists_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."wishlists" validate constraint "wishlists_product_id_fkey";

alter table "public"."scraper_config_versions" add constraint "scraper_config_versions_status_check" CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'validated'::character varying, 'published'::character varying, 'archived'::character varying])::text[]))) not valid;

alter table "public"."scraper_config_versions" validate constraint "scraper_config_versions_status_check";

alter table "public"."scraper_config_versions" add constraint "valid_status" CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'validated'::character varying, 'published'::character varying, 'archived'::character varying])::text[]))) not valid;

alter table "public"."scraper_config_versions" validate constraint "valid_status";

set check_function_bodies = off;

create or replace view "public"."admin_orders_list" as  SELECT o.id,
    o.order_number,
    o.source_type,
    o.source_system,
    o.external_order_id,
    o.customer_name,
    o.customer_email,
    o.customer_phone,
    o.status,
    o.payment_method,
    o.payment_status,
    o.fulfillment_method,
    o.fulfillment_status,
    o.subtotal,
    o.tax,
    o.total,
    o.created_at,
    o.updated_at,
    count(oi.id) AS item_count,
    COALESCE(sum(oi.quantity), (0)::bigint) AS total_quantity
   FROM (public.orders o
     LEFT JOIN public.order_items oi ON ((oi.order_id = o.id)))
  GROUP BY o.id;


create or replace view "public"."ai_scraper_stats" as  SELECT sc.id AS config_id,
    sc.slug,
    sc.display_name,
    cv.version_number,
    cv.status,
        CASE
            WHEN (cv.ai_config IS NOT NULL) THEN 'ai'::text
            ELSE 'static'::text
        END AS scraper_type,
    (cv.ai_config ->> 'llm_model'::text) AS llm_model,
    ((cv.ai_config ->> 'max_steps'::text))::integer AS max_steps,
    ((cv.ai_config ->> 'confidence_threshold'::text))::numeric AS confidence_threshold,
    cv.published_at,
    cv.created_at
   FROM (public.scraper_configs sc
     JOIN public.scraper_config_versions cv ON ((sc.id = cv.config_id)))
  WHERE (cv.ai_config IS NOT NULL)
  ORDER BY cv.created_at DESC;


CREATE OR REPLACE FUNCTION public.claim_next_pending_chunk(p_runner_name text, p_job_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(chunk_id uuid, job_id uuid, chunk_index integer, skus text[], scrapers text[], test_mode boolean, max_workers integer, type text, config jsonb, lease_token uuid, lease_expires_at timestamp with time zone, sku_slice_index integer, site_group_key text, site_group_label text, site_domain text, planned_work_units integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_chunk_id uuid;
  v_job_id uuid;
  v_runner_enabled boolean;
  v_runner_status text;
BEGIN
  SELECT enabled, status
  INTO v_runner_enabled, v_runner_status
  FROM public.scraper_runners
  WHERE name = p_runner_name;

  IF COALESCE(v_runner_enabled, false) = false OR v_runner_status = 'paused' THEN
    RETURN;
  END IF;

  SELECT c.id, c.job_id
  INTO v_chunk_id, v_job_id
  FROM public.scrape_job_chunks c
  INNER JOIN public.scrape_jobs sj ON sj.id = c.job_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS active_count
    FROM public.scrape_job_chunks running_chunks
    WHERE running_chunks.job_id = c.job_id
      AND running_chunks.status = 'running'
  ) active_chunks ON true
  WHERE c.status = 'pending'
    AND sj.status IN ('pending', 'running')
    AND (p_job_id IS NULL OR c.job_id = p_job_id)
    AND (sj.backoff_until IS NULL OR sj.backoff_until <= now())
    AND sj.attempt_count <= sj.max_attempts
    AND (
      NOT (COALESCE(sj.metadata, '{}'::jsonb) ? 'max_concurrent_chunks')
      OR COALESCE(active_chunks.active_count, 0) < GREATEST(1, ((sj.metadata ->> 'max_concurrent_chunks')::integer))
    )
  ORDER BY sj.created_at ASC, c.chunk_index ASC
  LIMIT 1
  FOR UPDATE OF c, sj SKIP LOCKED;

  IF v_chunk_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.scrape_job_chunks
  SET status = 'running',
      claimed_by = p_runner_name,
      claimed_at = now(),
      started_at = COALESCE(started_at, now()),
      updated_at = now()
  WHERE id = v_chunk_id;

  UPDATE public.scrape_jobs
  SET status = 'running',
      runner_name = p_runner_name,
      started_at = COALESCE(started_at, now()),
      updated_at = now(),
      heartbeat_at = now()
  WHERE id = v_job_id
    AND status = 'pending';

  RETURN QUERY
  SELECT c.id,
         c.job_id,
         c.chunk_index,
         c.skus,
         c.scrapers,
         COALESCE(sj.test_mode, false) AS test_mode,
         COALESCE(sj.max_workers, 3) AS max_workers,
         sj.type,
         sj.config,
         sj.lease_token,
         sj.lease_expires_at,
         c.sku_slice_index,
         c.site_group_key,
         c.site_group_label,
         c.site_domain,
         c.planned_work_units
  FROM public.scrape_job_chunks c
  INNER JOIN public.scrape_jobs sj ON sj.id = c.job_id
  WHERE c.id = v_chunk_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_next_pending_job(p_runner_name text)
 RETURNS TABLE(job_id uuid, skus text[], scrapers text[], test_mode boolean, max_workers integer, type text, config jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_job_id UUID;
    v_runner_enabled BOOLEAN;
    v_runner_status TEXT;
BEGIN
    SELECT enabled, status
    INTO v_runner_enabled, v_runner_status
    FROM public.scraper_runners
    WHERE name = p_runner_name;

    IF COALESCE(v_runner_enabled, false) = false OR v_runner_status = 'paused' THEN
        RETURN;
    END IF;

    SELECT id INTO v_job_id
    FROM public.scrape_jobs
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_job_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.scrape_jobs
    SET
        status = 'claimed',
        runner_name = p_runner_name,
        started_at = NOW(),
        updated_at = NOW()
    WHERE id = v_job_id;

    RETURN QUERY
    SELECT
        sj.id AS job_id,
        sj.skus,
        sj.scrapers,
        COALESCE(sj.test_mode, FALSE) AS test_mode,
        COALESCE(sj.max_workers, 3) AS max_workers,
        sj.type,
        sj.config
    FROM public.scrape_jobs sj
    WHERE sj.id = v_job_id;
END;
$function$
;

create or replace view "public"."dashboard_migration_progress" as  SELECT (date_trunc('month'::text, created_at))::date AS month,
    source_type,
    count(*) AS order_count
   FROM public.orders
  WHERE (created_at > (now() - '1 year'::interval))
  GROUP BY (date_trunc('month'::text, created_at)), source_type
  ORDER BY ((date_trunc('month'::text, created_at))::date) DESC, source_type;


create or replace view "public"."dashboard_order_stats" as  SELECT count(*) FILTER (WHERE ((created_at)::date = CURRENT_DATE)) AS today_order_count,
    COALESCE(sum(total) FILTER (WHERE ((created_at)::date = CURRENT_DATE)), (0)::numeric) AS today_sales,
    count(*) FILTER (WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]))) AS open_orders,
    count(*) FILTER (WHERE (payment_status = ANY (ARRAY['unpaid'::public.order_payment_status, 'authorized'::public.order_payment_status]))) AS unpaid_orders,
    count(*) FILTER (WHERE (fulfillment_status = 'ready_for_pickup'::public.order_fulfillment_status)) AS ready_for_pickup,
    count(*) FILTER (WHERE ((source_type = 'integra'::public.order_source_type) AND ((created_at)::date = CURRENT_DATE))) AS today_register_orders,
    count(*) FILTER (WHERE ((source_type = 'web'::public.order_source_type) AND ((created_at)::date = CURRENT_DATE))) AS today_web_orders
   FROM public.orders;


create or replace view "public"."dashboard_product_stats" as  SELECT count(*) AS total_count,
    count(*) FILTER (WHERE (published_at IS NOT NULL)) AS published_count,
    count(*) FILTER (WHERE (stock_status = 'out_of_stock'::text)) AS out_of_stock_count,
    count(*) FILTER (WHERE (quantity <= low_stock_threshold)) AS low_stock_count,
    max(updated_at) AS last_updated
   FROM public.products;


create or replace view "public"."dashboard_scraper_stats" as  SELECT count(*) AS total_jobs,
    count(*) FILTER (WHERE (status = 'completed'::text)) AS completed_jobs,
    count(*) FILTER (WHERE (status = 'failed'::text)) AS failed_jobs,
    count(*) FILTER (WHERE (status = 'running'::text)) AS active_jobs,
    max(created_at) AS last_job_created
   FROM public.scrape_jobs
  WHERE (created_at > (now() - '24:00:00'::interval));


CREATE OR REPLACE FUNCTION public.ensure_product_storefront_settings_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.product_storefront_settings (product_id)
    VALUES (NEW.id)
    ON CONFLICT (product_id) DO NOTHING;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_order_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.order_number := 'BSP-' || to_char(now(), 'YYYYMMDD') || '-' || 
        lpad(floor(random() * 10000)::text, 4, '0');
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_action_required_items()
 RETURNS TABLE(category text, label text, count integer, href text, severity text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.get_inventory_drift(p_days integer DEFAULT 7)
 RETURNS TABLE(sku text, name text, field text, before_value text, after_value text, sync_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_job_retry_history(p_job_type text, p_job_id uuid)
 RETURNS TABLE(retry_id uuid, status text, attempt_count integer, retry_reason text, error_log text[], created_at timestamp with time zone, last_attempt_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
    SELECT
        prq.id,
        prq.status,
        prq.attempt_count,
        prq.retry_reason,
        prq.error_log,
        prq.created_at,
        prq.last_attempt_at
    FROM pipeline_retry_queue prq
    WHERE prq.job_type = p_job_type
    AND prq.original_job_id = p_job_id
    ORDER BY prq.created_at DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_pending_retries(p_limit integer DEFAULT 10)
 RETURNS TABLE(retry_id uuid, job_type text, original_job_id uuid, retry_reason text, priority integer, attempt_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
    SELECT
        prq.id,
        prq.job_type,
        prq.original_job_id,
        prq.retry_reason,
        prq.priority,
        prq.attempt_count
    FROM pipeline_retry_queue prq
    WHERE prq.status = 'pending'
    AND (prq.next_attempt_at IS NULL OR prq.next_attempt_at <= NOW())
    AND prq.attempt_count < prq.max_attempts
    ORDER BY prq.priority DESC, prq.created_at ASC
    LIMIT p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.get_personalized_products(user_uuid uuid, result_limit integer DEFAULT 12)
 RETURNS TABLE(id uuid, brand_id uuid, name text, slug text, price numeric, stock_status text, images text[], pet_name text, pet_type_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.brand_id,
    p.name,
    p.slug,
    p.price,
    p.stock_status,
    p.images,
    up.name as pet_name,
    pt.name as pet_type_name
  FROM products p
  JOIN product_pet_types ppt ON p.id = ppt.product_id
  JOIN user_pets up ON up.pet_type_id = ppt.pet_type_id
  JOIN pet_types pt ON up.pet_type_id = pt.id
  WHERE up.user_id = user_uuid
  LIMIT result_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_pipeline_stage_sources(p_stage_status text)
 RETURNS TABLE(source_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT DISTINCT jsonb_object_keys(sources) as source_key
    FROM products_ingestion
    WHERE pipeline_status = p_stage_status::pipeline_status_five
      AND exported_at IS NULL
      AND sources IS NOT NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_pipeline_status_counts()
 RETURNS TABLE(status text, count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT pipeline_status::text as status, COUNT(*) as count
    FROM products_ingestion
    WHERE exported_at IS NULL
    GROUP BY pipeline_status;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_products_for_pet_types(pet_type_ids uuid[])
 RETURNS TABLE(id uuid, brand_id uuid, name text, slug text, price numeric, stock_status text, images text[], pet_type_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (p.id)
    p.id,
    p.brand_id,
    p.name,
    p.slug,
    p.price,
    p.stock_status,
    p.images,
    ppt.pet_type_id
  FROM products p
  JOIN product_pet_types ppt ON p.id = ppt.product_id
  WHERE ppt.pet_type_id = ANY(pet_type_ids);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_sales_metrics(start_date timestamp without time zone, end_date timestamp without time zone, p_source text DEFAULT NULL::text)
 RETURNS TABLE(total_revenue numeric, total_orders bigint, average_order_value numeric, total_tax numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_sales_trends(start_date timestamp without time zone, end_date timestamp without time zone, period text DEFAULT 'day'::text, p_source text DEFAULT NULL::text)
 RETURNS TABLE(period_date text, revenue numeric, orders bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_sync_health(p_days integer DEFAULT 30)
 RETURNS TABLE(started_at timestamp with time zone, sync_type text, status text, processed integer, created integer, updated integer, failed integer, duration_ms integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_default_address()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
    if new.is_default then
        update addresses set is_default = false 
        where user_id = new.user_id and id <> new.id;
    end if;
    return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    new.email,
    'customer'
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role = 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('admin', 'staff')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.mark_first_order_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NEW.user_id IS NOT NULL THEN
        UPDATE profiles 
        SET first_order_completed = true,
            first_order_at = COALESCE(first_order_at, now())
        WHERE id = NEW.user_id 
        AND first_order_completed = false;
    END IF;
    RETURN NEW;
END;
$function$
;

create or replace view "public"."pipeline_export_queue" as  SELECT sku,
    input,
    sources,
    consolidated,
    pipeline_status,
    created_at,
    updated_at,
    b2b_sources,
    enrichment_config,
    is_test_run,
    image_candidates,
    confidence_score,
    selected_images,
    error_message,
    retry_count,
    product_line,
    cohort_id,
    exported_at
   FROM public.products_ingestion pi
  WHERE ((pipeline_status = 'exporting'::public.pipeline_status_five) AND (exported_at IS NULL));


create or replace view "public"."pipeline_finalizing_queue" as  SELECT sku,
    input,
    sources,
    consolidated,
    pipeline_status,
    created_at,
    updated_at,
    b2b_sources,
    enrichment_config,
    is_test_run,
    image_candidates,
    confidence_score,
    selected_images,
    error_message,
    retry_count,
    product_line,
    cohort_id,
    exported_at
   FROM public.products_ingestion pi
  WHERE ((pipeline_status = 'finalizing'::public.pipeline_status_five) AND (exported_at IS NULL));


create or replace view "public"."products_published" as  SELECT pi.sku AS id,
    COALESCE((pi.consolidated ->> 'name'::text), (pi.input ->> 'name'::text)) AS name,
    lower(regexp_replace(COALESCE((pi.consolidated ->> 'name'::text), (pi.input ->> 'name'::text), pi.sku), '[^a-zA-Z0-9]+'::text, '-'::text, 'g'::text)) AS slug,
    COALESCE((pi.consolidated ->> 'description'::text), ''::text) AS description,
    COALESCE(((pi.consolidated ->> 'price'::text))::numeric, ((pi.input ->> 'price'::text))::numeric, (0)::numeric) AS price,
    COALESCE((pi.consolidated -> 'images'::text), '[]'::jsonb) AS images,
    COALESCE((pi.consolidated ->> 'stock_status'::text), 'in_stock'::text) AS stock_status,
    ((pi.consolidated ->> 'brand_id'::text))::uuid AS brand_id,
    COALESCE(((pi.consolidated ->> 'is_featured'::text))::boolean, false) AS is_featured,
    pi.created_at,
    pi.updated_at,
    pi.pipeline_status,
    b.name AS brand_name,
    b.slug AS brand_slug,
    b.logo_url AS brand_logo_url
   FROM (public.products_ingestion pi
     LEFT JOIN public.brands b ON ((((pi.consolidated ->> 'brand_id'::text))::uuid = b.id)))
  WHERE ((pi.pipeline_status = 'exporting'::public.pipeline_status_five) AND (pi.exported_at IS NOT NULL));


CREATE OR REPLACE FUNCTION public.set_order_source_type()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.source_type IS NULL THEN
    NEW.source_type := CASE NEW.source
      WHEN 'shopsite' THEN 'shopsite'::public.order_source_type
      WHEN 'integra' THEN 'integra'::public.order_source_type
      WHEN 'web' THEN 'web'::public.order_source_type
      ELSE 'web'::public.order_source_type
    END;
  END IF;
  IF NEW.source_system IS NULL AND NEW.source_type = 'shopsite' THEN
    NEW.source_system := 'shopsite_15';
  END IF;
  IF NEW.source_system IS NULL AND NEW.source_type = 'integra' THEN
    NEW.source_system := 'integra_register';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_brand_scraper_affinity_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_brand_scraper_mappings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_cohort_batches_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_health_metrics_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_llm_parallel_runs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_pipeline_retry_queue_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_product_groups_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_promo_code_usage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    UPDATE promo_codes 
    SET current_uses = current_uses + 1,
        updated_at = now()
    WHERE id = NEW.promo_code_id;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_scraper_configs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_user_pets_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_ai_config(config jsonb)
 RETURNS TABLE(valid boolean, errors text[])
 LANGUAGE plpgsql
AS $function$
DECLARE
    error_list TEXT[] := ARRAY[]::TEXT[];
    ai_config JSONB;
    scraper_type TEXT;
BEGIN
    -- Extract scraper type (default to 'static' if not present)
    scraper_type := COALESCE(config->>'scraper_type', 'static');
    
    -- If static scraper, no additional validation needed
    IF scraper_type = 'static' THEN
        RETURN QUERY SELECT true, ARRAY[]::TEXT[];
        RETURN;
    END IF;
    
    -- For AI scrapers, validate ai_config exists
    IF scraper_type = 'ai' THEN
        ai_config := config->'ai_config';
        
        IF ai_config IS NULL THEN
            error_list := array_append(error_list, 'ai_config is required when scraper_type is "ai"');
        ELSE
            -- Validate task
            IF ai_config->>'task' IS NULL OR length(trim(ai_config->>'task')) = 0 THEN
                error_list := array_append(error_list, 'ai_config.task is required and cannot be empty');
            END IF;
            
            -- Validate max_steps range
            IF (ai_config->>'max_steps')::INTEGER IS NOT NULL THEN
                IF (ai_config->>'max_steps')::INTEGER < 1 OR (ai_config->>'max_steps')::INTEGER > 50 THEN
                    error_list := array_append(error_list, 'ai_config.max_steps must be between 1 and 50');
                END IF;
            END IF;
            
            -- Validate confidence_threshold range
            IF (ai_config->>'confidence_threshold')::NUMERIC IS NOT NULL THEN
                IF (ai_config->>'confidence_threshold')::NUMERIC < 0 OR (ai_config->>'confidence_threshold')::NUMERIC > 1 THEN
                    error_list := array_append(error_list, 'ai_config.confidence_threshold must be between 0 and 1');
                END IF;
            END IF;
            
            -- Validate llm_model
            IF ai_config->>'llm_model' IS NOT NULL THEN
                IF ai_config->>'llm_model' NOT IN ('gpt-4o', 'gpt-4o-mini') THEN
                    error_list := array_append(error_list, 'ai_config.llm_model must be "gpt-4o" or "gpt-4o-mini"');
                END IF;
            END IF;
        END IF;
    END IF;
    
    RETURN QUERY SELECT array_length(error_list, 1) IS NULL, error_list;
END;
$function$
;

create or replace view "public"."pipeline_finalized_review" as  SELECT sku,
    input,
    sources,
    consolidated,
    pipeline_status,
    created_at,
    updated_at,
    b2b_sources,
    enrichment_config,
    is_test_run,
    image_candidates,
    confidence_score,
    selected_images,
    error_message,
    retry_count,
    product_line,
    cohort_id,
    exported_at
   FROM public.pipeline_finalizing_queue;



