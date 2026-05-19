--
-- PostgreSQL database dump
--

-- \restrict oIpWE1Th8OjEF2BFlqlXq6sZSbvpyvvv1df80x0e0aXhQt2rR7QuuDJKDyqiJt1

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: image_error_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."image_error_type" AS ENUM (
    'auth_401',
    'not_found_404',
    'network_timeout',
    'cors_blocked',
    'unknown'
);


ALTER TYPE "public"."image_error_type" OWNER TO "postgres";

--
-- Name: TYPE "image_error_type"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TYPE "public"."image_error_type" IS 'Types of errors that can occur during image capture';


--
-- Name: image_retry_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."image_retry_status" AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);


ALTER TYPE "public"."image_retry_status" OWNER TO "postgres";

--
-- Name: TYPE "image_retry_status"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TYPE "public"."image_retry_status" IS 'Processing status of image retry queue entries';


--
-- Name: inventory_reconciliation_issue_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."inventory_reconciliation_issue_type" AS ENUM (
    'register_only',
    'website_only',
    'price_mismatch',
    'quantity_mismatch',
    'stock_status_mismatch',
    'duplicate_sku',
    'invalid_row'
);


ALTER TYPE "public"."inventory_reconciliation_issue_type" OWNER TO "postgres";

--
-- Name: inventory_reconciliation_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."inventory_reconciliation_status" AS ENUM (
    'open',
    'ignored',
    'resolved',
    'pushed_to_pipeline'
);


ALTER TYPE "public"."inventory_reconciliation_status" OWNER TO "postgres";

--
-- Name: order_fulfillment_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."order_fulfillment_status" AS ENUM (
    'unfulfilled',
    'reserved',
    'ready_for_pickup',
    'out_for_delivery',
    'fulfilled',
    'partially_fulfilled',
    'cancelled'
);


ALTER TYPE "public"."order_fulfillment_status" OWNER TO "postgres";

--
-- Name: order_payment_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."order_payment_status" AS ENUM (
    'unpaid',
    'authorized',
    'paid',
    'failed',
    'partially_refunded',
    'refunded',
    'voided'
);


ALTER TYPE "public"."order_payment_status" OWNER TO "postgres";

--
-- Name: order_source_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."order_source_type" AS ENUM (
    'web',
    'shopsite',
    'integra',
    'manual',
    'import'
);


ALTER TYPE "public"."order_source_type" OWNER TO "postgres";

--
-- Name: pipeline_status_five; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."pipeline_status_five" AS ENUM (
    'awaiting_brand',
    'imported',
    'extracting',
    'processed',
    'merging',
    'reviewing',
    'publishing',
    'failed'
);


ALTER TYPE "public"."pipeline_status_five" OWNER TO "postgres";

--
-- Name: pipeline_status_five_legacy; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."pipeline_status_five_legacy" AS ENUM (
    'imported',
    'searching',
    'url_review',
    'scraping',
    'extracting',
    'scraped',
    'consolidating',
    'finalizing',
    'exporting',
    'failed',
    'needs_fallback_review'
);


ALTER TYPE "public"."pipeline_status_five_legacy" OWNER TO "postgres";

--
-- Name: pipeline_status_new_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."pipeline_status_new_enum" AS ENUM (
    'registered',
    'enriched',
    'finalized'
);


ALTER TYPE "public"."pipeline_status_new_enum" OWNER TO "postgres";

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'staff'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";

--
-- Name: admin_migrate_data("uuid", "text", "jsonb", "jsonb", "jsonb", "jsonb", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."admin_migrate_data"("target_user_id" "uuid", "user_email" "text", "profile_data" "jsonb", "work_data" "jsonb", "edu_data" "jsonb", "project_data" "jsonb", "skill_data" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    entry JSONB;
BEGIN
    -- 1. Ensure User Profile Exists (Bypassing RLS)
    INSERT INTO public.users (id, full_name, headline, location, summary, website, linkedin)
    VALUES (
        target_user_id,
        profile_data->>'full_name',
        profile_data->>'headline',
        profile_data->>'location',
        profile_data->>'summary',
        profile_data->>'website',
        profile_data->>'linkedin'
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        headline = EXCLUDED.headline,
        location = EXCLUDED.location,
        summary = EXCLUDED.summary,
        website = EXCLUDED.website,
        linkedin = EXCLUDED.linkedin;

    -- 2. Wipe Master Entries for User (Bypassing RLS)
    DELETE FROM public.master_entries WHERE user_id = target_user_id;

    -- 3. Insert Work Entries
    FOR entry IN SELECT * FROM jsonb_array_elements(work_data)
    LOOP
        INSERT INTO public.master_entries (user_id, type, content)
        VALUES (target_user_id, 'work', entry);
    END LOOP;

    -- 4. Insert Education Entries
    FOR entry IN SELECT * FROM jsonb_array_elements(edu_data)
    LOOP
        INSERT INTO public.master_entries (user_id, type, content)
        VALUES (target_user_id, 'education', entry);
    END LOOP;

    -- 5. Insert Project Entries
    FOR entry IN SELECT * FROM jsonb_array_elements(project_data)
    LOOP
        INSERT INTO public.master_entries (user_id, type, content)
        VALUES (target_user_id, 'project', entry);
    END LOOP;

    -- 6. Insert Skill Entries
    FOR entry IN SELECT * FROM jsonb_array_elements(skill_data)
    LOOP
        INSERT INTO public.master_entries (user_id, type, content)
        VALUES (target_user_id, 'skill', entry);
    END LOOP;

    -- 7. Ensure Resume Exists
    INSERT INTO public.resumes (user_id, title, target_role, content)
    VALUES (
        target_user_id,
        'Full Stack Import',
        'Software Engineer',
        jsonb_build_object(
            'basics', jsonb_build_object(
                'name', profile_data->>'full_name',
                'label', profile_data->>'headline',
                'email', user_email,
                'summary', profile_data->>'summary',
                'location', jsonb_build_object('city', profile_data->>'location')
            ),
            'meta', jsonb_build_object('template', 'modern')
        )
    );
END;
$$;


ALTER FUNCTION "public"."admin_migrate_data"("target_user_id" "uuid", "user_email" "text", "profile_data" "jsonb", "work_data" "jsonb", "edu_data" "jsonb", "project_data" "jsonb", "skill_data" "jsonb") OWNER TO "postgres";

--
-- Name: calculate_scraper_health("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."calculate_scraper_health"("p_scraper_id" "uuid") RETURNS TABLE("health_status" "text", "health_score" integer)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    latest_run record;
    test_passed int := 0;
    test_total int := 0;
    fake_passed int := 0;
    fake_total int := 0;
    score int := 0;
    status text := 'unknown';
BEGIN
    SELECT * INTO latest_run
    FROM scraper_test_runs
    WHERE scraper_id = p_scraper_id
      AND status IN ('passed', 'failed', 'partial')
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF latest_run IS NULL THEN
        RETURN QUERY SELECT 'unknown'::text, 0;
        RETURN;
    END IF;
    
    SELECT 
        COUNT(*) FILTER (WHERE (r->>'sku_type') = 'test' AND (r->>'status') = 'success'),
        COUNT(*) FILTER (WHERE (r->>'sku_type') = 'test'),
        COUNT(*) FILTER (WHERE (r->>'sku_type') = 'fake' AND (r->>'status') = 'no_results'),
        COUNT(*) FILTER (WHERE (r->>'sku_type') = 'fake')
    INTO test_passed, test_total, fake_passed, fake_total
    FROM jsonb_array_elements(latest_run.results) r;
    
    IF test_total > 0 THEN
        score := score + ((test_passed::float / test_total::float) * 70)::int;
    END IF;
    
    IF fake_total > 0 THEN
        score := score + ((fake_passed::float / fake_total::float) * 30)::int;
    ELSE
        score := score + 30;
    END IF;
    
    IF score >= 90 THEN
        status := 'healthy';
    ELSIF score >= 60 THEN
        status := 'degraded';
    ELSE
        status := 'broken';
    END IF;
    
    RETURN QUERY SELECT status, score;
END;
$$;


ALTER FUNCTION "public"."calculate_scraper_health"("p_scraper_id" "uuid") OWNER TO "postgres";

--
-- Name: claim_next_pending_enrichment_attempt("text", integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."claim_next_pending_enrichment_attempt"("p_runner_name" "text", "p_claim_duration_minutes" integer DEFAULT 10) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_attempt_id uuid;
  v_job_id uuid;
  v_sku text;
  v_target_id uuid;
  v_attempt_number int;
  v_mode text;
  v_model text;
  v_source_url text;
  v_lease_token uuid;
  v_lease_expires_at timestamptz;
  v_result jsonb;
begin
  -- Find the next pending attempt, preferring entries with target URLs
  select
    ea.id, ea.job_id, ea.sku, ea.target_id, ea.attempt_number,
    ea.mode, ea.model, ea.source_url
  into
    v_attempt_id, v_job_id, v_sku, v_target_id, v_attempt_number,
    v_mode, v_model, v_source_url
  from public.enrichment_attempts ea
  where ea.status = 'queued'
    and (
      ea.lease_token is null
      or ea.lease_expires_at < now()
    )
  order by
    case when ea.source_url is not null then 0 else 1 end,
    ea.created_at asc
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  -- Generate lease token
  v_lease_token := gen_random_uuid();
  v_lease_expires_at := now() + (p_claim_duration_minutes || ' minutes')::interval;

  -- If no source_url, try to get it from the target
  if v_source_url is null and v_target_id is not null then
    select url into v_source_url
    from public.enrichment_targets
    where id = v_target_id;
  end if;

  -- Update the attempt
  update public.enrichment_attempts
  set
    status = 'running',
    claimed_by = p_runner_name,
    lease_token = v_lease_token,
    lease_expires_at = v_lease_expires_at,
    started_at = now(),
    updated_at = now()
  where id = v_attempt_id;

  -- Update the parent job status
  update public.enrichment_jobs
  set
    status = case when status = 'queued' then 'running' else status end,
    updated_at = now()
  where id = v_job_id;

  -- Build result
  v_result := jsonb_build_object(
    'id', v_attempt_id,
    'job_id', v_job_id,
    'sku', v_sku,
    'target_id', v_target_id,
    'attempt_number', v_attempt_number,
    'mode', v_mode,
    'model', v_model,
    'source_url', v_source_url,
    'lease_token', v_lease_token,
    'lease_expires_at', v_lease_expires_at::text
  );

  return v_result;
end;
$$;


ALTER FUNCTION "public"."claim_next_pending_enrichment_attempt"("p_runner_name" "text", "p_claim_duration_minutes" integer) OWNER TO "postgres";

--
-- Name: ensure_product_storefront_settings_row(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."ensure_product_storefront_settings_row"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    INSERT INTO public.product_storefront_settings (product_id)
    VALUES (NEW.id)
    ON CONFLICT (product_id) DO NOTHING;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_product_storefront_settings_row"() OWNER TO "postgres";

--
-- Name: exec_sql("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."exec_sql"("query" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    EXECUTE query;
    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."exec_sql"("query" "text") OWNER TO "postgres";

--
-- Name: generate_order_number(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."generate_order_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.order_number := 'BSP-' || to_char(now(), 'YYYYMMDD') || '-' || 
        lpad(floor(random() * 10000)::text, 4, '0');
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_order_number"() OWNER TO "postgres";

--
-- Name: generate_subscription_suggestions("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."generate_subscription_suggestions"("p_subscription_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- This is a placeholder. In a real app, logic to generate suggestions would go here.
    NULL;
END;
$$;


ALTER FUNCTION "public"."generate_subscription_suggestions"("p_subscription_id" "uuid") OWNER TO "postgres";

--
-- Name: get_action_required_items(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_action_required_items"() RETURNS TABLE("category" "text", "label" "text", "count" integer, "href" "text", "severity" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
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
$_$;


ALTER FUNCTION "public"."get_action_required_items"() OWNER TO "postgres";

--
-- Name: get_ai_cost_stats("date", "date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_ai_cost_stats"("p_start_date" "date", "p_end_date" "date") RETURNS TABLE("total_cost" numeric, "total_runs" bigint, "avg_cost_per_run" numeric, "total_input_tokens" bigint, "total_output_tokens" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(total_cost_usd), 0)::DECIMAL,
        COUNT(*)::BIGINT,
        COALESCE(AVG(total_cost_usd), 0)::DECIMAL,
        COALESCE(SUM(input_tokens), 0)::BIGINT,
        COALESCE(SUM(output_tokens), 0)::BIGINT
    FROM public.ai_scraper_costs
    WHERE DATE(created_at) BETWEEN p_start_date AND p_end_date;
END;
$$;


ALTER FUNCTION "public"."get_ai_cost_stats"("p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";

--
-- Name: get_dashboard_recent_activity(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_dashboard_recent_activity"("limit_count" integer DEFAULT 10) RETURNS TABLE("id" "uuid", "type" "text", "title" "text", "description" "text", "status" "text", "activity_timestamp" timestamp with time zone, "href" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  (
    -- Recent Enrichment Jobs (Replaces legacy scrape jobs)
    SELECT 
      j.id,
      'pipeline' as type,
      'Pipeline Job ' || j.status as title,
      CASE 
        WHEN j.config->'scrapers' IS NOT NULL THEN (SELECT string_agg(s::text, ', ') FROM jsonb_array_elements_text(j.config->'scrapers') s)
        ELSE 'General Enrichment'
      END as description,
      CASE 
        WHEN j.status = 'completed' THEN 'success'
        WHEN j.status = 'failed' THEN 'warning'
        WHEN j.status = 'running' OR j.status = 'claimed' THEN 'info'
        ELSE 'pending'
      END as status,
      j.created_at as activity_timestamp,
      '/admin/pipeline/active-runs' as href
    FROM public.enrichment_jobs j
    ORDER BY j.created_at DESC
    LIMIT limit_count
  )
  UNION ALL
  (
    -- Recent Product Updates
    SELECT 
      p.id,
      'product' as type,
      'Product Updated: ' || p.name as title,
      p.sku as description,
      'info' as status,
      p.updated_at as activity_timestamp,
      '/admin/products/' || p.id as href
    FROM public.products p
    ORDER BY p.updated_at DESC
    LIMIT limit_count
  )
  ORDER BY activity_timestamp DESC
  LIMIT limit_count;
END;
$$;


ALTER FUNCTION "public"."get_dashboard_recent_activity"("limit_count" integer) OWNER TO "postgres";

--
-- Name: get_inventory_drift(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_inventory_drift"("p_days" integer DEFAULT 7) RETURNS TABLE("sku" "text", "name" "text", "field" "text", "before_value" "text", "after_value" "text", "sync_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'staff')
    ) THEN
        RAISE EXCEPTION 'Access denied. Admin or staff role required.';
    END IF;

    RETURN QUERY
    WITH latest_sync AS (
        SELECT candidate.preview, candidate.sync_at
        FROM (
            SELECT
                r.metadata->'preview' AS preview,
                r.started_at AS sync_at
            FROM public.integration_sync_runs r
            WHERE r.sync_kind = 'inventory'
              AND r.status IN ('completed', 'partial')
              AND r.metadata ? 'preview'
              AND jsonb_typeof(r.metadata->'preview') = 'array'
              AND r.started_at >= now() - (p_days || ' days')::interval

            UNION ALL

            SELECT
                ml.metadata->'preview' AS preview,
                ml.started_at AS sync_at
            FROM public.migration_log ml
            WHERE ml.sync_type = 'register_inventory'
              AND ml.status = 'completed'
              AND ml.metadata ? 'preview'
              AND jsonb_typeof(ml.metadata->'preview') = 'array'
              AND ml.started_at >= now() - (p_days || ' days')::interval
        ) AS candidate
        ORDER BY candidate.sync_at DESC
        LIMIT 1
    ),
    expanded_preview AS (
        SELECT
            jsonb_array_elements(preview) AS item,
            sync_at
        FROM latest_sync
    ),
    expanded_changes AS (
        SELECT
            item->>'sku' AS sku,
            item->>'name' AS name,
            jsonb_array_elements(
                CASE
                    WHEN jsonb_typeof(item->'changes') = 'array' THEN item->'changes'
                    ELSE '[]'::jsonb
                END
            ) AS change,
            sync_at
        FROM expanded_preview
    )
    SELECT
        ec.sku,
        ec.name,
        ec.change->>'field' AS field,
        ec.change->>'before' AS before_value,
        ec.change->>'after' AS after_value,
        ec.sync_at
    FROM expanded_changes ec;
END;
$$;


ALTER FUNCTION "public"."get_inventory_drift"("p_days" integer) OWNER TO "postgres";

--
-- Name: FUNCTION "get_inventory_drift"("p_days" integer); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."get_inventory_drift"("p_days" integer) IS 'Returns inventory changes from the most recent successful register_inventory sync within the specified number of days.';


--
-- Name: get_job_retry_history("text", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_job_retry_history"("p_job_type" "text", "p_job_id" "uuid") RETURNS TABLE("retry_id" "uuid", "status" "text", "attempt_count" integer, "retry_reason" "text", "error_log" "text"[], "created_at" timestamp with time zone, "last_attempt_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."get_job_retry_history"("p_job_type" "text", "p_job_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "get_job_retry_history"("p_job_type" "text", "p_job_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."get_job_retry_history"("p_job_type" "text", "p_job_id" "uuid") IS 'Returns all retry attempts for a specific job.';


--
-- Name: get_next_version_number("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_next_version_number"("p_config_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_max_version INTEGER;
BEGIN
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_max_version
    FROM public.scraper_config_versions
    WHERE config_id = p_config_id;
    RETURN v_max_version;
END;
$$;


ALTER FUNCTION "public"."get_next_version_number"("p_config_id" "uuid") OWNER TO "postgres";

--
-- Name: get_pending_image_retries(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_pending_image_retries"("p_limit" integer DEFAULT 10) RETURNS TABLE("retry_id" "uuid", "sku" "text", "image_url" "text", "error_type" "public"."image_error_type", "retry_count" integer, "max_retries" integer, "last_error" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    irq.id,
    irq.sku,
    irq.image_url,
    irq.error_type,
    irq.retry_count,
    irq.max_retries,
    irq.last_error
  FROM public.image_retry_queue irq
  WHERE irq.status = 'pending'
    AND irq.scheduled_for <= now()
    AND irq.retry_count < irq.max_retries
  ORDER BY irq.scheduled_for ASC, irq.retry_count ASC
  LIMIT p_limit;
$$;


ALTER FUNCTION "public"."get_pending_image_retries"("p_limit" integer) OWNER TO "postgres";

--
-- Name: get_pending_retries(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_pending_retries"("p_limit" integer DEFAULT 10) RETURNS TABLE("retry_id" "uuid", "job_type" "text", "original_job_id" "uuid", "retry_reason" "text", "priority" integer, "attempt_count" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."get_pending_retries"("p_limit" integer) OWNER TO "postgres";

--
-- Name: FUNCTION "get_pending_retries"("p_limit" integer); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."get_pending_retries"("p_limit" integer) IS 'Returns pending retries ready for processing, ordered by priority.';


--
-- Name: get_personalized_products("uuid", integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_personalized_products"("user_uuid" "uuid", "result_limit" integer DEFAULT 12) RETURNS TABLE("id" "uuid", "brand_id" "uuid", "name" "text", "slug" "text", "price" numeric, "stock_status" "text", "images" "text"[], "pet_name" "text", "pet_type_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_personalized_products"("user_uuid" "uuid", "result_limit" integer) OWNER TO "postgres";

--
-- Name: get_pipeline_stage_sources("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_pipeline_stage_sources"("p_stage_status" "text") RETURNS TABLE("source_key" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT jsonb_object_keys(sources) as source_key
    FROM products_ingestion
    WHERE pipeline_status = p_stage_status::pipeline_status_five
      AND exported_at IS NULL
      AND sources IS NOT NULL;
END;
$$;


ALTER FUNCTION "public"."get_pipeline_stage_sources"("p_stage_status" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "get_pipeline_stage_sources"("p_stage_status" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."get_pipeline_stage_sources"("p_stage_status" "text") IS 'Extracts unique source keys from JSONB database-side to avoid fetching all rows.';


--
-- Name: get_pipeline_status_counts(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_pipeline_status_counts"() RETURNS TABLE("status" "text", "count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT pipeline_status::text as status, COUNT(*) as count
    FROM products_ingestion
    WHERE exported_at IS NULL
    GROUP BY pipeline_status;
END;
$$;


ALTER FUNCTION "public"."get_pipeline_status_counts"() OWNER TO "postgres";

--
-- Name: FUNCTION "get_pipeline_status_counts"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."get_pipeline_status_counts"() IS 'Aggregates pipeline status counts database-side to avoid fetching all rows.';


--
-- Name: get_product_image_retry_history("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_product_image_retry_history"("p_sku" "text") RETURNS TABLE("retry_id" "uuid", "image_url" "text", "error_type" "public"."image_error_type", "retry_count" integer, "status" "public"."image_retry_status", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    irq.id,
    irq.image_url,
    irq.error_type,
    irq.retry_count,
    irq.status,
    irq.created_at,
    irq.updated_at
  FROM public.image_retry_queue irq
  WHERE irq.sku = p_sku
  ORDER BY irq.created_at DESC;
$$;


ALTER FUNCTION "public"."get_product_image_retry_history"("p_sku" "text") OWNER TO "postgres";

--
-- Name: get_products_for_pet_types("uuid"[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_products_for_pet_types"("pet_type_ids" "uuid"[]) RETURNS TABLE("id" "uuid", "brand_id" "uuid", "name" "text", "slug" "text", "price" numeric, "stock_status" "text", "images" "text"[], "pet_type_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_products_for_pet_types"("pet_type_ids" "uuid"[]) OWNER TO "postgres";

--
-- Name: get_sales_metrics(timestamp without time zone, timestamp without time zone, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_sales_metrics"("start_date" timestamp without time zone, "end_date" timestamp without time zone, "p_source" "text" DEFAULT NULL::"text") RETURNS TABLE("total_revenue" numeric, "total_orders" bigint, "average_order_value" numeric, "total_tax" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_sales_metrics"("start_date" timestamp without time zone, "end_date" timestamp without time zone, "p_source" "text") OWNER TO "postgres";

--
-- Name: get_sales_trends(timestamp without time zone, timestamp without time zone, "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_sales_trends"("start_date" timestamp without time zone, "end_date" timestamp without time zone, "period" "text" DEFAULT 'day'::"text", "p_source" "text" DEFAULT NULL::"text") RETURNS TABLE("period_date" "text", "revenue" numeric, "orders" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_sales_trends"("start_date" timestamp without time zone, "end_date" timestamp without time zone, "period" "text", "p_source" "text") OWNER TO "postgres";

--
-- Name: get_store_analytics(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_store_analytics"("start_date" timestamp with time zone, "end_date" timestamp with time zone) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  revenue_total numeric;
  order_count int;
  avg_order_value numeric;
  revenue_by_day json;
  orders_by_status json;
  top_products json;
  result json;
BEGIN
  -- 1. Revenue metrics
  SELECT 
    coalesce(sum(total), 0),
    count(*),
    coalesce(avg(total), 0)
  INTO 
    revenue_total,
    order_count,
    avg_order_value
  FROM orders
  WHERE created_at >= start_date AND created_at <= end_date;

  -- 2. Revenue by day
  WITH daily_stats AS (
    SELECT 
      date_trunc('day', (created_at AT TIME ZONE 'UTC'))::date as date,
      sum(total) as revenue,
      count(*) as orders
    FROM orders
    WHERE created_at >= start_date AND created_at <= end_date
    GROUP BY 1
    ORDER BY 1
  )
  SELECT json_agg(t) INTO revenue_by_day
  FROM daily_stats t;

  -- 3. Orders by status
  WITH status_counts AS (
    SELECT 
      status,
      count(*) as count
    FROM orders
    WHERE created_at >= start_date AND created_at <= end_date
    GROUP BY 1
    ORDER BY 2 DESC
  )
  SELECT json_agg(t) INTO orders_by_status
  FROM status_counts t;

  -- 4. Top products
  WITH product_sales AS (
    SELECT 
      oi.item_name as name,
      sum(oi.quantity) as quantity,
      sum(oi.total_price) as revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.created_at >= start_date AND o.created_at <= end_date
    GROUP BY 1
    ORDER BY 3 DESC
    LIMIT 10
  )
  SELECT json_agg(t) INTO top_products
  FROM product_sales t;

  -- Combine into result
  result := json_build_object(
    'revenue', json_build_object(
      'total', revenue_total,
      'orderCount', order_count,
      'averageOrderValue', avg_order_value
    ),
    'revenueByDay', coalesce(revenue_by_day, '[]'::json),
    'ordersByStatus', coalesce(orders_by_status, '[]'::json),
    'topProducts', coalesce(top_products, '[]'::json)
  );

  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_store_analytics"("start_date" timestamp with time zone, "end_date" timestamp with time zone) OWNER TO "postgres";

--
-- Name: get_sync_health(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_sync_health"("p_days" integer DEFAULT 30) RETURNS TABLE("started_at" timestamp with time zone, "sync_type" "text", "status" "text", "processed" integer, "created" integer, "updated" integer, "failed" integer, "duration_ms" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'staff')
    ) THEN
        RAISE EXCEPTION 'Access denied. Admin or staff role required.';
    END IF;

    RETURN QUERY
    WITH canonical_runs AS (
        SELECT
            r.started_at,
            CASE
                WHEN r.source_type = 'shopsite'::public.order_source_type THEN r.sync_kind
                ELSE concat(r.source_type::text, ':', r.sync_kind)
            END AS sync_type,
            r.status,
            COALESCE(r.row_count, 0) AS processed,
            COALESCE(r.inserted_count, 0) AS created,
            COALESCE(r.updated_count, 0) AS updated,
            COALESCE(r.error_count, 0) AS failed,
            CASE
                WHEN r.completed_at IS NULL THEN NULL
                ELSE GREATEST(
                    FLOOR(EXTRACT(EPOCH FROM (r.completed_at - r.started_at)) * 1000)::integer,
                    0
                )
            END AS duration_ms
        FROM public.integration_sync_runs r
        WHERE r.started_at >= now() - (p_days || ' days')::interval
    ),
    legacy_runs AS (
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
          AND NOT EXISTS (
              SELECT 1
              FROM public.integration_sync_runs r
              WHERE r.source_type = 'shopsite'::public.order_source_type
                AND r.sync_kind = ml.sync_type
                AND r.started_at BETWEEN ml.started_at - interval '5 minutes'
                                    AND ml.started_at + interval '5 minutes'
          )
    )
    SELECT * FROM canonical_runs
    UNION ALL
    SELECT * FROM legacy_runs
    ORDER BY started_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_sync_health"("p_days" integer) OWNER TO "postgres";

--
-- Name: FUNCTION "get_sync_health"("p_days" integer); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."get_sync_health"("p_days" integer) IS 'Returns summarized sync status from migration_log for the specified number of days.';


--
-- Name: handle_default_address(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."handle_default_address"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
    if new.is_default then
        update addresses set is_default = false 
        where user_id = new.user_id and id <> new.id;
    end if;
    return new;
end;
$$;


ALTER FUNCTION "public"."handle_default_address"() OWNER TO "postgres";

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

--
-- Name: insert_scraper_test_run("uuid", "text", "text"[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."insert_scraper_test_run"("p_scraper_id" "uuid", "p_test_type" "text", "p_skus_tested" "text"[]) RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO scraper_test_runs (scraper_id, test_type, skus_tested, status, started_at)
  VALUES (p_scraper_id, p_test_type, p_skus_tested, 'pending', NOW())
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."insert_scraper_test_run"("p_scraper_id" "uuid", "p_test_type" "text", "p_skus_tested" "text"[]) OWNER TO "postgres";

--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";

--
-- Name: is_source_enabled("text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_source_enabled"("p_sku" "text", "p_source_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT 
    CASE 
      -- If enrichment_config is empty or enabled_sources not set, return true (default: all sources enabled)
      WHEN (
        SELECT enrichment_config->'enabled_sources' 
        FROM products_ingestion 
        WHERE sku = p_sku
      ) IS NULL THEN true
      -- Otherwise check if source is in the array
      ELSE (
        SELECT enrichment_config->'enabled_sources' ? p_source_id
        FROM products_ingestion 
        WHERE sku = p_sku
      )
    END;
$$;


ALTER FUNCTION "public"."is_source_enabled"("p_sku" "text", "p_source_id" "text") OWNER TO "postgres";

--
-- Name: is_staff(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('admin', 'staff')
  );
$$;


ALTER FUNCTION "public"."is_staff"() OWNER TO "postgres";

--
-- Name: mark_first_order_complete(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."mark_first_order_complete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."mark_first_order_complete"() OWNER TO "postgres";

--
-- Name: merge_enrichment_attempt_result("text", "uuid", "uuid", "text", numeric, "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."merge_enrichment_attempt_result"("p_sku" "text", "p_job_id" "uuid", "p_attempt_id" "uuid", "p_status" "text", "p_confidence" numeric, "p_source_url" "text", "p_source_data" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_current_status text;
  v_sources jsonb;
  v_new_status text;
begin
  -- Get current product status
  select pipeline_status, coalesce(sources, '{}'::jsonb)
  into v_current_status, v_sources
  from public.products_ingestion
  where sku = p_sku
  for update;

  if not found then
    raise warning 'Product SKU % not found in products_ingestion', p_sku;
    return;
  end if;

  -- Merge the enrichment result into sources.enriched
  v_sources := jsonb_set(
    coalesce(v_sources, '{}'::jsonb),
    '{enriched}',
    p_source_data,
    true
  );

  -- Determine next status based on result
  if p_status = 'success' then
    v_new_status := 'processed';
  elsif p_status = 'partial' and p_confidence >= 0.7 then
    v_new_status := 'processed';
  else
    -- Failed or low confidence - return to url_review for retry
    v_new_status := 'url_review';
  end if;

  -- Update the product
  update public.products_ingestion
  set
    sources = v_sources,
    pipeline_status = v_new_status::text::public.pipeline_status_five,
    updated_at = now()
  where sku = p_sku;
end;
$$;


ALTER FUNCTION "public"."merge_enrichment_attempt_result"("p_sku" "text", "p_job_id" "uuid", "p_attempt_id" "uuid", "p_status" "text", "p_confidence" numeric, "p_source_url" "text", "p_source_data" "jsonb") OWNER TO "postgres";

--
-- Name: record_product_price_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."record_product_price_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF OLD.price IS DISTINCT FROM NEW.price THEN
    INSERT INTO public.price_history (product_id, price, compare_at_price, recorded_at)
    VALUES (NEW.id, NEW.price, NULL, now());
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."record_product_price_change"() OWNER TO "postgres";

--
-- Name: record_variant_price_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."record_variant_price_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF OLD.price IS DISTINCT FROM NEW.price THEN
    INSERT INTO price_history (product_id, variant_id, price, compare_at_price, recorded_at)
    VALUES (NEW.product_id, NEW.id, NEW.price, NEW.compare_at_price, now());
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."record_variant_price_change"() OWNER TO "postgres";

--
-- Name: set_order_source_type(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_order_source_type"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."set_order_source_type"() OWNER TO "postgres";

--
-- Name: sync_inventory_to_products(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."sync_inventory_to_products"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    -- Upsert into products table
    -- We store price and name in 'input' JSONB
    INSERT INTO products (sku, input, pipeline_status)
    VALUES (
        NEW.sku, 
        jsonb_strip_nulls(jsonb_build_object(
            'price', NEW.price,
            'name', NEW.name
        )),
        'staging'
    )
    ON CONFLICT (sku) DO UPDATE
    SET 
        input = products.input || jsonb_strip_nulls(jsonb_build_object(
            'price', NEW.price,
            'name', NEW.name
        )),
        updated_at = NOW();
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_inventory_to_products"() OWNER TO "postgres";

--
-- Name: update_b2b_feeds_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_b2b_feeds_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_b2b_feeds_updated_at"() OWNER TO "postgres";

--
-- Name: update_batch_jobs_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_batch_jobs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_batch_jobs_updated_at"() OWNER TO "postgres";

--
-- Name: update_brand_scraper_affinity_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_brand_scraper_affinity_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_brand_scraper_affinity_updated_at"() OWNER TO "postgres";

--
-- Name: update_brand_scraper_mappings_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_brand_scraper_mappings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_brand_scraper_mappings_updated_at"() OWNER TO "postgres";

--
-- Name: update_brand_sources_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_brand_sources_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_brand_sources_updated_at"() OWNER TO "postgres";

--
-- Name: update_cohort_batches_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_cohort_batches_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_cohort_batches_updated_at"() OWNER TO "postgres";

--
-- Name: update_enrichment_job_counters("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_enrichment_job_counters"("p_job_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_total int;
  v_completed int;
  v_failed int;
  v_status text;
begin
  select
    count(*),
    count(*) filter (where status in ('success', 'partial', 'failed')),
    count(*) filter (where status = 'failed')
  into v_total, v_completed, v_failed
  from public.enrichment_attempts
  where job_id = p_job_id;

  -- Determine job status
  if v_completed >= v_total then
    if v_failed > 0 then
      v_status := 'completed_with_errors';
    else
      v_status := 'completed';
    end if;
  else
    v_status := 'running';
  end if;

  update public.enrichment_jobs
  set
    total_count = v_total,
    completed_count = v_completed,
    failed_count = v_failed,
    status = v_status,
    completed_at = case when v_completed >= v_total then now() else completed_at end,
    updated_at = now()
  where id = p_job_id;
end;
$$;


ALTER FUNCTION "public"."update_enrichment_job_counters"("p_job_id" "uuid") OWNER TO "postgres";

--
-- Name: update_enrichment_tables_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_enrichment_tables_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_enrichment_tables_updated_at"() OWNER TO "postgres";

--
-- Name: update_health_metrics(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_health_metrics"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    INSERT INTO public.scraper_health_metrics (
        config_id,
        metric_date,
        total_runs,
        passed_runs,
        failed_runs,
        avg_duration_ms,
        selector_health,
        updated_at
    )
    SELECT 
        sc.id AS config_id,
        DATE(str.created_at) AS metric_date,
        COUNT(*) AS total_runs,
        COUNT(*) FILTER (WHERE str.status = 'passed') AS passed_runs,
        COUNT(*) FILTER (WHERE str.status = 'failed') AS failed_runs,
        AVG(str.duration_ms)::INTEGER AS avg_duration_ms,
        '{}'::JSONB AS selector_health,
        NOW() AS updated_at
    FROM public.scraper_test_runs str
    JOIN public.scraper_configs sc ON str.scraper_id = sc.id
    WHERE str.created_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY sc.id, DATE(str.created_at)
    ON CONFLICT (config_id, metric_date) 
    DO UPDATE SET
        total_runs = EXCLUDED.total_runs,
        passed_runs = EXCLUDED.passed_runs,
        failed_runs = EXCLUDED.failed_runs,
        avg_duration_ms = EXCLUDED.avg_duration_ms,
        selector_health = EXCLUDED.selector_health,
        updated_at = NOW();
END;
$$;


ALTER FUNCTION "public"."update_health_metrics"() OWNER TO "postgres";

--
-- Name: update_health_metrics_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_health_metrics_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_health_metrics_updated_at"() OWNER TO "postgres";

--
-- Name: update_image_retry_queue_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_image_retry_queue_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_image_retry_queue_updated_at"() OWNER TO "postgres";

--
-- Name: update_inventory_items_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_inventory_items_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_inventory_items_updated_at"() OWNER TO "postgres";

--
-- Name: update_llm_parallel_runs_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_llm_parallel_runs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_llm_parallel_runs_updated_at"() OWNER TO "postgres";

--
-- Name: update_pipeline_retry_queue_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_pipeline_retry_queue_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_pipeline_retry_queue_updated_at"() OWNER TO "postgres";

--
-- Name: update_product_groups_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_product_groups_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_product_groups_updated_at"() OWNER TO "postgres";

--
-- Name: update_product_scraped_sites_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_product_scraped_sites_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_product_scraped_sites_updated_at"() OWNER TO "postgres";

--
-- Name: update_promo_code_usage(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_promo_code_usage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    UPDATE promo_codes 
    SET current_uses = current_uses + 1,
        updated_at = now()
    WHERE id = NEW.promo_code_id;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_promo_code_usage"() OWNER TO "postgres";

--
-- Name: update_review_helpful_count(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_review_helpful_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE product_reviews 
    SET helpful_count = (
      SELECT COUNT(*) FILTER (WHERE is_helpful = true) - COUNT(*) FILTER (WHERE is_helpful = false)
      FROM review_helpful_votes 
      WHERE review_id = NEW.review_id
    )
    WHERE id = NEW.review_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE product_reviews 
    SET helpful_count = (
      SELECT COALESCE(COUNT(*) FILTER (WHERE is_helpful = true) - COUNT(*) FILTER (WHERE is_helpful = false), 0)
      FROM review_helpful_votes 
      WHERE review_id = OLD.review_id
    )
    WHERE id = OLD.review_id;
    RETURN OLD;
  END IF;
END;
$$;


ALTER FUNCTION "public"."update_review_helpful_count"() OWNER TO "postgres";

--
-- Name: update_scraper_configs_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_scraper_configs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_scraper_configs_updated_at"() OWNER TO "postgres";

--
-- Name: update_scraper_test_run("uuid", "text", "jsonb", "text", integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_scraper_test_run"("p_id" "uuid", "p_status" "text", "p_results" "jsonb" DEFAULT '[]'::"jsonb", "p_error_message" "text" DEFAULT NULL::"text", "p_duration_ms" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE scraper_test_runs
  SET 
    status = p_status,
    results = p_results,
    error_message = p_error_message,
    duration_ms = p_duration_ms,
    completed_at = NOW()
  WHERE id = p_id;
END;
$$;


ALTER FUNCTION "public"."update_scraper_test_run"("p_id" "uuid", "p_status" "text", "p_results" "jsonb", "p_error_message" "text", "p_duration_ms" integer) OWNER TO "postgres";

--
-- Name: update_service_costs_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_service_costs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_service_costs_updated_at"() OWNER TO "postgres";

--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

--
-- Name: update_user_pets_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."update_user_pets_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_pets_updated_at"() OWNER TO "postgres";

--
-- Name: upsert_recently_viewed("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."upsert_recently_viewed"("p_user_id" "uuid", "p_product_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO recently_viewed (user_id, product_id, viewed_at)
  VALUES (p_user_id, p_product_id, now())
  ON CONFLICT (user_id, product_id) 
  DO UPDATE SET viewed_at = now();
END;
$$;


ALTER FUNCTION "public"."upsert_recently_viewed"("p_user_id" "uuid", "p_product_id" "uuid") OWNER TO "postgres";

--
-- Name: validate_ai_config("jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."validate_ai_config"("config" "jsonb") RETURNS TABLE("valid" boolean, "errors" "text"[])
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."validate_ai_config"("config" "jsonb") OWNER TO "postgres";

--
-- Name: FUNCTION "validate_ai_config"("config" "jsonb"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."validate_ai_config"("config" "jsonb") IS 'Validates AI scraper configuration. Returns (valid=true, errors=[]) if valid, otherwise (valid=false, errors=[...]).
Checks:
- ai_config exists when scraper_type="ai"
- task is non-empty
- max_steps is between 1-50
- confidence_threshold is between 0-1
- llm_model is valid';


--
-- Name: validate_runner_api_key("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."validate_runner_api_key"("api_key" "text") RETURNS TABLE("runner_name" "text", "key_id" "uuid", "is_valid" boolean, "allowed_scrapers" "text"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    key_hash_value text;
    result record;
BEGIN
    -- Hash the provided key
    key_hash_value := encode(sha256(api_key::bytea), 'hex');
    
    -- Look up the key
    SELECT 
        rak.runner_name,
        rak.id as key_id,
        true as is_valid,
        COALESCE(rak.allowed_scrapers, ARRAY[]::text[]) as allowed_scrapers
    INTO result
    FROM runner_api_keys rak
    WHERE rak.key_hash = key_hash_value
      AND rak.revoked_at IS NULL
      AND (rak.expires_at IS NULL OR rak.expires_at > now());
    
    IF result IS NULL THEN
        RETURN QUERY SELECT null::text, null::uuid, false, ARRAY[]::text[];
        RETURN;
    END IF;
    
    -- Update last_used_at
    UPDATE runner_api_keys 
    SET last_used_at = now() 
    WHERE id = result.key_id;
    
    RETURN QUERY SELECT result.runner_name, result.key_id, result.is_valid, result.allowed_scrapers;
END;
$$;


ALTER FUNCTION "public"."validate_runner_api_key"("api_key" "text") OWNER TO "postgres";

--
-- Name: validate_user_api_key("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."validate_user_api_key"("api_key" "text") RETURNS TABLE("user_id" "uuid", "key_id" "uuid", "role" "public"."user_role", "is_valid" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
    key_hash_value text;
    result record;
begin
    -- Hash the provided key
    key_hash_value := encode(sha256(api_key::bytea), 'hex');

    -- Look up the key
    select
        uak.user_id,
        uak.id as key_id,
        uak.role,
        true as is_valid
    into result
    from user_api_keys uak
    where uak.key_hash = key_hash_value
      and uak.revoked_at is null
      and (uak.expires_at is null or uak.expires_at > now());

    if result is null then
        return query select null::uuid, null::uuid, null::user_role, false;
        return;
    end if;

    -- Update last_used_at atomically
    update user_api_keys
    set last_used_at = now()
    where id = result.key_id;

    return query select result.user_id, result.key_id, result.role, result.is_valid;
end;
$$;


ALTER FUNCTION "public"."validate_user_api_key"("api_key" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: addresses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "address_line1" "text" NOT NULL,
    "address_line2" "text",
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "zip_code" "text" NOT NULL,
    "phone" "text",
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."addresses" OWNER TO "postgres";

--
-- Name: admin_orders_list; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."admin_orders_list" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"text" AS "order_number",
    NULL::"public"."order_source_type" AS "source_type",
    NULL::"text" AS "source_system",
    NULL::"text" AS "external_order_id",
    NULL::"text" AS "customer_name",
    NULL::"text" AS "customer_email",
    NULL::"text" AS "customer_phone",
    NULL::"text" AS "status",
    NULL::"text" AS "payment_method",
    NULL::"public"."order_payment_status" AS "payment_status",
    NULL::"text" AS "fulfillment_method",
    NULL::"public"."order_fulfillment_status" AS "fulfillment_status",
    NULL::numeric(10,2) AS "subtotal",
    NULL::numeric(10,2) AS "tax",
    NULL::numeric(10,2) AS "total",
    NULL::timestamp with time zone AS "created_at",
    NULL::timestamp with time zone AS "updated_at",
    NULL::bigint AS "item_count",
    NULL::bigint AS "total_quantity";


ALTER VIEW "public"."admin_orders_list" OWNER TO "postgres";

--
-- Name: ai_provider_credentials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ai_provider_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "encrypted_value" "text" NOT NULL,
    "iv" "text" NOT NULL,
    "auth_tag" "text" NOT NULL,
    "key_version" integer DEFAULT 1 NOT NULL,
    "last4" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "ai_provider_credentials_provider_check" CHECK (("provider" = ANY (ARRAY['deepseek'::"text", 'openai'::"text", 'openai_compatible'::"text", 'gemini'::"text", 'lmstudio'::"text", 'serpapi'::"text", 'brave'::"text"])))
);


ALTER TABLE "public"."ai_provider_credentials" OWNER TO "postgres";

--
-- Name: TABLE "ai_provider_credentials"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."ai_provider_credentials" IS 'Encrypted provider API keys for AI scraping runtime (DeepSeek/OpenAI/OpenAI-compatible/Gemini/LM Studio/SerpAPI/Brave).';


--
-- Name: COLUMN "ai_provider_credentials"."encrypted_value"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ai_provider_credentials"."encrypted_value" IS 'AES-256-GCM encrypted API key payload.';


--
-- Name: COLUMN "ai_provider_credentials"."last4"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ai_provider_credentials"."last4" IS 'Masked key suffix displayed in admin UI.';


--
-- Name: scraper_config_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."scraper_config_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "config_id" "uuid" NOT NULL,
    "schema_version" character varying(50) NOT NULL,
    "status" character varying(50) DEFAULT 'draft'::character varying NOT NULL,
    "version_number" integer NOT NULL,
    "published_at" timestamp with time zone,
    "published_by" "uuid",
    "change_summary" "text",
    "validation_result" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "ai_config" "jsonb",
    "anti_detection" "jsonb",
    "validation_config" "jsonb",
    "login_config" "jsonb",
    "http_status_config" "jsonb",
    "normalization_config" "jsonb",
    "timeout" integer DEFAULT 30,
    "retries" integer DEFAULT 3,
    "image_quality" integer DEFAULT 50,
    CONSTRAINT "scraper_config_versions_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('draft'::character varying)::"text", ('validated'::character varying)::"text", ('published'::character varying)::"text", ('archived'::character varying)::"text"]))),
    CONSTRAINT "valid_status" CHECK ((("status")::"text" = ANY (ARRAY[('draft'::character varying)::"text", ('validated'::character varying)::"text", ('published'::character varying)::"text", ('archived'::character varying)::"text"])))
);


ALTER TABLE "public"."scraper_config_versions" OWNER TO "postgres";

--
-- Name: scraper_configs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."scraper_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" character varying(255) NOT NULL,
    "display_name" character varying(255) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "base_url" "text",
    "created_by" "uuid",
    "current_version_id" "uuid",
    "domain" character varying(512),
    "health_score" integer DEFAULT 0,
    "health_status" "text" DEFAULT 'unknown'::"text",
    "last_test_at" timestamp with time zone,
    "schema_version" character varying(50) DEFAULT '1.0'::character varying NOT NULL,
    "scraper_type" "text" DEFAULT 'static'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text",
    CONSTRAINT "scraper_configs_scraper_type_check" CHECK (("scraper_type" = ANY (ARRAY['static'::"text", 'agentic'::"text"])))
);


ALTER TABLE "public"."scraper_configs" OWNER TO "postgres";

--
-- Name: TABLE "scraper_configs"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."scraper_configs" IS 'Scraper configuration registry - simplified for YAML-based workflow. Each config references a YAML file in scrapers/configs/.';


--
-- Name: COLUMN "scraper_configs"."slug"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scraper_configs"."slug" IS 'Unique identifier matching YAML filename (e.g., amazon, ai-phillips)';


--
-- Name: COLUMN "scraper_configs"."display_name"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scraper_configs"."display_name" IS 'Human-readable display name';


--
-- Name: COLUMN "scraper_configs"."created_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scraper_configs"."created_at" IS 'Timestamp when config was originally created';


--
-- Name: COLUMN "scraper_configs"."updated_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scraper_configs"."updated_at" IS 'Timestamp of last update';


--
-- Name: ai_scraper_stats; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."ai_scraper_stats" AS
 SELECT "sc"."id" AS "config_id",
    "sc"."slug",
    "sc"."display_name",
    "cv"."version_number",
    "cv"."status",
        CASE
            WHEN ("cv"."ai_config" IS NOT NULL) THEN 'ai'::"text"
            ELSE 'static'::"text"
        END AS "scraper_type",
    ("cv"."ai_config" ->> 'llm_model'::"text") AS "llm_model",
    (("cv"."ai_config" ->> 'max_steps'::"text"))::integer AS "max_steps",
    (("cv"."ai_config" ->> 'confidence_threshold'::"text"))::numeric AS "confidence_threshold",
    "cv"."published_at",
    "cv"."created_at"
   FROM ("public"."scraper_configs" "sc"
     JOIN "public"."scraper_config_versions" "cv" ON (("sc"."id" = "cv"."config_id")))
  WHERE ("cv"."ai_config" IS NOT NULL)
  ORDER BY "cv"."created_at" DESC;


ALTER VIEW "public"."ai_scraper_stats" OWNER TO "postgres";

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "encrypted" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";

--
-- Name: b2b_feeds; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."b2b_feeds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "distributor_code" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "feed_type" "text" NOT NULL,
    "status" "text" DEFAULT 'unconfigured'::"text" NOT NULL,
    "last_sync_at" timestamp with time zone,
    "last_sync_job_id" "uuid",
    "sync_frequency" "text" DEFAULT 'daily'::"text",
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "enabled" boolean DEFAULT false,
    "products_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "b2b_feeds_feed_type_check" CHECK (("feed_type" = ANY (ARRAY['REST'::"text", 'SFTP'::"text", 'EDI'::"text"]))),
    CONSTRAINT "b2b_feeds_status_check" CHECK (("status" = ANY (ARRAY['healthy'::"text", 'degraded'::"text", 'offline'::"text", 'unconfigured'::"text"]))),
    CONSTRAINT "b2b_feeds_sync_frequency_check" CHECK (("sync_frequency" = ANY (ARRAY['hourly'::"text", 'daily'::"text", 'weekly'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."b2b_feeds" OWNER TO "postgres";

--
-- Name: b2b_sync_jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."b2b_sync_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "feed_id" "uuid" NOT NULL,
    "job_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "products_fetched" integer DEFAULT 0,
    "products_created" integer DEFAULT 0,
    "products_updated" integer DEFAULT 0,
    "products_failed" integer DEFAULT 0,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "b2b_sync_jobs_job_type_check" CHECK (("job_type" = ANY (ARRAY['catalog'::"text", 'inventory'::"text", 'pricing'::"text", 'full'::"text"]))),
    CONSTRAINT "b2b_sync_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."b2b_sync_jobs" OWNER TO "postgres";

--
-- Name: batch_job_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."batch_job_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_job_id" "uuid" NOT NULL,
    "sku" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "request_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "response_payload" "jsonb",
    "parsed_result" "jsonb",
    "product_source" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_message" "text",
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "fallback_batch_id" "uuid",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "batch_job_items_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."batch_job_items" OWNER TO "postgres";

--
-- Name: TABLE "batch_job_items"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."batch_job_items" IS 'Per-SKU work items for synthetic direct-chat consolidation batches. Tracks request payloads, responses, retries, and optional fallback to OpenAI Batch.';


--
-- Name: COLUMN "batch_job_items"."batch_job_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_job_items"."batch_job_id" IS 'Parent batch job this item belongs to.';


--
-- Name: COLUMN "batch_job_items"."sku"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_job_items"."sku" IS 'Product SKU for this consolidation item.';


--
-- Name: COLUMN "batch_job_items"."status"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_job_items"."status" IS 'Current item status: pending, running, completed, failed, cancelled.';


--
-- Name: COLUMN "batch_job_items"."request_payload"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_job_items"."request_payload" IS 'Full JSON request body sent to the chat completions endpoint for this SKU.';


--
-- Name: COLUMN "batch_job_items"."response_payload"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_job_items"."response_payload" IS 'Raw JSON response from the chat completions endpoint.';


--
-- Name: COLUMN "batch_job_items"."parsed_result"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_job_items"."parsed_result" IS 'Normalized consolidation result after parseStructuredConsolidationText processing.';


--
-- Name: COLUMN "batch_job_items"."product_source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_job_items"."product_source" IS 'Source evidence payload used to build the request, stored for auditing/retry.';


--
-- Name: COLUMN "batch_job_items"."error_message"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_job_items"."error_message" IS 'Error message if the item failed.';


--
-- Name: COLUMN "batch_job_items"."attempt_count"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_job_items"."attempt_count" IS 'Number of times this item has been attempted.';


--
-- Name: COLUMN "batch_job_items"."fallback_batch_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_job_items"."fallback_batch_id" IS 'If this item was retried via OpenAI Batch fallback, the child batch ID.';


--
-- Name: batch_jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."batch_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "description" "text",
    "auto_apply" boolean DEFAULT false,
    "total_requests" integer DEFAULT 0,
    "completed_requests" integer DEFAULT 0,
    "failed_requests" integer DEFAULT 0,
    "prompt_tokens" integer DEFAULT 0,
    "completion_tokens" integer DEFAULT 0,
    "total_tokens" integer DEFAULT 0,
    "estimated_cost" numeric(10,4) DEFAULT 0,
    "retry_count" integer DEFAULT 0,
    "max_retries" integer DEFAULT 3,
    "failed_skus" "text"[] DEFAULT '{}'::"text"[],
    "parent_batch_id" "uuid",
    "input_file_id" "text",
    "output_file_id" "text",
    "error_file_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "webhook_received_at" timestamp with time zone,
    "webhook_payload" "jsonb",
    "openai_batch_id" "text",
    "provider" "text" DEFAULT 'openai'::"text" NOT NULL,
    "provider_batch_id" "text",
    "provider_input_file_id" "text",
    "provider_output_file_id" "text",
    "provider_error_file_id" "text",
    "execution_mode" "text" DEFAULT 'batch_api'::"text" NOT NULL,
    CONSTRAINT "batch_jobs_execution_mode_check" CHECK (("execution_mode" = ANY (ARRAY['batch_api'::"text", 'direct_chat_chunks'::"text"]))),
    CONSTRAINT "batch_jobs_provider_check" CHECK (("provider" = ANY (ARRAY['deepseek'::"text", 'openai'::"text", 'openai_compatible'::"text", 'gemini'::"text", 'lmstudio'::"text"]))),
    CONSTRAINT "valid_status" CHECK (("status" = ANY (ARRAY['validating'::"text", 'in_progress'::"text", 'finalizing'::"text", 'completed'::"text", 'failed'::"text", 'expired'::"text", 'cancelled'::"text", 'pending'::"text"])))
);


ALTER TABLE "public"."batch_jobs" OWNER TO "postgres";

--
-- Name: TABLE "batch_jobs"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."batch_jobs" IS 'Tracks OpenAI Batch API jobs for AI-driven product consolidation';


--
-- Name: COLUMN "batch_jobs"."status"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_jobs"."status" IS 'Current status: validating, in_progress, finalizing, completed, failed, expired, cancelled, pending';


--
-- Name: COLUMN "batch_jobs"."auto_apply"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_jobs"."auto_apply" IS 'Whether to automatically apply results without manual review';


--
-- Name: COLUMN "batch_jobs"."failed_skus"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_jobs"."failed_skus" IS 'Array of SKUs that failed consolidation';


--
-- Name: COLUMN "batch_jobs"."parent_batch_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_jobs"."parent_batch_id" IS 'Reference to parent batch if this is a retry';


--
-- Name: COLUMN "batch_jobs"."input_file_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_jobs"."input_file_id" IS 'OpenAI file ID for the batch input';


--
-- Name: COLUMN "batch_jobs"."output_file_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_jobs"."output_file_id" IS 'OpenAI file ID for the batch results';


--
-- Name: COLUMN "batch_jobs"."error_file_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_jobs"."error_file_id" IS 'OpenAI file ID for error logs';


--
-- Name: COLUMN "batch_jobs"."provider"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_jobs"."provider" IS 'LLM provider that owns this batch job (deepseek, openai, openai_compatible, gemini, lmstudio).';


--
-- Name: COLUMN "batch_jobs"."provider_batch_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_jobs"."provider_batch_id" IS 'Provider-native batch identifier or resource name (e.g. OpenAI batch ID or Gemini batches/* resource).';


--
-- Name: COLUMN "batch_jobs"."provider_input_file_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_jobs"."provider_input_file_id" IS 'Provider-native input file identifier used to create the batch.';


--
-- Name: COLUMN "batch_jobs"."provider_output_file_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_jobs"."provider_output_file_id" IS 'Provider-native output file identifier for successful results.';


--
-- Name: COLUMN "batch_jobs"."provider_error_file_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_jobs"."provider_error_file_id" IS 'Provider-native file identifier for provider-side error output, when available.';


--
-- Name: COLUMN "batch_jobs"."execution_mode"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."batch_jobs"."execution_mode" IS 'Execution path: batch_api for provider Batch API, direct_chat_chunks for LM Studio direct chat completion calls.';


--
-- Name: brand_scraper_affinity; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."brand_scraper_affinity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_name" "text" NOT NULL,
    "scraper_slug" "text" NOT NULL,
    "total_attempts" integer DEFAULT 0,
    "successful_extractions" integer DEFAULT 0,
    "hit_rate" numeric(5,4) DEFAULT 0.0,
    "avg_fields_extracted" numeric(5,2) DEFAULT 0.0,
    "avg_images_found" numeric(5,2) DEFAULT 0.0,
    "last_success_at" timestamp with time zone,
    "last_attempt_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."brand_scraper_affinity" OWNER TO "postgres";

--
-- Name: TABLE "brand_scraper_affinity"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."brand_scraper_affinity" IS 'Tracks which scrapers historically produce results for which brands, enabling automatic scraper recommendation for cohort processing';


--
-- Name: COLUMN "brand_scraper_affinity"."brand_name"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."brand_scraper_affinity"."brand_name" IS 'Normalized lowercase brand name for matching';


--
-- Name: COLUMN "brand_scraper_affinity"."scraper_slug"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."brand_scraper_affinity"."scraper_slug" IS 'Scraper identifier matching scraper_configs.slug';


--
-- Name: COLUMN "brand_scraper_affinity"."hit_rate"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."brand_scraper_affinity"."hit_rate" IS 'Ratio of successful_extractions / total_attempts (0.0 to 1.0)';


--
-- Name: COLUMN "brand_scraper_affinity"."avg_fields_extracted"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."brand_scraper_affinity"."avg_fields_extracted" IS 'Average number of non-null fields returned per successful extraction';


--
-- Name: COLUMN "brand_scraper_affinity"."avg_images_found"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."brand_scraper_affinity"."avg_images_found" IS 'Average number of images found per successful extraction';


--
-- Name: brand_scraper_mappings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."brand_scraper_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "uuid" NOT NULL,
    "scraper_config_id" "uuid" NOT NULL,
    "priority" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."brand_scraper_mappings" OWNER TO "postgres";

--
-- Name: TABLE "brand_scraper_mappings"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."brand_scraper_mappings" IS 'Explicit mappings between brands and scraper configs, enabling prioritized scraper selection per brand.';


--
-- Name: COLUMN "brand_scraper_mappings"."brand_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."brand_scraper_mappings"."brand_id" IS 'Reference to the brand.';


--
-- Name: COLUMN "brand_scraper_mappings"."scraper_config_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."brand_scraper_mappings"."scraper_config_id" IS 'Reference to the scraper config.';


--
-- Name: COLUMN "brand_scraper_mappings"."priority"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."brand_scraper_mappings"."priority" IS 'Higher values are evaluated first.';


--
-- Name: COLUMN "brand_scraper_mappings"."is_active"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."brand_scraper_mappings"."is_active" IS 'Inactive mappings block affinity recommendations for the scraper.';


--
-- Name: COLUMN "brand_scraper_mappings"."notes"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."brand_scraper_mappings"."notes" IS 'Admin-facing notes about why this mapping exists.';


--
-- Name: COLUMN "brand_scraper_mappings"."created_by"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."brand_scraper_mappings"."created_by" IS 'User who created the mapping.';


--
-- Name: COLUMN "brand_scraper_mappings"."updated_by"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."brand_scraper_mappings"."updated_by" IS 'User who last updated the mapping.';


--
-- Name: brand_sources; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."brand_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_slug" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "domains" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "asset_domains" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "crawl4ai_adapter_slug" "text" NOT NULL,
    "requires_auth" boolean DEFAULT false NOT NULL,
    "credential_ref" "text",
    "search_mode" "text" NOT NULL,
    "allowed_fields" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "brand_sources_search_mode_check" CHECK (("search_mode" = ANY (ARRAY['sku_search'::"text", 'domain_search'::"text", 'direct_url'::"text", 'feed_lookup'::"text"]))),
    CONSTRAINT "brand_sources_source_type_check" CHECK (("source_type" = ANY (ARRAY['official_brand'::"text", 'distributor'::"text", 'internal'::"text", 'licensed_feed'::"text"])))
);


ALTER TABLE "public"."brand_sources" OWNER TO "postgres";

--
-- Name: brands; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."brands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "logo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "description" "text",
    "official_domains" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "preferred_domains" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL
);


ALTER TABLE "public"."brands" OWNER TO "postgres";

--
-- Name: COLUMN "brands"."official_domains"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."brands"."official_domains" IS 'Canonical official domains used to seed AI Search toward manufacturer sites.';


--
-- Name: COLUMN "brands"."preferred_domains"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."brands"."preferred_domains" IS 'Additional preferred domains used when official manufacturer domains are unavailable or insufficient.';


--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text",
    "description" "text",
    "parent_id" "uuid",
    "display_order" integer DEFAULT 0,
    "image_url" "text",
    "is_featured" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "department_key" "text",
    "depth" integer,
    "breadcrumb" "text",
    "facet_profile" "text",
    "seo_title" "text",
    "seo_description" "text",
    "sort_order" integer,
    "synonym_keywords" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "categories_depth_non_negative" CHECK (("depth" >= 0)),
    CONSTRAINT "categories_facet_profile_valid" CHECK ((("facet_profile" IS NULL) OR ("facet_profile" = ANY (ARRAY['animal_food'::"text", 'animal_treats_chews'::"text", 'animal_feed_farm'::"text", 'animal_health_wellness'::"text", 'animal_toys_enrichment'::"text", 'animal_habitat_containment'::"text", 'animal_litter_bedding'::"text", 'grooming_cleaning'::"text", 'aquarium_equipment'::"text", 'reptile_equipment'::"text", 'garden_consumable'::"text", 'garden_equipment'::"text", 'home_heating'::"text", 'hardware_tools'::"text", 'general'::"text"]))))
);


ALTER TABLE "public"."categories" OWNER TO "postgres";

--
-- Name: cohort_batches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."cohort_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "upc_prefix" "text" NOT NULL,
    "product_line" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "scraper_config" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "brand_id" "uuid",
    "brand_name" "text",
    "name" "text",
    CONSTRAINT "cohort_batches_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."cohort_batches" OWNER TO "postgres";

--
-- Name: TABLE "cohort_batches"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."cohort_batches" IS 'Tracks cohort processing batches for distributed product line scraping';


--
-- Name: COLUMN "cohort_batches"."upc_prefix"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."cohort_batches"."upc_prefix" IS 'UPC prefix that identifies products in this cohort (e.g., first 6 digits of UPC)';


--
-- Name: COLUMN "cohort_batches"."status"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."cohort_batches"."status" IS 'Current status: pending, processing, completed, or failed';


--
-- Name: COLUMN "cohort_batches"."scraper_config"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."cohort_batches"."scraper_config" IS 'JSON or reference to scraper configuration used for this batch';


--
-- Name: COLUMN "cohort_batches"."brand_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."cohort_batches"."brand_id" IS 'Optional FK to brands table for known catalog brands';


--
-- Name: COLUMN "cohort_batches"."brand_name"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."cohort_batches"."brand_name" IS 'Free-text brand name for scraping context (used when brand_id is not yet in catalog)';


--
-- Name: COLUMN "cohort_batches"."name"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."cohort_batches"."name" IS 'Human-readable cohort name (typically the UPC prefix)';


--
-- Name: cohort_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."cohort_members" (
    "cohort_id" "uuid" NOT NULL,
    "product_sku" "text" NOT NULL,
    "upc_prefix" "text" NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cohort_members" OWNER TO "postgres";

--
-- Name: TABLE "cohort_members"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."cohort_members" IS 'Links products to their cohort batches for processing';


--
-- Name: COLUMN "cohort_members"."product_sku"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."cohort_members"."product_sku" IS 'Product SKU (Stock Keeping Unit) within the cohort';


--
-- Name: COLUMN "cohort_members"."sort_order"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."cohort_members"."sort_order" IS 'Processing order within the cohort';


--
-- Name: consolidation_review_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."consolidation_review_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sku" "text" NOT NULL,
    "batch_job_id" "uuid",
    "batch_job_item_id" "uuid",
    "cohort_id" "uuid",
    "status" "text" DEFAULT 'needs_input'::"text" NOT NULL,
    "blocking" boolean DEFAULT true NOT NULL,
    "requested_fields" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "field_questions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "field_candidates" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "candidate_consolidated" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "agent_summary" "text",
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resolution" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "consolidation_review_status_check" CHECK (("status" = ANY (ARRAY['needs_input'::"text", 'resolved'::"text", 'dismissed'::"text", 'auto_resolved'::"text"])))
);


ALTER TABLE "public"."consolidation_review_requests" OWNER TO "postgres";

--
-- Name: inventory_reconciliation_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."inventory_reconciliation_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sync_run_id" "uuid" NOT NULL,
    "sku" "text" NOT NULL,
    "product_id" "uuid",
    "register_name" "text",
    "website_name" "text",
    "register_price" numeric(10,2),
    "website_price" numeric(10,2),
    "register_quantity" numeric(10,2),
    "website_quantity" numeric(10,2),
    "issue_type" "public"."inventory_reconciliation_issue_type" NOT NULL,
    "severity" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "public"."inventory_reconciliation_status" DEFAULT 'open'::"public"."inventory_reconciliation_status" NOT NULL,
    "recommended_action" "text",
    "raw_register_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inventory_reconciliation_items" OWNER TO "postgres";

--
-- Name: dashboard_inventory_reconciliation_stats; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."dashboard_inventory_reconciliation_stats" AS
 SELECT "count"(*) FILTER (WHERE ("status" = 'open'::"public"."inventory_reconciliation_status")) AS "open_issues",
    "count"(*) FILTER (WHERE (("issue_type" = 'register_only'::"public"."inventory_reconciliation_issue_type") AND ("status" = 'open'::"public"."inventory_reconciliation_status"))) AS "register_only_products",
    "count"(*) FILTER (WHERE (("issue_type" = 'price_mismatch'::"public"."inventory_reconciliation_issue_type") AND ("status" = 'open'::"public"."inventory_reconciliation_status"))) AS "price_mismatches",
    "count"(*) FILTER (WHERE (("issue_type" = 'quantity_mismatch'::"public"."inventory_reconciliation_issue_type") AND ("status" = 'open'::"public"."inventory_reconciliation_status"))) AS "quantity_mismatches",
    "max"("created_at") AS "last_issue_created_at"
   FROM "public"."inventory_reconciliation_items";


ALTER VIEW "public"."dashboard_inventory_reconciliation_stats" OWNER TO "postgres";

--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" "text" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_email" "text" NOT NULL,
    "customer_phone" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "subtotal" numeric(10,2) NOT NULL,
    "tax" numeric(10,2) DEFAULT 0,
    "total" numeric(10,2) NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "promo_code_id" "uuid",
    "promo_code" "text",
    "discount_amount" numeric(10,2) DEFAULT 0,
    "payment_method" "text" DEFAULT 'pickup'::"text",
    "payment_status" "public"."order_payment_status" DEFAULT 'unpaid'::"public"."order_payment_status",
    "stripe_payment_intent_id" "text",
    "stripe_customer_id" "text",
    "paid_at" timestamp with time zone,
    "refunded_amount" numeric(10,2) DEFAULT 0,
    "fulfillment_method" "text" DEFAULT 'pickup'::"text",
    "delivery_address_id" "uuid",
    "delivery_distance_miles" numeric(10,2),
    "delivery_fee" numeric(10,2) DEFAULT 0,
    "delivery_services" "jsonb" DEFAULT '[]'::"jsonb",
    "delivery_notes" "text",
    "source" "text" DEFAULT 'unknown'::"text",
    "source_type" "public"."order_source_type" NOT NULL,
    "source_system" "text",
    "external_order_id" "text",
    "external_created_at" timestamp with time zone,
    "imported_at" timestamp with time zone,
    "fulfillment_status" "public"."order_fulfillment_status" DEFAULT 'unfulfilled'::"public"."order_fulfillment_status" NOT NULL,
    CONSTRAINT "orders_fulfillment_method_check" CHECK (("fulfillment_method" = ANY (ARRAY['pickup'::"text", 'delivery'::"text"]))),
    CONSTRAINT "orders_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['pickup'::"text", 'credit_card'::"text", 'paypal'::"text", 'in_store'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";

--
-- Name: COLUMN "orders"."fulfillment_method"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."orders"."fulfillment_method" IS 'How the order will be fulfilled: pickup or delivery.';


--
-- Name: COLUMN "orders"."delivery_address_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."orders"."delivery_address_id" IS 'The shipping address for delivery orders.';


--
-- Name: COLUMN "orders"."delivery_distance_miles"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."orders"."delivery_distance_miles" IS 'Calculated distance from store for delivery fee audit.';


--
-- Name: COLUMN "orders"."delivery_fee"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."orders"."delivery_fee" IS 'Delivery fee charged to the customer.';


--
-- Name: COLUMN "orders"."delivery_services"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."orders"."delivery_services" IS 'JSON array of service add-ons: [{service: string, fee: number}].';


--
-- Name: COLUMN "orders"."delivery_notes"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."orders"."delivery_notes" IS 'Special delivery instructions (gate code, lift gate needed, etc.).';


--
-- Name: dashboard_migration_progress; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."dashboard_migration_progress" AS
 SELECT ("date_trunc"('month'::"text", "created_at"))::"date" AS "month",
    "source_type",
    "count"(*) AS "order_count"
   FROM "public"."orders"
  WHERE ("created_at" > ("now"() - '1 year'::interval))
  GROUP BY ("date_trunc"('month'::"text", "created_at")), "source_type"
  ORDER BY (("date_trunc"('month'::"text", "created_at"))::"date") DESC, "source_type";


ALTER VIEW "public"."dashboard_migration_progress" OWNER TO "postgres";

--
-- Name: dashboard_order_stats; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."dashboard_order_stats" AS
 SELECT "count"(*) FILTER (WHERE (("created_at")::"date" = CURRENT_DATE)) AS "today_order_count",
    COALESCE("sum"("total") FILTER (WHERE (("created_at")::"date" = CURRENT_DATE)), (0)::numeric) AS "today_sales",
    "count"(*) FILTER (WHERE ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text"]))) AS "open_orders",
    "count"(*) FILTER (WHERE ("payment_status" = ANY (ARRAY['unpaid'::"public"."order_payment_status", 'authorized'::"public"."order_payment_status"]))) AS "unpaid_orders",
    "count"(*) FILTER (WHERE ("fulfillment_status" = 'ready_for_pickup'::"public"."order_fulfillment_status")) AS "ready_for_pickup",
    "count"(*) FILTER (WHERE (("source_type" = 'integra'::"public"."order_source_type") AND (("created_at")::"date" = CURRENT_DATE))) AS "today_register_orders",
    "count"(*) FILTER (WHERE (("source_type" = 'web'::"public"."order_source_type") AND (("created_at")::"date" = CURRENT_DATE))) AS "today_web_orders"
   FROM "public"."orders";


ALTER VIEW "public"."dashboard_order_stats" OWNER TO "postgres";

--
-- Name: products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand_id" "uuid",
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "price" numeric(10,2) NOT NULL,
    "stock_status" "text" DEFAULT 'in_stock'::"text" NOT NULL,
    "images" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sku" "text",
    "weight" numeric(10,2),
    "gtin" "text",
    "availability" "text",
    "minimum_quantity" integer DEFAULT 0 NOT NULL,
    "low_stock_threshold" integer DEFAULT 5 NOT NULL,
    "search_keywords" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "published_at" timestamp with time zone,
    "quantity" integer DEFAULT 0 NOT NULL,
    "shopsite_pages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_special_order" boolean DEFAULT false NOT NULL,
    "is_taxable" boolean DEFAULT true NOT NULL,
    "short_name" "text",
    "in_store_pickup" boolean DEFAULT false NOT NULL,
    "date_sold" timestamp with time zone,
    "date_received" timestamp with time zone,
    "date_counted" timestamp with time zone,
    "date_created" timestamp with time zone,
    "date_priced" timestamp with time zone,
    "shopsite_sync_status" "text" DEFAULT 'not_synced'::"text" NOT NULL,
    "shopsite_last_synced_at" timestamp with time zone,
    "shopsite_last_sync_error" "text",
    "canonical_category_id" "uuid",
    "shopsite_cost" numeric(10,2),
    "shopsite_product_type" "text",
    "upc" "text",
    CONSTRAINT "products_shopsite_sync_status_check" CHECK (("shopsite_sync_status" = ANY (ARRAY['not_synced'::"text", 'pending'::"text", 'synced'::"text", 'failed'::"text"]))),
    CONSTRAINT "products_stock_status_check" CHECK (("stock_status" = ANY (ARRAY['in_stock'::"text", 'out_of_stock'::"text", 'pre_order'::"text"])))
);


ALTER TABLE "public"."products" OWNER TO "postgres";

--
-- Name: COLUMN "products"."date_sold"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products"."date_sold" IS 'The date the product was last sold, used for velocity calculations.';


--
-- Name: COLUMN "products"."date_received"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products"."date_received" IS 'The date the product was last received into inventory, used for aging calculations.';


--
-- Name: COLUMN "products"."date_counted"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products"."date_counted" IS 'The date the product was last physically counted.';


--
-- Name: COLUMN "products"."date_created"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products"."date_created" IS 'The date the product record was created in the register system.';


--
-- Name: COLUMN "products"."date_priced"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products"."date_priced" IS 'The date the product price was last updated in the register system.';


--
-- Name: COLUMN "products"."shopsite_sync_status"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products"."shopsite_sync_status" IS 'Optional downstream ShopSite sync state for Supabase-first publishing.';


--
-- Name: COLUMN "products"."shopsite_last_synced_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products"."shopsite_last_synced_at" IS 'Timestamp of the last successful ShopSite upload for this storefront product.';


--
-- Name: COLUMN "products"."shopsite_last_sync_error"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products"."shopsite_last_sync_error" IS 'Last ShopSite sync error recorded while the product was pending downstream sync.';


--
-- Name: dashboard_product_stats; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."dashboard_product_stats" AS
 SELECT "count"(*) AS "total_count",
    "count"(*) FILTER (WHERE ("published_at" IS NOT NULL)) AS "published_count",
    "count"(*) FILTER (WHERE ("stock_status" = 'out_of_stock'::"text")) AS "out_of_stock_count",
    "count"(*) FILTER (WHERE ("quantity" <= "low_stock_threshold")) AS "low_stock_count",
    "max"("updated_at") AS "last_updated"
   FROM "public"."products";


ALTER VIEW "public"."dashboard_product_stats" OWNER TO "postgres";

--
-- Name: enrichment_jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."enrichment_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "skus" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "total_count" integer DEFAULT 0 NOT NULL,
    "completed_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "model" "text",
    "mode" "text" DEFAULT 'mixed'::"text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "token_usage" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "cost_estimate" numeric,
    "error_message" "text",
    "created_by" "uuid",
    "claimed_by" "text",
    "lease_token" "uuid",
    "lease_expires_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "heartbeat_at" timestamp with time zone,
    "last_event_at" timestamp with time zone,
    "last_log_at" timestamp with time zone,
    "last_log_level" "text",
    "last_log_message" "text",
    "progress_percent" integer,
    "progress_message" "text",
    "progress_phase" "text",
    "progress_details" "jsonb",
    "progress_updated_at" timestamp with time zone,
    "current_sku" "text",
    "items_processed" integer,
    "items_total" integer,
    "test_mode" boolean DEFAULT false NOT NULL,
    "test_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "enrichment_jobs_mode_check" CHECK (("mode" = ANY (ARRAY['structured'::"text", 'metadata'::"text", 'llm'::"text", 'mixed'::"text"]))),
    CONSTRAINT "enrichment_jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'completed'::"text", 'completed_with_errors'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."enrichment_jobs" OWNER TO "postgres";

--
-- Name: dashboard_scraper_stats; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."dashboard_scraper_stats" AS
 SELECT "count"(*) AS "total_jobs",
    "count"(*) FILTER (WHERE ("status" = 'completed'::"text")) AS "completed_jobs",
    "count"(*) FILTER (WHERE ("status" = 'failed'::"text")) AS "failed_jobs",
    "count"(*) FILTER (WHERE (("status" = 'running'::"text") OR ("status" = 'claimed'::"text"))) AS "active_jobs",
    "max"("created_at") AS "last_job_created"
   FROM "public"."enrichment_jobs"
  WHERE ("created_at" > ("now"() - '24:00:00'::interval));


ALTER VIEW "public"."dashboard_scraper_stats" OWNER TO "postgres";

--
-- Name: email_subscribers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."email_subscribers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "first_name" "text",
    "source" "text" DEFAULT 'footer'::"text",
    "is_verified" boolean DEFAULT false,
    "subscribed_at" timestamp with time zone DEFAULT "now"(),
    "unsubscribed_at" timestamp with time zone
);


ALTER TABLE "public"."email_subscribers" OWNER TO "postgres";

--
-- Name: enrichment_attempts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."enrichment_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "sku" "text" NOT NULL,
    "target_id" "uuid",
    "attempt_number" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "mode" "text" DEFAULT 'mixed'::"text" NOT NULL,
    "model" "text",
    "claimed_by" "text",
    "lease_token" "uuid",
    "lease_expires_at" timestamp with time zone,
    "source_url" "text",
    "result" "jsonb",
    "normalized_source" "jsonb",
    "confidence_overall" numeric,
    "field_confidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "validation" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "enrichment_attempts_confidence_overall_check" CHECK ((("confidence_overall" IS NULL) OR (("confidence_overall" >= (0)::numeric) AND ("confidence_overall" <= (1)::numeric)))),
    CONSTRAINT "enrichment_attempts_mode_check" CHECK (("mode" = ANY (ARRAY['structured'::"text", 'metadata'::"text", 'llm'::"text", 'mixed'::"text"]))),
    CONSTRAINT "enrichment_attempts_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'success'::"text", 'partial'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."enrichment_attempts" OWNER TO "postgres";

--
-- Name: enrichment_job_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."enrichment_job_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "level" "text" NOT NULL,
    "message" "text" NOT NULL,
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_id" "text" DEFAULT ("gen_random_uuid"())::"text",
    "runner_id" "text",
    "runner_name" "text",
    "source" "text",
    "scraper_name" "text",
    "sku" "text",
    "phase" "text",
    "sequence" bigint
);


ALTER TABLE "public"."enrichment_job_logs" OWNER TO "postgres";

--
-- Name: TABLE "enrichment_job_logs"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."enrichment_job_logs" IS 'Stores structured logs from scraper runners for debugging and audit';


--
-- Name: COLUMN "enrichment_job_logs"."job_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."enrichment_job_logs"."job_id" IS 'Reference to the scrape_job this log belongs to';


--
-- Name: COLUMN "enrichment_job_logs"."level"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."enrichment_job_logs"."level" IS 'Log level: debug, info, warning, error, critical';


--
-- Name: COLUMN "enrichment_job_logs"."message"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."enrichment_job_logs"."message" IS 'The log message content';


--
-- Name: COLUMN "enrichment_job_logs"."details"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."enrichment_job_logs"."details" IS 'Optional structured JSON details from runner logs';


--
-- Name: COLUMN "enrichment_job_logs"."created_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."enrichment_job_logs"."created_at" IS 'When the log entry was created';


--
-- Name: COLUMN "enrichment_job_logs"."event_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."enrichment_job_logs"."event_id" IS 'Stable runner-generated event identifier used to dedupe optimistic realtime logs.';


--
-- Name: COLUMN "enrichment_job_logs"."runner_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."enrichment_job_logs"."runner_id" IS 'Runner instance identifier that emitted the log entry.';


--
-- Name: COLUMN "enrichment_job_logs"."runner_name"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."enrichment_job_logs"."runner_name" IS 'Human-readable runner name that emitted the log entry.';


--
-- Name: COLUMN "enrichment_job_logs"."source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."enrichment_job_logs"."source" IS 'Logical logger/source name for the log entry.';


--
-- Name: COLUMN "enrichment_job_logs"."scraper_name"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."enrichment_job_logs"."scraper_name" IS 'Scraper slug associated with the log entry.';


--
-- Name: COLUMN "enrichment_job_logs"."sku"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."enrichment_job_logs"."sku" IS 'SKU being processed when the log entry was emitted.';


--
-- Name: COLUMN "enrichment_job_logs"."phase"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."enrichment_job_logs"."phase" IS 'High-level execution phase such as claimed, configuring, scraping, completed, or failed.';


--
-- Name: COLUMN "enrichment_job_logs"."sequence"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."enrichment_job_logs"."sequence" IS 'Per-job monotonic sequence used to preserve runner log ordering.';


--
-- Name: enrichment_targets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."enrichment_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sku" "text" NOT NULL,
    "url" "text" NOT NULL,
    "domain" "text",
    "status" "text" DEFAULT 'candidate'::"text" NOT NULL,
    "selected" boolean DEFAULT false NOT NULL,
    "confidence" numeric,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "enrichment_targets_confidence_check" CHECK ((("confidence" IS NULL) OR (("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric)))),
    CONSTRAINT "enrichment_targets_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'import'::"text", 'suggested'::"text", 'existing'::"text", 'system'::"text"]))),
    CONSTRAINT "enrichment_targets_status_check" CHECK (("status" = ANY (ARRAY['candidate'::"text", 'selected'::"text", 'rejected'::"text", 'processed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."enrichment_targets" OWNER TO "postgres";

--
-- Name: external_sources; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."external_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "source_type" "public"."order_source_type" NOT NULL,
    "source_system" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."external_sources" OWNER TO "postgres";

--
-- Name: TABLE "external_sources"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."external_sources" IS 'Canonical registry of upstream and legacy systems (ShopSite, Integra, web, manual imports).';


--
-- Name: COLUMN "external_sources"."key"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."external_sources"."key" IS 'Stable application key used by code and migrations.';


--
-- Name: facet_definitions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."facet_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_deprecated" boolean DEFAULT false NOT NULL,
    "facet_profile" "text"[] DEFAULT '{}'::"text"[] NOT NULL
);


ALTER TABLE "public"."facet_definitions" OWNER TO "postgres";

--
-- Name: COLUMN "facet_definitions"."is_deprecated"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."facet_definitions"."is_deprecated" IS 'If true, this facet definition is superseded by a canonical replacement. Storefront filters should hide deprecated facets.';


--
-- Name: COLUMN "facet_definitions"."facet_profile"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."facet_definitions"."facet_profile" IS 'Array of facet profile keys that use this facet (e.g. animal_food, garden_consumable, animal_litter_bedding). Empty array means universal/general.';


--
-- Name: facet_values; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."facet_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "facet_definition_id" "uuid" NOT NULL,
    "value" "text" NOT NULL,
    "normalized_value" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."facet_values" OWNER TO "postgres";

--
-- Name: image_retry_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."image_retry_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sku" "text",
    "image_url" "text" NOT NULL,
    "error_type" "public"."image_error_type" DEFAULT 'unknown'::"public"."image_error_type" NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "max_retries" integer DEFAULT 3 NOT NULL,
    "status" "public"."image_retry_status" DEFAULT 'pending'::"public"."image_retry_status" NOT NULL,
    "scheduled_for" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."image_retry_queue" OWNER TO "postgres";

--
-- Name: TABLE "image_retry_queue"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."image_retry_queue" IS 'Queue for retrying failed image capture attempts with automatic retry logic';


--
-- Name: COLUMN "image_retry_queue"."sku"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."image_retry_queue"."sku" IS 'Reference to the product in products_ingestion table';


--
-- Name: COLUMN "image_retry_queue"."image_url"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."image_retry_queue"."image_url" IS 'URL of the image that failed to capture';


--
-- Name: COLUMN "image_retry_queue"."error_type"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."image_retry_queue"."error_type" IS 'Type of error encountered during capture attempt';


--
-- Name: COLUMN "image_retry_queue"."retry_count"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."image_retry_queue"."retry_count" IS 'Number of retry attempts made so far';


--
-- Name: COLUMN "image_retry_queue"."max_retries"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."image_retry_queue"."max_retries" IS 'Maximum number of retry attempts allowed before marking as failed';


--
-- Name: COLUMN "image_retry_queue"."status"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."image_retry_queue"."status" IS 'Current processing status';


--
-- Name: COLUMN "image_retry_queue"."scheduled_for"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."image_retry_queue"."scheduled_for" IS 'Timestamp when this entry should be processed next';


--
-- Name: COLUMN "image_retry_queue"."last_error"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."image_retry_queue"."last_error" IS 'Last error message received';


--
-- Name: integration_sync_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."integration_sync_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_type" "public"."order_source_type" NOT NULL,
    "source_system" "text" NOT NULL,
    "sync_kind" "text" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "file_name" "text",
    "row_count" integer DEFAULT 0,
    "inserted_count" integer DEFAULT 0,
    "updated_count" integer DEFAULT 0,
    "skipped_count" integer DEFAULT 0,
    "error_count" integer DEFAULT 0,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_by" "uuid",
    "error_summary" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "external_source_id" "uuid",
    CONSTRAINT "integration_sync_runs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'partial'::"text"])))
);


ALTER TABLE "public"."integration_sync_runs" OWNER TO "postgres";

--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."inventory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sku" "text" NOT NULL,
    "price" numeric(10,2),
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text"
);


ALTER TABLE "public"."inventory_items" OWNER TO "postgres";

--
-- Name: legacy_redirects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."legacy_redirects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "old_path" "text" NOT NULL,
    "new_path" "text" NOT NULL,
    "status_code" integer DEFAULT 301 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."legacy_redirects" OWNER TO "postgres";

--
-- Name: llm_parallel_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."llm_parallel_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow" "text" DEFAULT 'consolidation'::"text" NOT NULL,
    "subject_key" "text" NOT NULL,
    "primary_provider" "text" NOT NULL,
    "primary_batch_id" "text" NOT NULL,
    "shadow_provider" "text" NOT NULL,
    "shadow_batch_id" "text",
    "sample_percent" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "primary_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "shadow_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "comparison" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "llm_parallel_runs_primary_provider_check" CHECK (("primary_provider" = ANY (ARRAY['deepseek'::"text", 'openai'::"text", 'openai_compatible'::"text", 'gemini'::"text", 'lmstudio'::"text"]))),
    CONSTRAINT "llm_parallel_runs_sample_percent_check" CHECK ((("sample_percent" >= 0) AND ("sample_percent" <= 100))),
    CONSTRAINT "llm_parallel_runs_shadow_provider_check" CHECK (("shadow_provider" = ANY (ARRAY['deepseek'::"text", 'openai'::"text", 'openai_compatible'::"text", 'gemini'::"text", 'lmstudio'::"text"]))),
    CONSTRAINT "llm_parallel_runs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text"]))),
    CONSTRAINT "llm_parallel_runs_workflow_check" CHECK (("workflow" = 'consolidation'::"text"))
);


ALTER TABLE "public"."llm_parallel_runs" OWNER TO "postgres";

--
-- Name: TABLE "llm_parallel_runs"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."llm_parallel_runs" IS 'Stores provider-vs-provider shadow runs for Gemini migration monitoring.';


--
-- Name: COLUMN "llm_parallel_runs"."subject_key"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."llm_parallel_runs"."subject_key" IS 'Stable hash or routing key used for traffic sampling.';


--
-- Name: COLUMN "llm_parallel_runs"."primary_batch_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."llm_parallel_runs"."primary_batch_id" IS 'Provider-native batch identifier for the user-facing batch.';


--
-- Name: COLUMN "llm_parallel_runs"."shadow_batch_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."llm_parallel_runs"."shadow_batch_id" IS 'Provider-native batch identifier for the sampled shadow batch.';


--
-- Name: COLUMN "llm_parallel_runs"."comparison"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."llm_parallel_runs"."comparison" IS 'Computed comparison metrics between primary and shadow run outputs.';


--
-- Name: migration_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."migration_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sync_type" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "processed" integer DEFAULT 0 NOT NULL,
    "created" integer DEFAULT 0 NOT NULL,
    "updated" integer DEFAULT 0 NOT NULL,
    "failed" integer DEFAULT 0 NOT NULL,
    "duration_ms" integer,
    "errors" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."migration_log" OWNER TO "postgres";

--
-- Name: official_brand_url_candidates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."official_brand_url_candidates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sku" "text" NOT NULL,
    "cohort_id" "uuid",
    "brand_id" "uuid",
    "url" "text" NOT NULL,
    "normalized_url" "text" NOT NULL,
    "normalized_domain" "text" NOT NULL,
    "candidate_source" "text" NOT NULL,
    "selection_status" "text" DEFAULT 'candidate'::"text" NOT NULL,
    "confidence" numeric,
    "rank" integer,
    "title" "text",
    "snippet" "text",
    "discovery_job_id" "uuid",
    "extraction_job_id" "uuid",
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "predicted_name" "text",
    "appeared_in_phases" integer[],
    "selection_tier" "text",
    "composite_score" numeric,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "text",
    CONSTRAINT "official_brand_url_candidates_candidate_source_check" CHECK (("candidate_source" = ANY (ARRAY['serper'::"text", 'manual'::"text"]))),
    CONSTRAINT "official_brand_url_candidates_confidence_check" CHECK ((("confidence" IS NULL) OR (("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric)))),
    CONSTRAINT "official_brand_url_candidates_rank_check" CHECK ((("rank" IS NULL) OR ("rank" > 0))),
    CONSTRAINT "official_brand_url_candidates_selection_status_check" CHECK (("selection_status" = ANY (ARRAY['candidate'::"text", 'selected'::"text", 'rejected'::"text", 'extracted'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."official_brand_url_candidates" OWNER TO "postgres";

--
-- Name: TABLE "official_brand_url_candidates"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."official_brand_url_candidates" IS 'Reviewable URL candidate workspace for Official Brand discovery and manual URL extraction.';


--
-- Name: COLUMN "official_brand_url_candidates"."selection_status"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."official_brand_url_candidates"."selection_status" IS 'Candidate lifecycle: candidate, selected, rejected, extracted, or failed.';


--
-- Name: COLUMN "official_brand_url_candidates"."predicted_name"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."official_brand_url_candidates"."predicted_name" IS 'LLM-consolidated full product name from Phase 1.5';


--
-- Name: COLUMN "official_brand_url_candidates"."appeared_in_phases"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."official_brand_url_candidates"."appeared_in_phases" IS 'Which discovery phases produced this candidate (1, 2, or both)';


--
-- Name: COLUMN "official_brand_url_candidates"."selection_tier"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."official_brand_url_candidates"."selection_tier" IS 'Ranking tier: official_domain, preferred_domain, knowledge_graph, llm_scored, organic';


--
-- Name: COLUMN "official_brand_url_candidates"."composite_score"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."official_brand_url_candidates"."composite_score" IS 'Normalized composite relevance score from Phase 3 ranking';


--
-- Name: COLUMN "official_brand_url_candidates"."reviewed_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."official_brand_url_candidates"."reviewed_at" IS 'Timestamp when an admin explicitly reviewed or selected this URL candidate.';


--
-- Name: COLUMN "official_brand_url_candidates"."reviewed_by"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."official_brand_url_candidates"."reviewed_by" IS 'Admin identifier, usually email or user id, captured as text for service-role compatibility.';


--
-- Name: order_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."order_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "previous_value" "jsonb",
    "new_value" "jsonb",
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_events" OWNER TO "postgres";

--
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "item_type" "text" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "item_name" "text" NOT NULL,
    "item_slug" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "total_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "preorder_batch_id" "uuid",
    CONSTRAINT "order_items_item_type_check" CHECK (("item_type" = ANY (ARRAY['product'::"text", 'service'::"text"]))),
    CONSTRAINT "order_items_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";

--
-- Name: COLUMN "order_items"."preorder_batch_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."order_items"."preorder_batch_id" IS 'The selected arrival batch for this line item (for pre-order items).';


--
-- Name: order_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."order_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "payment_method" "text" NOT NULL,
    "stripe_payment_intent_id" "text",
    "stripe_charge_id" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_event_id" "text",
    CONSTRAINT "order_payments_method_check" CHECK (("payment_method" = ANY (ARRAY['credit_card'::"text", 'paypal'::"text"]))),
    CONSTRAINT "order_payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'succeeded'::"text", 'failed'::"text", 'cancelled'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."order_payments" OWNER TO "postgres";

--
-- Name: order_source_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."order_source_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid",
    "source_type" "public"."order_source_type" NOT NULL,
    "source_system" "text" NOT NULL,
    "external_id" "text",
    "external_order_number" "text",
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "normalized_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "payload_hash" "text",
    "sync_run_id" "uuid",
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "external_created_at" timestamp with time zone,
    "external_updated_at" timestamp with time zone
);


ALTER TABLE "public"."order_source_records" OWNER TO "postgres";

--
-- Name: orders_ingestion; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."orders_ingestion" (
    "order_id" "text" NOT NULL,
    "order_number" "text",
    "order_date" timestamp with time zone,
    "order_status" "text",
    "customer_email" "text",
    "customer_name" "text",
    "total" numeric,
    "items" "jsonb" DEFAULT '[]'::"jsonb",
    "data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."orders_ingestion" OWNER TO "postgres";

--
-- Name: pages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "is_published" boolean DEFAULT false,
    "meta_title" "text",
    "meta_description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pages" OWNER TO "postgres";

--
-- Name: pet_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pet_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "icon" "text"
);


ALTER TABLE "public"."pet_types" OWNER TO "postgres";

--
-- Name: pipeline_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pipeline_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_type" "text" NOT NULL,
    "job_id" "uuid" NOT NULL,
    "from_state" "text",
    "to_state" "text" NOT NULL,
    "actor_id" "uuid",
    "actor_type" "text" DEFAULT 'system'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pipeline_audit_log_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['system'::"text", 'user'::"text", 'service'::"text"])))
);


ALTER TABLE "public"."pipeline_audit_log" OWNER TO "postgres";

--
-- Name: TABLE "pipeline_audit_log"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."pipeline_audit_log" IS 'Immutable audit trail for ETL pipeline state transitions.';


--
-- Name: COLUMN "pipeline_audit_log"."job_type"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."pipeline_audit_log"."job_type" IS 'Type of job (e.g., scrape_job, consolidation_job).';


--
-- Name: COLUMN "pipeline_audit_log"."actor_type"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."pipeline_audit_log"."actor_type" IS 'Who triggered the transition: system (auto), user (manual), service (API).';


--
-- Name: products_ingestion; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."products_ingestion" (
    "sku" "text" NOT NULL,
    "input" "jsonb" DEFAULT '{}'::"jsonb",
    "consolidated" "jsonb" DEFAULT '{}'::"jsonb",
    "sources" "jsonb" DEFAULT '{}'::"jsonb",
    "b2b_sources" "jsonb" DEFAULT '{}'::"jsonb",
    "enrichment_config" "jsonb" DEFAULT '{}'::"jsonb",
    "active_consolidation_review_id" "uuid",
    "consolidation_review_status" "text" DEFAULT 'none'::"text" NOT NULL,
    "consolidation_review_updated_at" timestamp with time zone,
    "pipeline_status" "public"."pipeline_status_five" DEFAULT 'imported'::"public"."pipeline_status_five" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_test_run" boolean DEFAULT false,
    "selected_images" "jsonb" DEFAULT '[]'::"jsonb",
    "image_candidates" "text"[] DEFAULT '{}'::"text"[],
    "confidence_score" numeric,
    "error_message" "text",
    "retry_count" integer DEFAULT 0,
    "product_line" "text",
    "cohort_id" "uuid",
    "exported_at" timestamp with time zone,
    "scrape_quality" "jsonb" DEFAULT '{}'::"jsonb",
    "fallback_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "brand_id" "uuid",
    CONSTRAINT "products_ingestion_confidence_score_check" CHECK ((("confidence_score" IS NULL) OR (("confidence_score" >= (0)::numeric) AND ("confidence_score" <= (1)::numeric)))),
    CONSTRAINT "products_ingestion_consolidation_review_status_check" CHECK (("consolidation_review_status" = ANY (ARRAY['none'::"text", 'needs_input'::"text", 'resolved'::"text", 'dismissed'::"text"]))),
    CONSTRAINT "products_ingestion_exported_at_requires_exporting_check" CHECK ((("exported_at" IS NULL) OR ("pipeline_status" = 'publishing'::"public"."pipeline_status_five")))
);


ALTER TABLE "public"."products_ingestion" OWNER TO "postgres";

--
-- Name: COLUMN "products_ingestion"."pipeline_status"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products_ingestion"."pipeline_status" IS 'Canonical workflow state: imported, scraping, scraped, consolidating, finalizing, exporting, or failed.';


--
-- Name: COLUMN "products_ingestion"."is_test_run"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products_ingestion"."is_test_run" IS 'True if the product data came from a test scrape job. These products should not flow through the normal pipeline.';


--
-- Name: COLUMN "products_ingestion"."selected_images"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products_ingestion"."selected_images" IS 'Array of selected images with metadata (url and selectedAt)';


--
-- Name: COLUMN "products_ingestion"."image_candidates"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products_ingestion"."image_candidates" IS 'List of image URLs extracted from scrapers/sources, available for manual selection.';


--
-- Name: COLUMN "products_ingestion"."confidence_score"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products_ingestion"."confidence_score" IS 'AI consolidation confidence score (0-1) indicating data quality after AI processing';


--
-- Name: COLUMN "products_ingestion"."error_message"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products_ingestion"."error_message" IS 'Error message if processing failed';


--
-- Name: COLUMN "products_ingestion"."retry_count"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products_ingestion"."retry_count" IS 'Number of retry attempts for processing';


--
-- Name: COLUMN "products_ingestion"."product_line"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products_ingestion"."product_line" IS 'Product line identifier for cohort-based processing';


--
-- Name: COLUMN "products_ingestion"."cohort_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products_ingestion"."cohort_id" IS 'References the cohort batch this product is currently associated with in the pipeline';


--
-- Name: COLUMN "products_ingestion"."exported_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."products_ingestion"."exported_at" IS 'Timestamp of successful downstream export completion. Rows stay in products_ingestion for audit but leave active pipeline views once exported_at is set.';


--
-- Name: pipeline_export_queue; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."pipeline_export_queue" AS
 SELECT "sku",
    "input",
    "sources",
    "consolidated",
    "pipeline_status",
    "created_at",
    "updated_at",
    "b2b_sources",
    "enrichment_config",
    "is_test_run",
    "image_candidates",
    "confidence_score",
    "selected_images",
    "error_message",
    "retry_count",
    "product_line",
    "cohort_id",
    "exported_at"
   FROM "public"."products_ingestion" "pi"
  WHERE (("pipeline_status" = 'publishing'::"public"."pipeline_status_five") AND ("exported_at" IS NULL));


ALTER VIEW "public"."pipeline_export_queue" OWNER TO "postgres";

--
-- Name: pipeline_finalizing_queue; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."pipeline_finalizing_queue" AS
 SELECT "sku",
    "input",
    "sources",
    "consolidated",
    "pipeline_status",
    "created_at",
    "updated_at",
    "b2b_sources",
    "enrichment_config",
    "is_test_run",
    "image_candidates",
    "confidence_score",
    "selected_images",
    "error_message",
    "retry_count",
    "product_line",
    "cohort_id",
    "exported_at"
   FROM "public"."products_ingestion" "pi"
  WHERE (("pipeline_status" = 'reviewing'::"public"."pipeline_status_five") AND ("exported_at" IS NULL));


ALTER VIEW "public"."pipeline_finalizing_queue" OWNER TO "postgres";

--
-- Name: pipeline_finalized_review; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."pipeline_finalized_review" AS
 SELECT "sku",
    "input",
    "sources",
    "consolidated",
    "pipeline_status",
    "created_at",
    "updated_at",
    "b2b_sources",
    "enrichment_config",
    "is_test_run",
    "image_candidates",
    "confidence_score",
    "selected_images",
    "error_message",
    "retry_count",
    "product_line",
    "cohort_id",
    "exported_at"
   FROM "public"."pipeline_finalizing_queue";


ALTER VIEW "public"."pipeline_finalized_review" OWNER TO "postgres";

--
-- Name: pipeline_retry_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."pipeline_retry_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_type" "text" NOT NULL,
    "original_job_id" "uuid" NOT NULL,
    "retry_reason" "text" NOT NULL,
    "requested_by" "uuid",
    "priority" integer DEFAULT 5 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "max_attempts" integer DEFAULT 3 NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "last_attempt_at" timestamp with time zone,
    "next_attempt_at" timestamp with time zone,
    "error_log" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pipeline_retry_queue_priority_check" CHECK ((("priority" >= 1) AND ("priority" <= 10))),
    CONSTRAINT "pipeline_retry_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."pipeline_retry_queue" OWNER TO "postgres";

--
-- Name: TABLE "pipeline_retry_queue"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."pipeline_retry_queue" IS 'Queue for manual retry of failed ETL pipeline jobs.';


--
-- Name: COLUMN "pipeline_retry_queue"."priority"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."pipeline_retry_queue"."priority" IS '1=highest, 10=lowest. Used for processing order.';


--
-- Name: COLUMN "pipeline_retry_queue"."max_attempts"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."pipeline_retry_queue"."max_attempts" IS 'Maximum retry attempts before marking failed.';


--
-- Name: preorder_batches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."preorder_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "preorder_group_id" "uuid" NOT NULL,
    "arrival_date" "date" NOT NULL,
    "ordering_deadline" timestamp with time zone,
    "capacity" integer,
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."preorder_batches" OWNER TO "postgres";

--
-- Name: TABLE "preorder_batches"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."preorder_batches" IS 'Arrival dates within a pre-order program. Customers select a batch when adding to cart.';


--
-- Name: preorder_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."preorder_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "minimum_quantity" integer DEFAULT 1 NOT NULL,
    "pickup_only" boolean DEFAULT true NOT NULL,
    "display_copy" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."preorder_groups" OWNER TO "postgres";

--
-- Name: TABLE "preorder_groups"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."preorder_groups" IS 'Reusable pre-order programs (e.g., Baby Chicks, Ducklings) with shared rules like minimum quantities.';


--
-- Name: price_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."price_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "variant_id" "uuid",
    "price" numeric NOT NULL,
    "compare_at_price" numeric,
    "recorded_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."price_history" OWNER TO "postgres";

--
-- Name: product_answers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "answer" "text" NOT NULL,
    "is_official" boolean DEFAULT false,
    "helpful_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_answers" OWNER TO "postgres";

--
-- Name: product_attributes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_attributes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "is_filterable" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_attributes" OWNER TO "postgres";

--
-- Name: product_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_categories" (
    "product_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "relationship_type" "text" DEFAULT 'canonical'::"text" NOT NULL,
    CONSTRAINT "product_categories_relationship_type_check" CHECK (("relationship_type" = ANY (ARRAY['canonical'::"text", 'secondary'::"text", 'collection'::"text"])))
);


ALTER TABLE "public"."product_categories" OWNER TO "postgres";

--
-- Name: product_facets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_facets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "facet_value_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_facets" OWNER TO "postgres";

--
-- Name: product_group_products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_group_products" (
    "group_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "display_label" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_group_products" OWNER TO "postgres";

--
-- Name: TABLE "product_group_products"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."product_group_products" IS 'Many-to-many relationship between products and groups with sort order and display labels.';


--
-- Name: COLUMN "product_group_products"."display_label"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."product_group_products"."display_label" IS 'Optional custom label for size selector (e.g., "5 lb" vs extracting from product name).';


--
-- Name: COLUMN "product_group_products"."metadata"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."product_group_products"."metadata" IS 'JSON metadata about this product in the group (e.g., size, weight, dimensions).';


--
-- Name: product_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "hero_image_url" "text",
    "default_product_id" "uuid",
    "brand_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_groups" OWNER TO "postgres";

--
-- Name: TABLE "product_groups"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."product_groups" IS 'Groups of related products sharing a single page (e.g., different sizes of the same product). Used for Amazon-style product pages.';


--
-- Name: COLUMN "product_groups"."slug"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."product_groups"."slug" IS 'Canonical URL slug for the group (used in /products/{slug} routes).';


--
-- Name: COLUMN "product_groups"."hero_image_url"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."product_groups"."hero_image_url" IS 'Optional hero image shown at top of grouped product page.';


--
-- Name: COLUMN "product_groups"."default_product_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."product_groups"."default_product_id" IS 'Default product shown when no ?sku= param is provided.';


--
-- Name: product_images; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "variant_id" "uuid",
    "url" "text" NOT NULL,
    "alt_text" "text",
    "position" integer DEFAULT 0,
    "width" integer,
    "height" integer,
    "is_primary" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "storage_path" "text"
);


ALTER TABLE "public"."product_images" OWNER TO "postgres";

--
-- Name: product_option_values; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_option_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "option_id" "uuid" NOT NULL,
    "value" "text" NOT NULL,
    "position" integer DEFAULT 0,
    "color_hex" "text",
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_option_values" OWNER TO "postgres";

--
-- Name: product_options; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "position" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_options" OWNER TO "postgres";

--
-- Name: product_pet_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_pet_types" (
    "product_id" "uuid" NOT NULL,
    "pet_type_id" "uuid" NOT NULL
);


ALTER TABLE "public"."product_pet_types" OWNER TO "postgres";

--
-- Name: product_preorder_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_preorder_groups" (
    "product_id" "uuid" NOT NULL,
    "preorder_group_id" "uuid" NOT NULL,
    "pickup_only_override" boolean,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_preorder_groups" OWNER TO "postgres";

--
-- Name: TABLE "product_preorder_groups"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."product_preorder_groups" IS 'Many-to-many relationship between products and pre-order groups.';


--
-- Name: product_questions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "question" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "product_questions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."product_questions" OWNER TO "postgres";

--
-- Name: product_reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "rating" integer NOT NULL,
    "title" "text",
    "content" "text",
    "pros" "text"[],
    "cons" "text"[],
    "is_verified_purchase" boolean DEFAULT false,
    "helpful_count" integer DEFAULT 0,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "product_reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "product_reviews_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."product_reviews" OWNER TO "postgres";

--
-- Name: product_scraped_sites; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_scraped_sites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sku" "text" NOT NULL,
    "scraper_name" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "last_scraped_at" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_scraped_sites" OWNER TO "postgres";

--
-- Name: product_storefront_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_storefront_settings" (
    "product_id" "uuid" NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL,
    "pickup_only" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."product_storefront_settings" OWNER TO "postgres";

--
-- Name: product_tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_tags" (
    "product_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL
);


ALTER TABLE "public"."product_tags" OWNER TO "postgres";

--
-- Name: product_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_types" OWNER TO "postgres";

--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."product_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "sku" "text",
    "barcode" "text",
    "title" "text",
    "price" numeric NOT NULL,
    "compare_at_price" numeric,
    "cost_price" numeric,
    "quantity" integer DEFAULT 0,
    "weight" numeric,
    "weight_unit" "text" DEFAULT 'lb'::"text",
    "option_values" "jsonb" DEFAULT '[]'::"jsonb",
    "image_url" "text",
    "is_default" boolean DEFAULT false,
    "requires_shipping" boolean DEFAULT true,
    "is_taxable" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "product_variants_weight_unit_check" CHECK (("weight_unit" = ANY (ARRAY['lb'::"text", 'oz'::"text", 'kg'::"text", 'g'::"text"])))
);


ALTER TABLE "public"."product_variants" OWNER TO "postgres";

--
-- Name: products_published; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."products_published" AS
 SELECT "pi"."sku" AS "id",
    COALESCE(("pi"."consolidated" ->> 'name'::"text"), ("pi"."input" ->> 'name'::"text")) AS "name",
    "lower"("regexp_replace"(COALESCE(("pi"."consolidated" ->> 'name'::"text"), ("pi"."input" ->> 'name'::"text"), "pi"."sku"), '[^a-zA-Z0-9]+'::"text", '-'::"text", 'g'::"text")) AS "slug",
    COALESCE(("pi"."consolidated" ->> 'description'::"text"), ''::"text") AS "description",
    COALESCE((("pi"."consolidated" ->> 'price'::"text"))::numeric, (("pi"."input" ->> 'price'::"text"))::numeric, (0)::numeric) AS "price",
    COALESCE(("pi"."consolidated" -> 'images'::"text"), '[]'::"jsonb") AS "images",
    COALESCE(("pi"."consolidated" ->> 'stock_status'::"text"), 'in_stock'::"text") AS "stock_status",
    (("pi"."consolidated" ->> 'brand_id'::"text"))::"uuid" AS "brand_id",
    COALESCE((("pi"."consolidated" ->> 'is_featured'::"text"))::boolean, false) AS "is_featured",
    "pi"."created_at",
    "pi"."updated_at",
    "pi"."pipeline_status",
    "b"."name" AS "brand_name",
    "b"."slug" AS "brand_slug",
    "b"."logo_url" AS "brand_logo_url"
   FROM ("public"."products_ingestion" "pi"
     LEFT JOIN "public"."brands" "b" ON (((("pi"."consolidated" ->> 'brand_id'::"text"))::"uuid" = "b"."id")))
  WHERE (("pi"."pipeline_status" = 'publishing'::"public"."pipeline_status_five") AND ("pi"."exported_at" IS NOT NULL));


ALTER VIEW "public"."products_published" OWNER TO "postgres";

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "email" "text",
    "role" "text" DEFAULT 'customer'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "phone" "text",
    "preferences" "jsonb" DEFAULT '{}'::"jsonb",
    "legacy_customer_id" "text",
    "shopsite_data" "jsonb" DEFAULT '{}'::"jsonb",
    "first_order_completed" boolean DEFAULT false,
    "first_order_at" timestamp with time zone,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'customer'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";

--
-- Name: promo_codes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."promo_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "discount_type" "text" NOT NULL,
    "discount_value" numeric(10,2) NOT NULL,
    "minimum_order" numeric(10,2) DEFAULT 0,
    "maximum_discount" numeric(10,2),
    "max_uses" integer,
    "current_uses" integer DEFAULT 0,
    "max_uses_per_user" integer DEFAULT 1,
    "starts_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "first_order_only" boolean DEFAULT false,
    "requires_account" boolean DEFAULT false,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "promo_codes_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percentage'::"text", 'fixed_amount'::"text", 'free_shipping'::"text"])))
);


ALTER TABLE "public"."promo_codes" OWNER TO "postgres";

--
-- Name: promo_redemptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."promo_redemptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "promo_code_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "order_id" "uuid",
    "guest_email" "text",
    "discount_applied" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "redemption_identifier" CHECK ((("user_id" IS NOT NULL) OR ("guest_email" IS NOT NULL)))
);


ALTER TABLE "public"."promo_redemptions" OWNER TO "postgres";

--
-- Name: recently_viewed; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."recently_viewed" (
    "user_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "viewed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."recently_viewed" OWNER TO "postgres";

--
-- Name: related_products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."related_products" (
    "product_id" "uuid" NOT NULL,
    "related_product_id" "uuid" NOT NULL,
    "relation_type" "text" DEFAULT 'related'::"text",
    "position" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "no_self_relation" CHECK (("product_id" <> "related_product_id")),
    CONSTRAINT "related_products_relation_type_check" CHECK (("relation_type" = ANY (ARRAY['related'::"text", 'upsell'::"text", 'cross_sell'::"text", 'bundle'::"text", 'accessory'::"text", 'frequently_bought'::"text"])))
);


ALTER TABLE "public"."related_products" OWNER TO "postgres";

--
-- Name: review_helpful_votes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."review_helpful_votes" (
    "user_id" "uuid" NOT NULL,
    "review_id" "uuid" NOT NULL,
    "is_helpful" boolean NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."review_helpful_votes" OWNER TO "postgres";

--
-- Name: runner_api_keys; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."runner_api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "runner_name" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "last_used_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_by" "uuid",
    "allowed_scrapers" "text"[]
);


ALTER TABLE "public"."runner_api_keys" OWNER TO "postgres";

--
-- Name: TABLE "runner_api_keys"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."runner_api_keys" IS 'API keys for authenticating scraper runners. Keys are stored as SHA256 hashes.';


--
-- Name: COLUMN "runner_api_keys"."key_hash"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."runner_api_keys"."key_hash" IS 'SHA256 hash of the API key. The actual key is only shown once at creation.';


--
-- Name: COLUMN "runner_api_keys"."key_prefix"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."runner_api_keys"."key_prefix" IS 'First 8 characters of the key for identification purposes.';


--
-- Name: COLUMN "runner_api_keys"."revoked_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."runner_api_keys"."revoked_at" IS 'Set when key is revoked. Revoked keys are kept for audit trail.';


--
-- Name: COLUMN "runner_api_keys"."allowed_scrapers"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."runner_api_keys"."allowed_scrapers" IS 'List of scraper names this key can access credentials for. NULL = all allowed (legacy), empty = none allowed, array = specific scrapers only.';


--
-- Name: scrape_results; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."scrape_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "runner_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."scrape_results" OWNER TO "postgres";

--
-- Name: scraper_config_test_skus; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."scraper_config_test_skus" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "config_id" "uuid" NOT NULL,
    "sku" "text" NOT NULL,
    "sku_type" "text" NOT NULL,
    "added_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scraper_config_test_skus_sku_type_check" CHECK (("sku_type" = ANY (ARRAY['test'::"text", 'fake'::"text", 'edge_case'::"text"])))
);


ALTER TABLE "public"."scraper_config_test_skus" OWNER TO "postgres";

--
-- Name: scraper_credentials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."scraper_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scraper_slug" "text" NOT NULL,
    "credential_type" "text" NOT NULL,
    "encrypted_value" "text" NOT NULL,
    "iv" "text" NOT NULL,
    "auth_tag" "text" NOT NULL,
    "key_version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."scraper_credentials" OWNER TO "postgres";

--
-- Name: TABLE "scraper_credentials"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."scraper_credentials" IS 'Encrypted scraper credentials (AES-256-GCM) keyed by key_version.';


--
-- Name: COLUMN "scraper_credentials"."encrypted_value"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scraper_credentials"."encrypted_value" IS 'AES-256-GCM encrypted credential payload.';


--
-- Name: scraper_health_metrics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."scraper_health_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "config_id" "uuid" NOT NULL,
    "metric_date" "date" NOT NULL,
    "total_runs" integer DEFAULT 0 NOT NULL,
    "passed_runs" integer DEFAULT 0 NOT NULL,
    "failed_runs" integer DEFAULT 0 NOT NULL,
    "avg_duration_ms" integer,
    "top_failing_step" "text",
    "selector_health" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."scraper_health_metrics" OWNER TO "postgres";

--
-- Name: TABLE "scraper_health_metrics"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."scraper_health_metrics" IS 'Aggregated daily health metrics for scraper trend analysis and monitoring dashboards.';


--
-- Name: COLUMN "scraper_health_metrics"."config_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scraper_health_metrics"."config_id" IS 'Foreign key to scraper_configs table';


--
-- Name: COLUMN "scraper_health_metrics"."metric_date"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scraper_health_metrics"."metric_date" IS 'Date of the aggregated metrics';


--
-- Name: COLUMN "scraper_health_metrics"."total_runs"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scraper_health_metrics"."total_runs" IS 'Total number of test runs on this date';


--
-- Name: COLUMN "scraper_health_metrics"."passed_runs"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scraper_health_metrics"."passed_runs" IS 'Number of runs that passed completely';


--
-- Name: COLUMN "scraper_health_metrics"."failed_runs"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scraper_health_metrics"."failed_runs" IS 'Number of runs that failed';


--
-- Name: COLUMN "scraper_health_metrics"."avg_duration_ms"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scraper_health_metrics"."avg_duration_ms" IS 'Average test run duration in milliseconds';


--
-- Name: COLUMN "scraper_health_metrics"."top_failing_step"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scraper_health_metrics"."top_failing_step" IS 'Most frequently failing workflow step on this date';


--
-- Name: COLUMN "scraper_health_metrics"."selector_health"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scraper_health_metrics"."selector_health" IS 'JSON object with selector health scores and statuses';


--
-- Name: scraper_runners; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."scraper_runners" (
    "name" "text" NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"(),
    "status" "text",
    "current_job_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "auth_user_id" "uuid",
    "last_auth_at" timestamp with time zone,
    "jobs_completed" integer DEFAULT 0,
    "memory_usage_mb" integer,
    "enabled" boolean DEFAULT true NOT NULL,
    CONSTRAINT "scraper_runners_status_check" CHECK (("status" = ANY (ARRAY['online'::"text", 'offline'::"text", 'busy'::"text", 'idle'::"text", 'polling'::"text", 'paused'::"text"])))
);


ALTER TABLE "public"."scraper_runners" OWNER TO "postgres";

--
-- Name: COLUMN "scraper_runners"."auth_user_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scraper_runners"."auth_user_id" IS 'Links runner to auth.users for JWT authentication';


--
-- Name: COLUMN "scraper_runners"."last_auth_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scraper_runners"."last_auth_at" IS 'Timestamp of last successful JWT authentication';


--
-- Name: COLUMN "scraper_runners"."enabled"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."scraper_runners"."enabled" IS 'Controls whether a runner may claim new jobs. Disabled runners keep their API keys and may finish in-flight work.';


--
-- Name: scraper_selectors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."scraper_selectors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "selector" "text" NOT NULL,
    "attribute" "text" DEFAULT 'text'::"text",
    "multiple" boolean DEFAULT false,
    "required" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."scraper_selectors" OWNER TO "postgres";

--
-- Name: scraper_workflow_steps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."scraper_workflow_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "name" "text",
    "params" "jsonb" DEFAULT '{}'::"jsonb",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."scraper_workflow_steps" OWNER TO "postgres";

--
-- Name: service_costs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."service_costs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "monthly_cost" numeric(10,2) DEFAULT 0 NOT NULL,
    "billing_cycle" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "category" "text" DEFAULT 'infrastructure'::"text" NOT NULL,
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_costs_billing_cycle_check" CHECK (("billing_cycle" = ANY (ARRAY['monthly'::"text", 'annual'::"text"]))),
    CONSTRAINT "service_costs_category_check" CHECK (("category" = ANY (ARRAY['infrastructure'::"text", 'ai'::"text", 'payment'::"text", 'communication'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."service_costs" OWNER TO "postgres";

--
-- Name: services; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "price" numeric(10,2),
    "unit" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."services" OWNER TO "postgres";

--
-- Name: shopsite_product_sync; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."shopsite_product_sync" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "external_source_id" "uuid" NOT NULL,
    "sync_status" "text" DEFAULT 'not_synced'::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "last_uploaded_at" timestamp with time zone,
    "last_sync_error" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shopsite_product_sync_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['not_synced'::"text", 'pending'::"text", 'synced'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."shopsite_product_sync" OWNER TO "postgres";

--
-- Name: TABLE "shopsite_product_sync"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."shopsite_product_sync" IS 'ShopSite synchronization state for canonical products. Replaces products.shopsite_* metadata.';


--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."site_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."site_settings" OWNER TO "postgres";

--
-- Name: stripe_webhook_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."stripe_webhook_events" (
    "event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "stripe_object_id" "text",
    "order_id" "uuid",
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "error_message" "text",
    "payload" "jsonb" NOT NULL,
    CONSTRAINT "stripe_webhook_events_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'processed'::"text", 'skipped'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."stripe_webhook_events" OWNER TO "postgres";

--
-- Name: subscription_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."subscription_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subscription_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "subscription_items_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."subscription_items" OWNER TO "postgres";

--
-- Name: subscription_suggestions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."subscription_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subscription_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "pet_id" "uuid",
    "reason" "text",
    "is_dismissed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscription_suggestions" OWNER TO "postgres";

--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'My Autoship'::"text" NOT NULL,
    "frequency" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "next_order_date" "date" NOT NULL,
    "last_order_date" "date",
    "shipping_address_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "subscriptions_frequency_check" CHECK (("frequency" = ANY (ARRAY['weekly'::"text", 'biweekly'::"text", 'monthly'::"text", 'bimonthly'::"text", 'quarterly'::"text"]))),
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";

--
-- Name: tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tags" OWNER TO "postgres";

--
-- Name: user_api_keys; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."user_api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "key_hash" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "description" "text",
    "role" "public"."user_role" DEFAULT 'admin'::"public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    "last_used_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_by" "uuid"
);


ALTER TABLE "public"."user_api_keys" OWNER TO "postgres";

--
-- Name: TABLE "user_api_keys"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."user_api_keys" IS 'API keys for authenticating admin/staff users. Keys are stored as SHA256 hashes. Modeled on the runner_api_keys pattern.';


--
-- Name: COLUMN "user_api_keys"."key_hash"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."user_api_keys"."key_hash" IS 'SHA256 hash of the API key. The actual key is only shown once at creation.';


--
-- Name: COLUMN "user_api_keys"."key_prefix"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."user_api_keys"."key_prefix" IS 'First 12 characters of the key for identification purposes (e.g., bsa_a1b2c3d4...).';


--
-- Name: COLUMN "user_api_keys"."role"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."user_api_keys"."role" IS 'Role granted to this key. Defaults to admin. Matches values in profiles.role.';


--
-- Name: COLUMN "user_api_keys"."revoked_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."user_api_keys"."revoked_at" IS 'Set when key is revoked. Revoked keys are kept for audit trail.';


--
-- Name: user_pets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."user_pets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "pet_type_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "breed" "text",
    "birth_date" "date",
    "weight_lbs" numeric(6,2),
    "dietary_notes" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "life_stage" "text",
    "size_class" "text",
    "special_needs" "text"[] DEFAULT '{}'::"text"[],
    "gender" "text",
    "is_fixed" boolean,
    "activity_level" "text",
    CONSTRAINT "user_pets_activity_level_check" CHECK ((("activity_level" IS NULL) OR ("activity_level" = ANY (ARRAY['low'::"text", 'moderate'::"text", 'high'::"text", 'very_high'::"text"])))),
    CONSTRAINT "user_pets_gender_check" CHECK ((("gender" IS NULL) OR ("gender" = ANY (ARRAY['male'::"text", 'female'::"text"])))),
    CONSTRAINT "user_pets_life_stage_check" CHECK ((("life_stage" IS NULL) OR ("life_stage" = ANY (ARRAY['puppy'::"text", 'kitten'::"text", 'juvenile'::"text", 'adult'::"text", 'senior'::"text"])))),
    CONSTRAINT "user_pets_size_class_check" CHECK ((("size_class" IS NULL) OR ("size_class" = ANY (ARRAY['small'::"text", 'medium'::"text", 'large'::"text", 'giant'::"text"]))))
);


ALTER TABLE "public"."user_pets" OWNER TO "postgres";

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "location" "text",
    "phone" "text",
    "website" "text",
    "linkedin" "text",
    "headline" "text",
    "billing_address" "jsonb",
    "payment_method" "jsonb",
    "credits" integer DEFAULT 0,
    "subscription_status" "text" DEFAULT 'none'::"text",
    "stripe_customer_id" "text",
    "summary" "text",
    "is_admin" boolean DEFAULT false NOT NULL,
    CONSTRAINT "users_subscription_status_check" CHECK (("subscription_status" = ANY (ARRAY['active'::"text", 'past_due'::"text", 'none'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";

--
-- Name: wishlists; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."wishlists" (
    "user_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."wishlists" OWNER TO "postgres";

--
-- Name: addresses addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."addresses"
    ADD CONSTRAINT "addresses_pkey" PRIMARY KEY ("id");


--
-- Name: ai_provider_credentials ai_provider_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_provider_credentials"
    ADD CONSTRAINT "ai_provider_credentials_pkey" PRIMARY KEY ("id");


--
-- Name: ai_provider_credentials ai_provider_credentials_provider_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_provider_credentials"
    ADD CONSTRAINT "ai_provider_credentials_provider_key" UNIQUE ("provider");


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");


--
-- Name: b2b_feeds b2b_feeds_distributor_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."b2b_feeds"
    ADD CONSTRAINT "b2b_feeds_distributor_code_key" UNIQUE ("distributor_code");


--
-- Name: b2b_feeds b2b_feeds_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."b2b_feeds"
    ADD CONSTRAINT "b2b_feeds_pkey" PRIMARY KEY ("id");


--
-- Name: b2b_sync_jobs b2b_sync_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."b2b_sync_jobs"
    ADD CONSTRAINT "b2b_sync_jobs_pkey" PRIMARY KEY ("id");


--
-- Name: batch_job_items batch_job_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batch_job_items"
    ADD CONSTRAINT "batch_job_items_pkey" PRIMARY KEY ("id");


--
-- Name: batch_job_items batch_job_items_unique_batch_sku; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batch_job_items"
    ADD CONSTRAINT "batch_job_items_unique_batch_sku" UNIQUE ("batch_job_id", "sku");


--
-- Name: batch_jobs batch_jobs_openai_batch_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batch_jobs"
    ADD CONSTRAINT "batch_jobs_openai_batch_id_key" UNIQUE ("openai_batch_id");


--
-- Name: batch_jobs batch_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batch_jobs"
    ADD CONSTRAINT "batch_jobs_pkey" PRIMARY KEY ("id");


--
-- Name: brand_scraper_affinity brand_scraper_affinity_brand_name_scraper_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."brand_scraper_affinity"
    ADD CONSTRAINT "brand_scraper_affinity_brand_name_scraper_slug_key" UNIQUE ("brand_name", "scraper_slug");


--
-- Name: brand_scraper_affinity brand_scraper_affinity_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."brand_scraper_affinity"
    ADD CONSTRAINT "brand_scraper_affinity_pkey" PRIMARY KEY ("id");


--
-- Name: brand_scraper_mappings brand_scraper_mappings_brand_id_scraper_config_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."brand_scraper_mappings"
    ADD CONSTRAINT "brand_scraper_mappings_brand_id_scraper_config_id_key" UNIQUE ("brand_id", "scraper_config_id");


--
-- Name: brand_scraper_mappings brand_scraper_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."brand_scraper_mappings"
    ADD CONSTRAINT "brand_scraper_mappings_pkey" PRIMARY KEY ("id");


--
-- Name: brand_sources brand_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."brand_sources"
    ADD CONSTRAINT "brand_sources_pkey" PRIMARY KEY ("id");


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_pkey" PRIMARY KEY ("id");


--
-- Name: brands brands_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."brands"
    ADD CONSTRAINT "brands_slug_key" UNIQUE ("slug");


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");


--
-- Name: cohort_batches cohort_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cohort_batches"
    ADD CONSTRAINT "cohort_batches_pkey" PRIMARY KEY ("id");


--
-- Name: cohort_members cohort_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cohort_members"
    ADD CONSTRAINT "cohort_members_pkey" PRIMARY KEY ("cohort_id", "product_sku");


--
-- Name: consolidation_review_requests consolidation_review_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."consolidation_review_requests"
    ADD CONSTRAINT "consolidation_review_requests_pkey" PRIMARY KEY ("id");


--
-- Name: email_subscribers email_subscribers_email_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."email_subscribers"
    ADD CONSTRAINT "email_subscribers_email_unique" UNIQUE ("email");


--
-- Name: email_subscribers email_subscribers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."email_subscribers"
    ADD CONSTRAINT "email_subscribers_pkey" PRIMARY KEY ("id");


--
-- Name: enrichment_attempts enrichment_attempts_job_id_sku_attempt_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."enrichment_attempts"
    ADD CONSTRAINT "enrichment_attempts_job_id_sku_attempt_number_key" UNIQUE ("job_id", "sku", "attempt_number");


--
-- Name: enrichment_attempts enrichment_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."enrichment_attempts"
    ADD CONSTRAINT "enrichment_attempts_pkey" PRIMARY KEY ("id");


--
-- Name: enrichment_jobs enrichment_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."enrichment_jobs"
    ADD CONSTRAINT "enrichment_jobs_pkey" PRIMARY KEY ("id");


--
-- Name: enrichment_targets enrichment_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."enrichment_targets"
    ADD CONSTRAINT "enrichment_targets_pkey" PRIMARY KEY ("id");


--
-- Name: enrichment_targets enrichment_targets_sku_url_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."enrichment_targets"
    ADD CONSTRAINT "enrichment_targets_sku_url_key" UNIQUE ("sku", "url");


--
-- Name: external_sources external_sources_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."external_sources"
    ADD CONSTRAINT "external_sources_key_key" UNIQUE ("key");


--
-- Name: external_sources external_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."external_sources"
    ADD CONSTRAINT "external_sources_pkey" PRIMARY KEY ("id");


--
-- Name: external_sources external_sources_source_type_source_system_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."external_sources"
    ADD CONSTRAINT "external_sources_source_type_source_system_key" UNIQUE ("source_type", "source_system");


--
-- Name: facet_definitions facet_definitions_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."facet_definitions"
    ADD CONSTRAINT "facet_definitions_name_key" UNIQUE ("name");


--
-- Name: facet_definitions facet_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."facet_definitions"
    ADD CONSTRAINT "facet_definitions_pkey" PRIMARY KEY ("id");


--
-- Name: facet_definitions facet_definitions_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."facet_definitions"
    ADD CONSTRAINT "facet_definitions_slug_key" UNIQUE ("slug");


--
-- Name: facet_values facet_values_facet_definition_id_normalized_value_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."facet_values"
    ADD CONSTRAINT "facet_values_facet_definition_id_normalized_value_key" UNIQUE ("facet_definition_id", "normalized_value");


--
-- Name: facet_values facet_values_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."facet_values"
    ADD CONSTRAINT "facet_values_pkey" PRIMARY KEY ("id");


--
-- Name: image_retry_queue image_retry_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."image_retry_queue"
    ADD CONSTRAINT "image_retry_queue_pkey" PRIMARY KEY ("id");


--
-- Name: integration_sync_runs integration_sync_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."integration_sync_runs"
    ADD CONSTRAINT "integration_sync_runs_pkey" PRIMARY KEY ("id");


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id");


--
-- Name: inventory_items inventory_items_sku_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_sku_key" UNIQUE ("sku");


--
-- Name: inventory_reconciliation_items inventory_reconciliation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inventory_reconciliation_items"
    ADD CONSTRAINT "inventory_reconciliation_items_pkey" PRIMARY KEY ("id");


--
-- Name: legacy_redirects legacy_redirects_old_path_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."legacy_redirects"
    ADD CONSTRAINT "legacy_redirects_old_path_key" UNIQUE ("old_path");


--
-- Name: legacy_redirects legacy_redirects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."legacy_redirects"
    ADD CONSTRAINT "legacy_redirects_pkey" PRIMARY KEY ("id");


--
-- Name: llm_parallel_runs llm_parallel_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."llm_parallel_runs"
    ADD CONSTRAINT "llm_parallel_runs_pkey" PRIMARY KEY ("id");


--
-- Name: migration_log migration_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."migration_log"
    ADD CONSTRAINT "migration_log_pkey" PRIMARY KEY ("id");


--
-- Name: official_brand_url_candidates official_brand_url_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."official_brand_url_candidates"
    ADD CONSTRAINT "official_brand_url_candidates_pkey" PRIMARY KEY ("id");


--
-- Name: official_brand_url_candidates official_brand_url_candidates_sku_normalized_url_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."official_brand_url_candidates"
    ADD CONSTRAINT "official_brand_url_candidates_sku_normalized_url_key" UNIQUE ("sku", "normalized_url");


--
-- Name: order_events order_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_events"
    ADD CONSTRAINT "order_events_pkey" PRIMARY KEY ("id");


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");


--
-- Name: order_payments order_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_payments"
    ADD CONSTRAINT "order_payments_pkey" PRIMARY KEY ("id");


--
-- Name: order_source_records order_source_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_source_records"
    ADD CONSTRAINT "order_source_records_pkey" PRIMARY KEY ("id");


--
-- Name: order_source_records order_source_records_source_type_source_system_external_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_source_records"
    ADD CONSTRAINT "order_source_records_source_type_source_system_external_id_key" UNIQUE ("source_type", "source_system", "external_id");


--
-- Name: orders orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_number_key" UNIQUE ("order_number");


--
-- Name: orders_ingestion orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders_ingestion"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("order_id");


--
-- Name: orders orders_pkey1; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey1" PRIMARY KEY ("id");


--
-- Name: pages pages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_pkey" PRIMARY KEY ("id");


--
-- Name: pages pages_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_slug_key" UNIQUE ("slug");


--
-- Name: pet_types pet_types_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pet_types"
    ADD CONSTRAINT "pet_types_name_key" UNIQUE ("name");


--
-- Name: pet_types pet_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pet_types"
    ADD CONSTRAINT "pet_types_pkey" PRIMARY KEY ("id");


--
-- Name: pipeline_audit_log pipeline_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pipeline_audit_log"
    ADD CONSTRAINT "pipeline_audit_log_pkey" PRIMARY KEY ("id");


--
-- Name: pipeline_retry_queue pipeline_retry_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pipeline_retry_queue"
    ADD CONSTRAINT "pipeline_retry_queue_pkey" PRIMARY KEY ("id");


--
-- Name: preorder_batches preorder_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."preorder_batches"
    ADD CONSTRAINT "preorder_batches_pkey" PRIMARY KEY ("id");


--
-- Name: preorder_groups preorder_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."preorder_groups"
    ADD CONSTRAINT "preorder_groups_pkey" PRIMARY KEY ("id");


--
-- Name: preorder_groups preorder_groups_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."preorder_groups"
    ADD CONSTRAINT "preorder_groups_slug_key" UNIQUE ("slug");


--
-- Name: price_history price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."price_history"
    ADD CONSTRAINT "price_history_pkey" PRIMARY KEY ("id");


--
-- Name: product_answers product_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_answers"
    ADD CONSTRAINT "product_answers_pkey" PRIMARY KEY ("id");


--
-- Name: product_attributes product_attributes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_attributes"
    ADD CONSTRAINT "product_attributes_pkey" PRIMARY KEY ("id");


--
-- Name: product_attributes product_attributes_product_id_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_attributes"
    ADD CONSTRAINT "product_attributes_product_id_key_key" UNIQUE ("product_id", "key");


--
-- Name: product_categories product_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_pkey" PRIMARY KEY ("product_id", "category_id");


--
-- Name: product_facets product_facets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_facets"
    ADD CONSTRAINT "product_facets_pkey" PRIMARY KEY ("id");


--
-- Name: product_facets product_facets_product_id_facet_value_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_facets"
    ADD CONSTRAINT "product_facets_product_id_facet_value_id_key" UNIQUE ("product_id", "facet_value_id");


--
-- Name: product_group_products product_group_products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_group_products"
    ADD CONSTRAINT "product_group_products_pkey" PRIMARY KEY ("group_id", "product_id");


--
-- Name: product_groups product_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_groups"
    ADD CONSTRAINT "product_groups_pkey" PRIMARY KEY ("id");


--
-- Name: product_groups product_groups_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_groups"
    ADD CONSTRAINT "product_groups_slug_key" UNIQUE ("slug");


--
-- Name: product_images product_images_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_images"
    ADD CONSTRAINT "product_images_pkey" PRIMARY KEY ("id");


--
-- Name: product_option_values product_option_values_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_option_values"
    ADD CONSTRAINT "product_option_values_pkey" PRIMARY KEY ("id");


--
-- Name: product_options product_options_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_options"
    ADD CONSTRAINT "product_options_pkey" PRIMARY KEY ("id");


--
-- Name: product_pet_types product_pet_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_pet_types"
    ADD CONSTRAINT "product_pet_types_pkey" PRIMARY KEY ("product_id", "pet_type_id");


--
-- Name: product_preorder_groups product_preorder_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_preorder_groups"
    ADD CONSTRAINT "product_preorder_groups_pkey" PRIMARY KEY ("product_id", "preorder_group_id");


--
-- Name: product_questions product_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_questions"
    ADD CONSTRAINT "product_questions_pkey" PRIMARY KEY ("id");


--
-- Name: product_reviews product_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_reviews"
    ADD CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id");


--
-- Name: product_scraped_sites product_scraped_sites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_scraped_sites"
    ADD CONSTRAINT "product_scraped_sites_pkey" PRIMARY KEY ("id");


--
-- Name: product_scraped_sites product_scraped_sites_sku_scraper_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_scraped_sites"
    ADD CONSTRAINT "product_scraped_sites_sku_scraper_name_key" UNIQUE ("sku", "scraper_name");


--
-- Name: product_storefront_settings product_storefront_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_storefront_settings"
    ADD CONSTRAINT "product_storefront_settings_pkey" PRIMARY KEY ("product_id");


--
-- Name: product_tags product_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_tags"
    ADD CONSTRAINT "product_tags_pkey" PRIMARY KEY ("product_id", "tag_id");


--
-- Name: product_types product_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_types"
    ADD CONSTRAINT "product_types_pkey" PRIMARY KEY ("id");


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id");


--
-- Name: product_variants product_variants_sku_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_sku_key" UNIQUE ("sku");


--
-- Name: products_ingestion products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."products_ingestion"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("sku");


--
-- Name: products products_pkey1; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey1" PRIMARY KEY ("id");


--
-- Name: products products_sku_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_sku_key" UNIQUE ("sku");


--
-- Name: products products_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_slug_key" UNIQUE ("slug");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");


--
-- Name: promo_codes promo_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_code_key" UNIQUE ("code");


--
-- Name: promo_codes promo_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id");


--
-- Name: promo_redemptions promo_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."promo_redemptions"
    ADD CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY ("id");


--
-- Name: recently_viewed recently_viewed_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recently_viewed"
    ADD CONSTRAINT "recently_viewed_pkey" PRIMARY KEY ("user_id", "product_id");


--
-- Name: related_products related_products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."related_products"
    ADD CONSTRAINT "related_products_pkey" PRIMARY KEY ("product_id", "related_product_id");


--
-- Name: related_products related_products_unique_relation; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."related_products"
    ADD CONSTRAINT "related_products_unique_relation" UNIQUE ("product_id", "related_product_id", "relation_type");


--
-- Name: review_helpful_votes review_helpful_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."review_helpful_votes"
    ADD CONSTRAINT "review_helpful_votes_pkey" PRIMARY KEY ("user_id", "review_id");


--
-- Name: runner_api_keys runner_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."runner_api_keys"
    ADD CONSTRAINT "runner_api_keys_pkey" PRIMARY KEY ("id");


--
-- Name: enrichment_job_logs scrape_job_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."enrichment_job_logs"
    ADD CONSTRAINT "scrape_job_logs_pkey" PRIMARY KEY ("id");


--
-- Name: scrape_results scrape_results_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scrape_results"
    ADD CONSTRAINT "scrape_results_pkey" PRIMARY KEY ("id");


--
-- Name: scraper_config_test_skus scraper_config_test_skus_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_config_test_skus"
    ADD CONSTRAINT "scraper_config_test_skus_pkey" PRIMARY KEY ("id");


--
-- Name: scraper_config_versions scraper_config_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_config_versions"
    ADD CONSTRAINT "scraper_config_versions_pkey" PRIMARY KEY ("id");


--
-- Name: scraper_configs scraper_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_configs"
    ADD CONSTRAINT "scraper_configs_pkey" PRIMARY KEY ("id");


--
-- Name: scraper_configs scraper_configs_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_configs"
    ADD CONSTRAINT "scraper_configs_slug_key" UNIQUE ("slug");


--
-- Name: scraper_credentials scraper_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_credentials"
    ADD CONSTRAINT "scraper_credentials_pkey" PRIMARY KEY ("id");


--
-- Name: scraper_credentials scraper_credentials_slug_type_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_credentials"
    ADD CONSTRAINT "scraper_credentials_slug_type_unique" UNIQUE ("scraper_slug", "credential_type");


--
-- Name: scraper_health_metrics scraper_health_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_health_metrics"
    ADD CONSTRAINT "scraper_health_metrics_pkey" PRIMARY KEY ("id");


--
-- Name: scraper_runners scraper_runners_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_runners"
    ADD CONSTRAINT "scraper_runners_pkey" PRIMARY KEY ("name");


--
-- Name: scraper_selectors scraper_selectors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_selectors"
    ADD CONSTRAINT "scraper_selectors_pkey" PRIMARY KEY ("id");


--
-- Name: scraper_workflow_steps scraper_workflow_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_workflow_steps"
    ADD CONSTRAINT "scraper_workflow_steps_pkey" PRIMARY KEY ("id");


--
-- Name: service_costs service_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."service_costs"
    ADD CONSTRAINT "service_costs_pkey" PRIMARY KEY ("id");


--
-- Name: service_costs service_costs_service_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."service_costs"
    ADD CONSTRAINT "service_costs_service_key" UNIQUE ("service");


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");


--
-- Name: services services_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_slug_key" UNIQUE ("slug");


--
-- Name: shopsite_product_sync shopsite_product_sync_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."shopsite_product_sync"
    ADD CONSTRAINT "shopsite_product_sync_pkey" PRIMARY KEY ("id");


--
-- Name: shopsite_product_sync shopsite_product_sync_product_source_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."shopsite_product_sync"
    ADD CONSTRAINT "shopsite_product_sync_product_source_key" UNIQUE ("product_id", "external_source_id");


--
-- Name: site_settings site_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."site_settings"
    ADD CONSTRAINT "site_settings_key_key" UNIQUE ("key");


--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."site_settings"
    ADD CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id");


--
-- Name: stripe_webhook_events stripe_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stripe_webhook_events"
    ADD CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("event_id");


--
-- Name: subscription_items subscription_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscription_items"
    ADD CONSTRAINT "subscription_items_pkey" PRIMARY KEY ("id");


--
-- Name: subscription_items subscription_items_unique_product; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscription_items"
    ADD CONSTRAINT "subscription_items_unique_product" UNIQUE ("subscription_id", "product_id");


--
-- Name: subscription_suggestions subscription_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscription_suggestions"
    ADD CONSTRAINT "subscription_suggestions_pkey" PRIMARY KEY ("id");


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");


--
-- Name: tags tags_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_name_key" UNIQUE ("name");


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");


--
-- Name: tags tags_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_slug_key" UNIQUE ("slug");


--
-- Name: scraper_health_metrics unique_config_metric_date; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_health_metrics"
    ADD CONSTRAINT "unique_config_metric_date" UNIQUE ("config_id", "metric_date");


--
-- Name: scraper_config_test_skus unique_config_sku; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_config_test_skus"
    ADD CONSTRAINT "unique_config_sku" UNIQUE ("config_id", "sku");


--
-- Name: scraper_config_versions unique_version_per_config; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_config_versions"
    ADD CONSTRAINT "unique_version_per_config" UNIQUE ("config_id", "version_number");


--
-- Name: user_api_keys user_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_api_keys"
    ADD CONSTRAINT "user_api_keys_pkey" PRIMARY KEY ("id");


--
-- Name: user_pets user_pets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_pets"
    ADD CONSTRAINT "user_pets_pkey" PRIMARY KEY ("id");


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");


--
-- Name: wishlists wishlists_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_pkey" PRIMARY KEY ("user_id", "product_id");


--
-- Name: categories_slug_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "categories_slug_unique" ON "public"."categories" USING "btree" ("slug") WHERE ("slug" IS NOT NULL);


--
-- Name: enrichment_attempts_job_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "enrichment_attempts_job_idx" ON "public"."enrichment_attempts" USING "btree" ("job_id");


--
-- Name: enrichment_attempts_sku_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "enrichment_attempts_sku_idx" ON "public"."enrichment_attempts" USING "btree" ("sku");


--
-- Name: enrichment_attempts_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "enrichment_attempts_status_idx" ON "public"."enrichment_attempts" USING "btree" ("status", "created_at");


--
-- Name: enrichment_jobs_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "enrichment_jobs_status_idx" ON "public"."enrichment_jobs" USING "btree" ("status", "created_at");


--
-- Name: enrichment_targets_domain_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "enrichment_targets_domain_idx" ON "public"."enrichment_targets" USING "btree" ("domain");


--
-- Name: enrichment_targets_selected_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "enrichment_targets_selected_idx" ON "public"."enrichment_targets" USING "btree" ("sku", "selected") WHERE ("selected" = true);


--
-- Name: enrichment_targets_sku_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "enrichment_targets_sku_idx" ON "public"."enrichment_targets" USING "btree" ("sku");


--
-- Name: enrichment_targets_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "enrichment_targets_status_idx" ON "public"."enrichment_targets" USING "btree" ("status");


--
-- Name: idx_addresses_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_addresses_user_id" ON "public"."addresses" USING "btree" ("user_id");


--
-- Name: idx_b2b_feeds_distributor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_b2b_feeds_distributor" ON "public"."b2b_feeds" USING "btree" ("distributor_code");


--
-- Name: idx_b2b_feeds_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_b2b_feeds_status" ON "public"."b2b_feeds" USING "btree" ("status");


--
-- Name: idx_b2b_sync_jobs_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_b2b_sync_jobs_created" ON "public"."b2b_sync_jobs" USING "btree" ("created_at" DESC);


--
-- Name: idx_b2b_sync_jobs_feed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_b2b_sync_jobs_feed" ON "public"."b2b_sync_jobs" USING "btree" ("feed_id");


--
-- Name: idx_b2b_sync_jobs_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_b2b_sync_jobs_status" ON "public"."b2b_sync_jobs" USING "btree" ("status");


--
-- Name: idx_batch_job_items_batch_id_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_batch_job_items_batch_id_status" ON "public"."batch_job_items" USING "btree" ("batch_job_id", "status");


--
-- Name: idx_batch_job_items_batch_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_batch_job_items_batch_status" ON "public"."batch_job_items" USING "btree" ("batch_job_id", "status");


--
-- Name: idx_batch_job_items_fallback_batch_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_batch_job_items_fallback_batch_id" ON "public"."batch_job_items" USING "btree" ("fallback_batch_id") WHERE ("fallback_batch_id" IS NOT NULL);


--
-- Name: idx_batch_job_items_sku; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_batch_job_items_sku" ON "public"."batch_job_items" USING "btree" ("sku");


--
-- Name: idx_batch_jobs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_batch_jobs_created_at" ON "public"."batch_jobs" USING "btree" ("created_at" DESC);


--
-- Name: idx_batch_jobs_execution_mode; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_batch_jobs_execution_mode" ON "public"."batch_jobs" USING "btree" ("execution_mode");


--
-- Name: idx_batch_jobs_openai_batch_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_batch_jobs_openai_batch_id" ON "public"."batch_jobs" USING "btree" ("openai_batch_id") WHERE ("openai_batch_id" IS NOT NULL);


--
-- Name: idx_batch_jobs_provider_batch_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_batch_jobs_provider_batch_id" ON "public"."batch_jobs" USING "btree" ("provider", "provider_batch_id") WHERE ("provider_batch_id" IS NOT NULL);


--
-- Name: idx_batch_jobs_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_batch_jobs_status" ON "public"."batch_jobs" USING "btree" ("status");


--
-- Name: idx_brand_scraper_affinity_brand; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_brand_scraper_affinity_brand" ON "public"."brand_scraper_affinity" USING "btree" ("brand_name");


--
-- Name: idx_brand_scraper_affinity_hit_rate; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_brand_scraper_affinity_hit_rate" ON "public"."brand_scraper_affinity" USING "btree" ("hit_rate" DESC);


--
-- Name: idx_brand_sources_asset_domains; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_brand_sources_asset_domains" ON "public"."brand_sources" USING "gin" ("asset_domains");


--
-- Name: idx_brand_sources_domains; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_brand_sources_domains" ON "public"."brand_sources" USING "gin" ("domains");


--
-- Name: idx_brand_sources_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_brand_sources_lookup" ON "public"."brand_sources" USING "btree" ("brand_id", "enabled", "priority");


--
-- Name: idx_brand_sources_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_brand_sources_unique" ON "public"."brand_sources" USING "btree" ("brand_id", "source_type", "source_slug");


--
-- Name: idx_bsm_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_bsm_lookup" ON "public"."brand_scraper_mappings" USING "btree" ("brand_id", "is_active", "priority" DESC, "scraper_config_id");


--
-- Name: idx_bsm_scraper; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_bsm_scraper" ON "public"."brand_scraper_mappings" USING "btree" ("scraper_config_id");


--
-- Name: idx_categories_breadcrumb; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_categories_breadcrumb" ON "public"."categories" USING "btree" ("breadcrumb");


--
-- Name: idx_categories_department_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_categories_department_key" ON "public"."categories" USING "btree" ("department_key");


--
-- Name: idx_categories_depth; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_categories_depth" ON "public"."categories" USING "btree" ("depth");


--
-- Name: idx_categories_facet_profile; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_categories_facet_profile" ON "public"."categories" USING "btree" ("facet_profile");


--
-- Name: idx_categories_is_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_categories_is_active" ON "public"."categories" USING "btree" ("is_active");


--
-- Name: idx_categories_parent_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_categories_parent_id" ON "public"."categories" USING "btree" ("parent_id");


--
-- Name: idx_categories_slug_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_categories_slug_unique" ON "public"."categories" USING "btree" ("slug");


--
-- Name: idx_categories_sort_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_categories_sort_order" ON "public"."categories" USING "btree" ("sort_order");


--
-- Name: idx_cohort_batches_brand_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cohort_batches_brand_id" ON "public"."cohort_batches" USING "btree" ("brand_id");


--
-- Name: idx_cohort_batches_brand_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cohort_batches_brand_name" ON "public"."cohort_batches" USING "btree" ("brand_name");


--
-- Name: idx_cohort_batches_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cohort_batches_name" ON "public"."cohort_batches" USING "btree" ("name");


--
-- Name: idx_cohort_batches_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cohort_batches_status" ON "public"."cohort_batches" USING "btree" ("status");


--
-- Name: idx_cohort_batches_upc_prefix; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cohort_batches_upc_prefix" ON "public"."cohort_batches" USING "btree" ("upc_prefix");


--
-- Name: idx_cohort_members_cohort_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cohort_members_cohort_order" ON "public"."cohort_members" USING "btree" ("cohort_id", "sort_order");


--
-- Name: idx_cohort_members_sku; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cohort_members_sku" ON "public"."cohort_members" USING "btree" ("product_sku");


--
-- Name: idx_cohort_members_upc_prefix; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cohort_members_upc_prefix" ON "public"."cohort_members" USING "btree" ("upc_prefix");


--
-- Name: idx_config_versions_config_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_config_versions_config_status" ON "public"."scraper_config_versions" USING "btree" ("config_id", "status");


--
-- Name: idx_config_versions_latest; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_config_versions_latest" ON "public"."scraper_config_versions" USING "btree" ("config_id", "version_number" DESC);


--
-- Name: idx_config_versions_published; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_config_versions_published" ON "public"."scraper_config_versions" USING "btree" ("config_id", "status", "published_at" DESC);


--
-- Name: idx_consolidation_review_active_per_sku; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_consolidation_review_active_per_sku" ON "public"."consolidation_review_requests" USING "btree" ("sku") WHERE ("status" = ANY (ARRAY['needs_input'::"text", 'auto_resolved'::"text"]));


--
-- Name: idx_consolidation_review_batch_job; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_consolidation_review_batch_job" ON "public"."consolidation_review_requests" USING "btree" ("batch_job_id") WHERE ("batch_job_id" IS NOT NULL);


--
-- Name: idx_consolidation_review_cohort_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_consolidation_review_cohort_status" ON "public"."consolidation_review_requests" USING "btree" ("cohort_id", "status");


--
-- Name: idx_consolidation_review_sku_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_consolidation_review_sku_status" ON "public"."consolidation_review_requests" USING "btree" ("sku", "status");


--
-- Name: idx_consolidation_review_status_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_consolidation_review_status_created" ON "public"."consolidation_review_requests" USING "btree" ("status", "created_at" DESC) WHERE ("status" = ANY (ARRAY['needs_input'::"text", 'auto_resolved'::"text"]));


--
-- Name: idx_email_subscribers_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_email_subscribers_email" ON "public"."email_subscribers" USING "btree" ("email");


--
-- Name: idx_email_subscribers_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_email_subscribers_source" ON "public"."email_subscribers" USING "btree" ("source");


--
-- Name: idx_facet_definitions_is_deprecated; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_facet_definitions_is_deprecated" ON "public"."facet_definitions" USING "btree" ("is_deprecated");


--
-- Name: idx_facet_values_facet_definition_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_facet_values_facet_definition_id" ON "public"."facet_values" USING "btree" ("facet_definition_id");


--
-- Name: idx_facet_values_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_facet_values_slug" ON "public"."facet_values" USING "btree" ("slug");


--
-- Name: idx_image_retry_queue_error_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_image_retry_queue_error_type" ON "public"."image_retry_queue" USING "btree" ("error_type");


--
-- Name: idx_image_retry_queue_processing; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_image_retry_queue_processing" ON "public"."image_retry_queue" USING "btree" ("status", "scheduled_for", "retry_count", "max_retries") WHERE ("status" = ANY (ARRAY['pending'::"public"."image_retry_status", 'processing'::"public"."image_retry_status"]));


--
-- Name: idx_image_retry_queue_scheduled; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_image_retry_queue_scheduled" ON "public"."image_retry_queue" USING "btree" ("scheduled_for");


--
-- Name: INDEX "idx_image_retry_queue_scheduled"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON INDEX "public"."idx_image_retry_queue_scheduled" IS 'Fast lookup of retries by scheduled time';


--
-- Name: idx_image_retry_queue_sku; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_image_retry_queue_sku" ON "public"."image_retry_queue" USING "btree" ("sku");


--
-- Name: idx_image_retry_queue_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_image_retry_queue_status" ON "public"."image_retry_queue" USING "btree" ("status");


--
-- Name: INDEX "idx_image_retry_queue_status"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON INDEX "public"."idx_image_retry_queue_status" IS 'Fast lookup of retries by status';


--
-- Name: idx_integration_sync_runs_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_integration_sync_runs_created_by" ON "public"."integration_sync_runs" USING "btree" ("created_by");


--
-- Name: idx_integration_sync_runs_external_source_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_integration_sync_runs_external_source_id" ON "public"."integration_sync_runs" USING "btree" ("external_source_id");


--
-- Name: idx_integration_sync_runs_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_integration_sync_runs_source" ON "public"."integration_sync_runs" USING "btree" ("source_type", "source_system");


--
-- Name: idx_integration_sync_runs_started; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_integration_sync_runs_started" ON "public"."integration_sync_runs" USING "btree" ("started_at" DESC);


--
-- Name: idx_inventory_items_sku; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_inventory_items_sku" ON "public"."inventory_items" USING "btree" ("sku");


--
-- Name: idx_inventory_items_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_inventory_items_status" ON "public"."inventory_items" USING "btree" ("status");


--
-- Name: idx_inventory_reconciliation_items_issue_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_inventory_reconciliation_items_issue_type" ON "public"."inventory_reconciliation_items" USING "btree" ("issue_type");


--
-- Name: idx_inventory_reconciliation_items_sku; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_inventory_reconciliation_items_sku" ON "public"."inventory_reconciliation_items" USING "btree" ("sku");


--
-- Name: idx_inventory_reconciliation_items_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_inventory_reconciliation_items_status" ON "public"."inventory_reconciliation_items" USING "btree" ("status");


--
-- Name: idx_inventory_reconciliation_items_sync_run; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_inventory_reconciliation_items_sync_run" ON "public"."inventory_reconciliation_items" USING "btree" ("sync_run_id");


--
-- Name: idx_legacy_redirects_old_path; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_legacy_redirects_old_path" ON "public"."legacy_redirects" USING "btree" ("old_path");


--
-- Name: idx_llm_parallel_runs_batch_pair; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_llm_parallel_runs_batch_pair" ON "public"."llm_parallel_runs" USING "btree" ("workflow", "primary_provider", "primary_batch_id", "shadow_provider", "shadow_batch_id");


--
-- Name: idx_llm_parallel_runs_status_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_llm_parallel_runs_status_created_at" ON "public"."llm_parallel_runs" USING "btree" ("status", "created_at" DESC);


--
-- Name: idx_official_brand_url_candidates_cohort_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_official_brand_url_candidates_cohort_status" ON "public"."official_brand_url_candidates" USING "btree" ("cohort_id", "selection_status", "updated_at" DESC) WHERE ("cohort_id" IS NOT NULL);


--
-- Name: idx_official_brand_url_candidates_discovery_job; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_official_brand_url_candidates_discovery_job" ON "public"."official_brand_url_candidates" USING "btree" ("discovery_job_id") WHERE ("discovery_job_id" IS NOT NULL);


--
-- Name: idx_official_brand_url_candidates_extraction_job; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_official_brand_url_candidates_extraction_job" ON "public"."official_brand_url_candidates" USING "btree" ("extraction_job_id") WHERE ("extraction_job_id" IS NOT NULL);


--
-- Name: idx_official_brand_url_candidates_reviewed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_official_brand_url_candidates_reviewed" ON "public"."official_brand_url_candidates" USING "btree" ("reviewed_at" DESC NULLS LAST) WHERE ("reviewed_at" IS NOT NULL);


--
-- Name: idx_official_brand_url_candidates_sku_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_official_brand_url_candidates_sku_status" ON "public"."official_brand_url_candidates" USING "btree" ("sku", "selection_status", "updated_at" DESC);


--
-- Name: idx_order_events_event_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_events_event_type" ON "public"."order_events" USING "btree" ("event_type");


--
-- Name: idx_order_events_order_id_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_events_order_id_created_at" ON "public"."order_events" USING "btree" ("order_id", "created_at" DESC);


--
-- Name: idx_order_items_batch; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_items_batch" ON "public"."order_items" USING "btree" ("preorder_batch_id");


--
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_items_order_id" ON "public"."order_items" USING "btree" ("order_id");


--
-- Name: idx_order_payments_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_payments_order_id" ON "public"."order_payments" USING "btree" ("order_id");


--
-- Name: idx_order_payments_stripe_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_order_payments_stripe_event_id" ON "public"."order_payments" USING "btree" ("stripe_event_id") WHERE ("stripe_event_id" IS NOT NULL);


--
-- Name: idx_order_source_records_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_source_records_order_id" ON "public"."order_source_records" USING "btree" ("order_id");


--
-- Name: idx_order_source_records_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_source_records_source" ON "public"."order_source_records" USING "btree" ("source_type", "source_system");


--
-- Name: idx_order_source_records_sync_run; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_order_source_records_sync_run" ON "public"."order_source_records" USING "btree" ("sync_run_id");


--
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at" DESC);


--
-- Name: idx_orders_fulfillment_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_fulfillment_status" ON "public"."orders" USING "btree" ("fulfillment_status");


--
-- Name: idx_orders_payment_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_payment_status" ON "public"."orders" USING "btree" ("payment_status");


--
-- Name: idx_orders_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_source" ON "public"."orders" USING "btree" ("source");


--
-- Name: idx_orders_source_external_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_orders_source_external_unique" ON "public"."orders" USING "btree" ("source_type", "source_system", "external_order_id") WHERE ("external_order_id" IS NOT NULL);


--
-- Name: idx_orders_source_type_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_source_type_created_at" ON "public"."orders" USING "btree" ("source_type", "created_at" DESC);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");


--
-- Name: idx_orders_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orders_user_id" ON "public"."orders" USING "btree" ("user_id");


--
-- Name: idx_pet_types_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_pet_types_name" ON "public"."pet_types" USING "btree" ("name");


--
-- Name: idx_pipeline_audit_actor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_pipeline_audit_actor" ON "public"."pipeline_audit_log" USING "btree" ("actor_id", "created_at" DESC);


--
-- Name: idx_pipeline_audit_job; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_pipeline_audit_job" ON "public"."pipeline_audit_log" USING "btree" ("job_type", "job_id");


--
-- Name: INDEX "idx_pipeline_audit_job"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON INDEX "public"."idx_pipeline_audit_job" IS 'Fast lookup of audit history by job.';


--
-- Name: idx_pipeline_audit_state; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_pipeline_audit_state" ON "public"."pipeline_audit_log" USING "btree" ("to_state", "created_at" DESC);


--
-- Name: idx_pipeline_retry_queue_original; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_pipeline_retry_queue_original" ON "public"."pipeline_retry_queue" USING "btree" ("job_type", "original_job_id");


--
-- Name: idx_pipeline_retry_queue_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_pipeline_retry_queue_status" ON "public"."pipeline_retry_queue" USING "btree" ("status", "priority" DESC, "created_at");


--
-- Name: INDEX "idx_pipeline_retry_queue_status"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON INDEX "public"."idx_pipeline_retry_queue_status" IS 'Fast lookup of retryable jobs by status.';


--
-- Name: idx_preorder_batches_arrival; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_preorder_batches_arrival" ON "public"."preorder_batches" USING "btree" ("arrival_date");


--
-- Name: idx_preorder_groups_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_preorder_groups_slug" ON "public"."preorder_groups" USING "btree" ("slug");


--
-- Name: idx_price_history_product_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_price_history_product_time" ON "public"."price_history" USING "btree" ("product_id", "recorded_at" DESC);


--
-- Name: idx_price_history_variant_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_price_history_variant_time" ON "public"."price_history" USING "btree" ("variant_id", "recorded_at" DESC) WHERE ("variant_id" IS NOT NULL);


--
-- Name: idx_product_answers_question_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_answers_question_id" ON "public"."product_answers" USING "btree" ("question_id");


--
-- Name: idx_product_attributes_filterable; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_attributes_filterable" ON "public"."product_attributes" USING "btree" ("key", "value") WHERE ("is_filterable" = true);


--
-- Name: idx_product_attributes_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_attributes_key" ON "public"."product_attributes" USING "btree" ("key");


--
-- Name: idx_product_attributes_product_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_attributes_product_id" ON "public"."product_attributes" USING "btree" ("product_id");


--
-- Name: idx_product_categories_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_categories_category" ON "public"."product_categories" USING "btree" ("category_id");


--
-- Name: idx_product_categories_one_canonical_per_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_product_categories_one_canonical_per_product" ON "public"."product_categories" USING "btree" ("product_id") WHERE ("relationship_type" = 'canonical'::"text");


--
-- Name: idx_product_categories_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_categories_product" ON "public"."product_categories" USING "btree" ("product_id");


--
-- Name: idx_product_categories_relationship_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_categories_relationship_type" ON "public"."product_categories" USING "btree" ("relationship_type");


--
-- Name: idx_product_facets_facet_value_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_facets_facet_value_id" ON "public"."product_facets" USING "btree" ("facet_value_id");


--
-- Name: idx_product_facets_product_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_facets_product_id" ON "public"."product_facets" USING "btree" ("product_id");


--
-- Name: idx_product_group_products_default; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_product_group_products_default" ON "public"."product_group_products" USING "btree" ("group_id") WHERE "is_default";


--
-- Name: idx_product_group_products_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_group_products_group" ON "public"."product_group_products" USING "btree" ("group_id");


--
-- Name: idx_product_group_products_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_group_products_order" ON "public"."product_group_products" USING "btree" ("group_id", "sort_order");


--
-- Name: idx_product_group_products_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_group_products_product" ON "public"."product_group_products" USING "btree" ("product_id");


--
-- Name: idx_product_groups_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_groups_active" ON "public"."product_groups" USING "btree" ("is_active");


--
-- Name: idx_product_groups_brand; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_groups_brand" ON "public"."product_groups" USING "btree" ("brand_id");


--
-- Name: idx_product_groups_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_groups_slug" ON "public"."product_groups" USING "btree" ("slug");


--
-- Name: idx_product_images_one_primary; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_product_images_one_primary" ON "public"."product_images" USING "btree" ("product_id") WHERE (("is_primary" = true) AND ("variant_id" IS NULL));


--
-- Name: idx_product_images_position; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_images_position" ON "public"."product_images" USING "btree" ("product_id", "position");


--
-- Name: idx_product_images_product_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_images_product_id" ON "public"."product_images" USING "btree" ("product_id");


--
-- Name: idx_product_images_storage_path; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_images_storage_path" ON "public"."product_images" USING "btree" ("storage_path") WHERE ("storage_path" IS NOT NULL);


--
-- Name: idx_product_images_variant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_images_variant_id" ON "public"."product_images" USING "btree" ("variant_id");


--
-- Name: idx_product_option_values_option_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_option_values_option_id" ON "public"."product_option_values" USING "btree" ("option_id");


--
-- Name: idx_product_options_product_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_options_product_id" ON "public"."product_options" USING "btree" ("product_id");


--
-- Name: idx_product_pet_types_pet_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_pet_types_pet_type" ON "public"."product_pet_types" USING "btree" ("pet_type_id");


--
-- Name: idx_product_pet_types_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_pet_types_product" ON "public"."product_pet_types" USING "btree" ("product_id");


--
-- Name: idx_product_questions_product_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_questions_product_id" ON "public"."product_questions" USING "btree" ("product_id");


--
-- Name: idx_product_questions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_questions_status" ON "public"."product_questions" USING "btree" ("status");


--
-- Name: idx_product_reviews_product_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_reviews_product_id" ON "public"."product_reviews" USING "btree" ("product_id");


--
-- Name: idx_product_reviews_rating; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_reviews_rating" ON "public"."product_reviews" USING "btree" ("product_id", "rating");


--
-- Name: idx_product_reviews_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_reviews_status" ON "public"."product_reviews" USING "btree" ("status");


--
-- Name: idx_product_reviews_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_reviews_user_id" ON "public"."product_reviews" USING "btree" ("user_id");


--
-- Name: idx_product_scraped_sites_scraper; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_scraped_sites_scraper" ON "public"."product_scraped_sites" USING "btree" ("scraper_name");


--
-- Name: idx_product_scraped_sites_sku; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_scraped_sites_sku" ON "public"."product_scraped_sites" USING "btree" ("sku");


--
-- Name: idx_product_scraped_sites_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_scraped_sites_status" ON "public"."product_scraped_sites" USING "btree" ("status");


--
-- Name: idx_product_storefront_settings_is_featured; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_storefront_settings_is_featured" ON "public"."product_storefront_settings" USING "btree" ("is_featured") WHERE ("is_featured" = true);


--
-- Name: idx_product_storefront_settings_pickup_only; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_storefront_settings_pickup_only" ON "public"."product_storefront_settings" USING "btree" ("pickup_only") WHERE ("pickup_only" = true);


--
-- Name: idx_product_tags_product_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_tags_product_id" ON "public"."product_tags" USING "btree" ("product_id");


--
-- Name: idx_product_tags_tag_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_tags_tag_id" ON "public"."product_tags" USING "btree" ("tag_id");


--
-- Name: idx_product_types_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_types_name" ON "public"."product_types" USING "btree" ("name");


--
-- Name: idx_product_variants_one_default; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_product_variants_one_default" ON "public"."product_variants" USING "btree" ("product_id") WHERE ("is_default" = true);


--
-- Name: idx_product_variants_product_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_variants_product_id" ON "public"."product_variants" USING "btree" ("product_id");


--
-- Name: idx_product_variants_sku; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_product_variants_sku" ON "public"."product_variants" USING "btree" ("sku");


--
-- Name: idx_products_availability; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_availability" ON "public"."products" USING "btree" ("availability");


--
-- Name: idx_products_brand_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_brand_id" ON "public"."products" USING "btree" ("brand_id");


--
-- Name: idx_products_canonical_category_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_canonical_category_id" ON "public"."products" USING "btree" ("canonical_category_id");


--
-- Name: idx_products_date_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_date_created" ON "public"."products" USING "btree" ("date_created");


--
-- Name: idx_products_date_received; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_date_received" ON "public"."products" USING "btree" ("date_received");


--
-- Name: idx_products_date_sold; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_date_sold" ON "public"."products" USING "btree" ("date_sold");


--
-- Name: idx_products_gtin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_gtin" ON "public"."products" USING "btree" ("gtin") WHERE ("gtin" IS NOT NULL);


--
-- Name: idx_products_ingestion_brand_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_ingestion_brand_id" ON "public"."products_ingestion" USING "btree" ("brand_id");


--
-- Name: idx_products_ingestion_cohort_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_ingestion_cohort_id" ON "public"."products_ingestion" USING "btree" ("cohort_id");


--
-- Name: idx_products_ingestion_confidence_score; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_ingestion_confidence_score" ON "public"."products_ingestion" USING "btree" ("confidence_score");


--
-- Name: idx_products_ingestion_enrichment_config; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_ingestion_enrichment_config" ON "public"."products_ingestion" USING "gin" ("enrichment_config");


--
-- Name: idx_products_ingestion_image_candidates; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_ingestion_image_candidates" ON "public"."products_ingestion" USING "gin" ("image_candidates");


--
-- Name: idx_products_ingestion_pipeline_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_ingestion_pipeline_status" ON "public"."products_ingestion" USING "btree" ("pipeline_status");


--
-- Name: idx_products_ingestion_pipeline_status_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_ingestion_pipeline_status_active" ON "public"."products_ingestion" USING "btree" ("pipeline_status", "exported_at");


--
-- Name: idx_products_ingestion_product_line; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_ingestion_product_line" ON "public"."products_ingestion" USING "btree" ("product_line");


--
-- Name: idx_products_ingestion_review_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_ingestion_review_status" ON "public"."products_ingestion" USING "btree" ("consolidation_review_status") WHERE ("consolidation_review_status" = ANY (ARRAY['needs_input'::"text", 'resolved'::"text"]));


--
-- Name: idx_products_ingestion_scrape_quality; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_ingestion_scrape_quality" ON "public"."products_ingestion" USING "btree" ((("scrape_quality" IS NOT NULL))) WHERE ("scrape_quality" <> '{}'::"jsonb");


--
-- Name: idx_products_ingestion_sku; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_ingestion_sku" ON "public"."products_ingestion" USING "btree" ("sku");


--
-- Name: idx_products_is_special_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_is_special_order" ON "public"."products" USING "btree" ("is_special_order") WHERE ("is_special_order" = true);


--
-- Name: idx_products_sku; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_products_sku" ON "public"."products" USING "btree" ("sku");


--
-- Name: idx_profiles_legacy_customer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_profiles_legacy_customer_id" ON "public"."profiles" USING "btree" ("legacy_customer_id");


--
-- Name: idx_promo_codes_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_promo_codes_active" ON "public"."promo_codes" USING "btree" ("is_active", "starts_at", "expires_at");


--
-- Name: idx_promo_codes_code_upper; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_promo_codes_code_upper" ON "public"."promo_codes" USING "btree" ("upper"("code"));


--
-- Name: idx_promo_codes_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_promo_codes_created_by" ON "public"."promo_codes" USING "btree" ("created_by");


--
-- Name: idx_promo_redemptions_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_promo_redemptions_email" ON "public"."promo_redemptions" USING "btree" ("promo_code_id", "guest_email");


--
-- Name: idx_promo_redemptions_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_promo_redemptions_order" ON "public"."promo_redemptions" USING "btree" ("order_id");


--
-- Name: idx_promo_redemptions_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_promo_redemptions_user" ON "public"."promo_redemptions" USING "btree" ("promo_code_id", "user_id");


--
-- Name: idx_promo_redemptions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_promo_redemptions_user_id" ON "public"."promo_redemptions" USING "btree" ("user_id");


--
-- Name: idx_recently_viewed_user_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_recently_viewed_user_time" ON "public"."recently_viewed" USING "btree" ("user_id", "viewed_at" DESC);


--
-- Name: idx_related_products_product_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_related_products_product_id" ON "public"."related_products" USING "btree" ("product_id");


--
-- Name: idx_related_products_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_related_products_type" ON "public"."related_products" USING "btree" ("product_id", "relation_type");


--
-- Name: idx_runner_api_keys_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_runner_api_keys_hash" ON "public"."runner_api_keys" USING "btree" ("key_hash") WHERE ("revoked_at" IS NULL);


--
-- Name: idx_runner_api_keys_runner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_runner_api_keys_runner" ON "public"."runner_api_keys" USING "btree" ("runner_name");


--
-- Name: idx_scrape_job_logs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scrape_job_logs_created_at" ON "public"."enrichment_job_logs" USING "btree" ("created_at" DESC);


--
-- Name: idx_scrape_job_logs_job_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scrape_job_logs_job_id" ON "public"."enrichment_job_logs" USING "btree" ("job_id");


--
-- Name: idx_scrape_job_logs_job_id_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scrape_job_logs_job_id_created_at" ON "public"."enrichment_job_logs" USING "btree" ("job_id", "created_at");


--
-- Name: idx_scrape_job_logs_job_id_event_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_scrape_job_logs_job_id_event_id" ON "public"."enrichment_job_logs" USING "btree" ("job_id", "event_id");


--
-- Name: idx_scrape_job_logs_job_id_runner_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scrape_job_logs_job_id_runner_name" ON "public"."enrichment_job_logs" USING "btree" ("job_id", "runner_name");


--
-- Name: idx_scrape_job_logs_job_id_sequence; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scrape_job_logs_job_id_sequence" ON "public"."enrichment_job_logs" USING "btree" ("job_id", "sequence");


--
-- Name: idx_scrape_results_data_gin; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scrape_results_data_gin" ON "public"."scrape_results" USING "gin" ("data");


--
-- Name: idx_scrape_results_idempotency_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_scrape_results_idempotency_key" ON "public"."scrape_results" USING "btree" ((("data" ->> '_idempotency_key'::"text"))) WHERE (("data" ->> '_idempotency_key'::"text") IS NOT NULL);


--
-- Name: idx_scrape_results_job_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scrape_results_job_id" ON "public"."scrape_results" USING "btree" ("job_id");


--
-- Name: idx_scraper_config_test_skus_config_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scraper_config_test_skus_config_id" ON "public"."scraper_config_test_skus" USING "btree" ("config_id");


--
-- Name: idx_scraper_config_test_skus_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scraper_config_test_skus_type" ON "public"."scraper_config_test_skus" USING "btree" ("config_id", "sku_type");


--
-- Name: idx_scraper_configs_current_version; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scraper_configs_current_version" ON "public"."scraper_configs" USING "btree" ("current_version_id");


--
-- Name: idx_scraper_configs_domain; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scraper_configs_domain" ON "public"."scraper_configs" USING "btree" ("domain");


--
-- Name: idx_scraper_configs_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scraper_configs_slug" ON "public"."scraper_configs" USING "btree" ("slug");


--
-- Name: idx_scraper_health_metrics_config_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scraper_health_metrics_config_date" ON "public"."scraper_health_metrics" USING "btree" ("config_id", "metric_date" DESC);


--
-- Name: idx_scraper_health_metrics_config_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scraper_health_metrics_config_id" ON "public"."scraper_health_metrics" USING "btree" ("config_id");


--
-- Name: idx_scraper_health_metrics_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scraper_health_metrics_date" ON "public"."scraper_health_metrics" USING "btree" ("metric_date" DESC);


--
-- Name: idx_scraper_runners_auth_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scraper_runners_auth_user_id" ON "public"."scraper_runners" USING "btree" ("auth_user_id");


--
-- Name: idx_scraper_runners_current_job_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scraper_runners_current_job_id" ON "public"."scraper_runners" USING "btree" ("current_job_id");


--
-- Name: idx_scraper_runners_enabled; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scraper_runners_enabled" ON "public"."scraper_runners" USING "btree" ("enabled");


--
-- Name: idx_scraper_selectors_version; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scraper_selectors_version" ON "public"."scraper_selectors" USING "btree" ("version_id");


--
-- Name: idx_scraper_selectors_version_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_scraper_selectors_version_order" ON "public"."scraper_selectors" USING "btree" ("version_id", "sort_order");


--
-- Name: idx_scraper_workflow_steps_version; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scraper_workflow_steps_version" ON "public"."scraper_workflow_steps" USING "btree" ("version_id");


--
-- Name: idx_scraper_workflow_steps_version_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_scraper_workflow_steps_version_order" ON "public"."scraper_workflow_steps" USING "btree" ("version_id", "sort_order");


--
-- Name: idx_service_costs_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_service_costs_active" ON "public"."service_costs" USING "btree" ("is_active");


--
-- Name: idx_shopsite_product_sync_last_synced_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_shopsite_product_sync_last_synced_at" ON "public"."shopsite_product_sync" USING "btree" ("last_synced_at" DESC);


--
-- Name: idx_shopsite_product_sync_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_shopsite_product_sync_status" ON "public"."shopsite_product_sync" USING "btree" ("sync_status");


--
-- Name: idx_stripe_webhook_events_object_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stripe_webhook_events_object_id" ON "public"."stripe_webhook_events" USING "btree" ("stripe_object_id") WHERE ("stripe_object_id" IS NOT NULL);


--
-- Name: idx_stripe_webhook_events_order_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_stripe_webhook_events_order_id" ON "public"."stripe_webhook_events" USING "btree" ("order_id") WHERE ("order_id" IS NOT NULL);


--
-- Name: idx_user_api_keys_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_api_keys_hash" ON "public"."user_api_keys" USING "btree" ("key_hash") WHERE ("revoked_at" IS NULL);


--
-- Name: idx_user_api_keys_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_api_keys_user" ON "public"."user_api_keys" USING "btree" ("user_id");


--
-- Name: idx_user_pets_life_stage; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_pets_life_stage" ON "public"."user_pets" USING "btree" ("life_stage") WHERE ("life_stage" IS NOT NULL);


--
-- Name: idx_user_pets_pet_type_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_pets_pet_type_id" ON "public"."user_pets" USING "btree" ("pet_type_id");


--
-- Name: idx_user_pets_size_class; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_pets_size_class" ON "public"."user_pets" USING "btree" ("size_class") WHERE ("size_class" IS NOT NULL);


--
-- Name: idx_user_pets_special_needs; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_pets_special_needs" ON "public"."user_pets" USING "gin" ("special_needs");


--
-- Name: idx_user_pets_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_pets_user_id" ON "public"."user_pets" USING "btree" ("user_id");


--
-- Name: idx_wishlists_product_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_wishlists_product_id" ON "public"."wishlists" USING "btree" ("product_id");


--
-- Name: migration_log_sync_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "migration_log_sync_type_idx" ON "public"."migration_log" USING "btree" ("sync_type", "started_at" DESC);


--
-- Name: admin_orders_list _RETURN; Type: RULE; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."admin_orders_list" AS
 SELECT "o"."id",
    "o"."order_number",
    "o"."source_type",
    "o"."source_system",
    "o"."external_order_id",
    "o"."customer_name",
    "o"."customer_email",
    "o"."customer_phone",
    "o"."status",
    "o"."payment_method",
    "o"."payment_status",
    "o"."fulfillment_method",
    "o"."fulfillment_status",
    "o"."subtotal",
    "o"."tax",
    "o"."total",
    "o"."created_at",
    "o"."updated_at",
    "count"("oi"."id") AS "item_count",
    COALESCE("sum"("oi"."quantity"), (0)::bigint) AS "total_quantity"
   FROM ("public"."orders" "o"
     LEFT JOIN "public"."order_items" "oi" ON (("oi"."order_id" = "o"."id")))
  GROUP BY "o"."id";


--
-- Name: batch_job_items batch_job_items_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "batch_job_items_updated_at" BEFORE UPDATE ON "public"."batch_job_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_batch_jobs_updated_at"();


--
-- Name: batch_jobs batch_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "batch_jobs_updated_at" BEFORE UPDATE ON "public"."batch_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."update_batch_jobs_updated_at"();


--
-- Name: brand_scraper_mappings brand_scraper_mappings_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "brand_scraper_mappings_updated_at_trigger" BEFORE UPDATE ON "public"."brand_scraper_mappings" FOR EACH ROW EXECUTE FUNCTION "public"."update_brand_scraper_mappings_updated_at"();


--
-- Name: consolidation_review_requests consolidation_review_requests_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "consolidation_review_requests_updated_at" BEFORE UPDATE ON "public"."consolidation_review_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: enrichment_attempts enrichment_attempts_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enrichment_attempts_updated_at" BEFORE UPDATE ON "public"."enrichment_attempts" FOR EACH ROW EXECUTE FUNCTION "public"."update_enrichment_tables_updated_at"();


--
-- Name: enrichment_jobs enrichment_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enrichment_jobs_updated_at" BEFORE UPDATE ON "public"."enrichment_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."update_enrichment_tables_updated_at"();


--
-- Name: enrichment_targets enrichment_targets_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "enrichment_targets_updated_at" BEFORE UPDATE ON "public"."enrichment_targets" FOR EACH ROW EXECUTE FUNCTION "public"."update_enrichment_tables_updated_at"();


--
-- Name: products ensure_product_storefront_settings_row; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "ensure_product_storefront_settings_row" AFTER INSERT ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_product_storefront_settings_row"();


--
-- Name: llm_parallel_runs llm_parallel_runs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "llm_parallel_runs_updated_at" BEFORE UPDATE ON "public"."llm_parallel_runs" FOR EACH ROW EXECUTE FUNCTION "public"."update_llm_parallel_runs_updated_at"();


--
-- Name: addresses on_address_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "on_address_change" BEFORE INSERT OR UPDATE ON "public"."addresses" FOR EACH ROW EXECUTE FUNCTION "public"."handle_default_address"();


--
-- Name: products_ingestion products_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "products_updated_at" BEFORE UPDATE ON "public"."products_ingestion" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();


--
-- Name: scraper_configs scraper_configs_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "scraper_configs_updated_at_trigger" BEFORE UPDATE ON "public"."scraper_configs" FOR EACH ROW EXECUTE FUNCTION "public"."update_scraper_configs_updated_at"();


--
-- Name: scraper_health_metrics scraper_health_metrics_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "scraper_health_metrics_updated_at_trigger" BEFORE UPDATE ON "public"."scraper_health_metrics" FOR EACH ROW EXECUTE FUNCTION "public"."update_health_metrics_updated_at"();


--
-- Name: service_costs service_costs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "service_costs_updated_at" BEFORE UPDATE ON "public"."service_costs" FOR EACH ROW EXECUTE FUNCTION "public"."update_service_costs_updated_at"();


--
-- Name: external_sources set_external_sources_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_external_sources_updated_at" BEFORE UPDATE ON "public"."external_sources" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: orders set_order_number; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_order_number" BEFORE INSERT ON "public"."orders" FOR EACH ROW WHEN (("new"."order_number" IS NULL)) EXECUTE FUNCTION "public"."generate_order_number"();


--
-- Name: shopsite_product_sync set_shopsite_product_sync_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_shopsite_product_sync_updated_at" BEFORE UPDATE ON "public"."shopsite_product_sync" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: b2b_feeds trigger_b2b_feeds_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_b2b_feeds_updated_at" BEFORE UPDATE ON "public"."b2b_feeds" FOR EACH ROW EXECUTE FUNCTION "public"."update_b2b_feeds_updated_at"();


--
-- Name: brand_sources trigger_brand_sources_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_brand_sources_updated_at" BEFORE UPDATE ON "public"."brand_sources" FOR EACH ROW EXECUTE FUNCTION "public"."update_brand_sources_updated_at"();


--
-- Name: products trigger_record_product_price_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_record_product_price_change" AFTER UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."record_product_price_change"();


--
-- Name: product_variants trigger_record_variant_price_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_record_variant_price_change" AFTER UPDATE ON "public"."product_variants" FOR EACH ROW EXECUTE FUNCTION "public"."record_variant_price_change"();


--
-- Name: orders trigger_set_order_source_type; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_set_order_source_type" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_order_source_type"();


--
-- Name: promo_redemptions trigger_update_promo_usage; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_update_promo_usage" AFTER INSERT ON "public"."promo_redemptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_promo_code_usage"();


--
-- Name: review_helpful_votes trigger_update_review_helpful_count; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_update_review_helpful_count" AFTER INSERT OR DELETE OR UPDATE ON "public"."review_helpful_votes" FOR EACH ROW EXECUTE FUNCTION "public"."update_review_helpful_count"();


--
-- Name: user_pets trigger_update_user_pets_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trigger_update_user_pets_updated_at" BEFORE UPDATE ON "public"."user_pets" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_pets_updated_at"();


--
-- Name: ai_provider_credentials update_ai_provider_credentials_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_ai_provider_credentials_updated_at" BEFORE UPDATE ON "public"."ai_provider_credentials" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: brand_scraper_affinity update_brand_scraper_affinity_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_brand_scraper_affinity_updated_at" BEFORE UPDATE ON "public"."brand_scraper_affinity" FOR EACH ROW EXECUTE FUNCTION "public"."update_brand_scraper_affinity_updated_at"();


--
-- Name: cohort_batches update_cohort_batches_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_cohort_batches_updated_at" BEFORE UPDATE ON "public"."cohort_batches" FOR EACH ROW EXECUTE FUNCTION "public"."update_cohort_batches_updated_at"();


--
-- Name: image_retry_queue update_image_retry_queue_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_image_retry_queue_updated_at" BEFORE UPDATE ON "public"."image_retry_queue" FOR EACH ROW EXECUTE FUNCTION "public"."update_image_retry_queue_updated_at"();


--
-- Name: inventory_items update_inventory_items_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_inventory_items_timestamp" BEFORE UPDATE ON "public"."inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_inventory_items_updated_at"();


--
-- Name: order_payments update_order_payments_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_order_payments_updated_at" BEFORE UPDATE ON "public"."order_payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: orders update_orders_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: pipeline_retry_queue update_pipeline_retry_queue_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_pipeline_retry_queue_updated_at" BEFORE UPDATE ON "public"."pipeline_retry_queue" FOR EACH ROW EXECUTE FUNCTION "public"."update_pipeline_retry_queue_updated_at"();


--
-- Name: product_groups update_product_groups_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_product_groups_updated_at" BEFORE UPDATE ON "public"."product_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_product_groups_updated_at"();


--
-- Name: product_scraped_sites update_product_scraped_sites_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_product_scraped_sites_timestamp" BEFORE UPDATE ON "public"."product_scraped_sites" FOR EACH ROW EXECUTE FUNCTION "public"."update_product_scraped_sites_updated_at"();


--
-- Name: scraper_credentials update_scraper_credentials_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_scraper_credentials_updated_at" BEFORE UPDATE ON "public"."scraper_credentials" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: scraper_health_metrics update_scraper_health_metrics_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_scraper_health_metrics_updated_at" BEFORE UPDATE ON "public"."scraper_health_metrics" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: site_settings update_site_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "update_site_settings_updated_at" BEFORE UPDATE ON "public"."site_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: addresses addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."addresses"
    ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: ai_provider_credentials ai_provider_credentials_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_provider_credentials"
    ADD CONSTRAINT "ai_provider_credentials_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");


--
-- Name: b2b_sync_jobs b2b_sync_jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."b2b_sync_jobs"
    ADD CONSTRAINT "b2b_sync_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: b2b_sync_jobs b2b_sync_jobs_feed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."b2b_sync_jobs"
    ADD CONSTRAINT "b2b_sync_jobs_feed_id_fkey" FOREIGN KEY ("feed_id") REFERENCES "public"."b2b_feeds"("id") ON DELETE CASCADE;


--
-- Name: batch_job_items batch_job_items_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batch_job_items"
    ADD CONSTRAINT "batch_job_items_batch_id_fkey" FOREIGN KEY ("batch_job_id") REFERENCES "public"."batch_jobs"("id") ON DELETE CASCADE;


--
-- Name: batch_job_items batch_job_items_fallback_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batch_job_items"
    ADD CONSTRAINT "batch_job_items_fallback_batch_id_fkey" FOREIGN KEY ("fallback_batch_id") REFERENCES "public"."batch_jobs"("id");


--
-- Name: batch_jobs batch_jobs_parent_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."batch_jobs"
    ADD CONSTRAINT "batch_jobs_parent_batch_id_fkey" FOREIGN KEY ("parent_batch_id") REFERENCES "public"."batch_jobs"("id");


--
-- Name: brand_scraper_mappings brand_scraper_mappings_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."brand_scraper_mappings"
    ADD CONSTRAINT "brand_scraper_mappings_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE CASCADE;


--
-- Name: brand_scraper_mappings brand_scraper_mappings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."brand_scraper_mappings"
    ADD CONSTRAINT "brand_scraper_mappings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: brand_scraper_mappings brand_scraper_mappings_scraper_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."brand_scraper_mappings"
    ADD CONSTRAINT "brand_scraper_mappings_scraper_config_id_fkey" FOREIGN KEY ("scraper_config_id") REFERENCES "public"."scraper_configs"("id") ON DELETE CASCADE;


--
-- Name: brand_scraper_mappings brand_scraper_mappings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."brand_scraper_mappings"
    ADD CONSTRAINT "brand_scraper_mappings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");


--
-- Name: brand_sources brand_sources_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."brand_sources"
    ADD CONSTRAINT "brand_sources_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE CASCADE;


--
-- Name: categories categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;


--
-- Name: cohort_batches cohort_batches_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cohort_batches"
    ADD CONSTRAINT "cohort_batches_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE SET NULL;


--
-- Name: cohort_members cohort_members_cohort_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cohort_members"
    ADD CONSTRAINT "cohort_members_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort_batches"("id") ON DELETE CASCADE;


--
-- Name: consolidation_review_requests consolidation_review_requests_batch_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."consolidation_review_requests"
    ADD CONSTRAINT "consolidation_review_requests_batch_job_id_fkey" FOREIGN KEY ("batch_job_id") REFERENCES "public"."batch_jobs"("id") ON DELETE SET NULL;


--
-- Name: consolidation_review_requests consolidation_review_requests_batch_job_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."consolidation_review_requests"
    ADD CONSTRAINT "consolidation_review_requests_batch_job_item_id_fkey" FOREIGN KEY ("batch_job_item_id") REFERENCES "public"."batch_job_items"("id") ON DELETE SET NULL;


--
-- Name: consolidation_review_requests consolidation_review_requests_cohort_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."consolidation_review_requests"
    ADD CONSTRAINT "consolidation_review_requests_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort_batches"("id") ON DELETE SET NULL;


--
-- Name: consolidation_review_requests consolidation_review_requests_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."consolidation_review_requests"
    ADD CONSTRAINT "consolidation_review_requests_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: consolidation_review_requests consolidation_review_requests_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."consolidation_review_requests"
    ADD CONSTRAINT "consolidation_review_requests_sku_fkey" FOREIGN KEY ("sku") REFERENCES "public"."products_ingestion"("sku") ON DELETE CASCADE;


--
-- Name: enrichment_attempts enrichment_attempts_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."enrichment_attempts"
    ADD CONSTRAINT "enrichment_attempts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."enrichment_jobs"("id") ON DELETE CASCADE;


--
-- Name: enrichment_attempts enrichment_attempts_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."enrichment_attempts"
    ADD CONSTRAINT "enrichment_attempts_sku_fkey" FOREIGN KEY ("sku") REFERENCES "public"."products_ingestion"("sku") ON DELETE CASCADE;


--
-- Name: enrichment_attempts enrichment_attempts_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."enrichment_attempts"
    ADD CONSTRAINT "enrichment_attempts_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."enrichment_targets"("id") ON DELETE SET NULL;


--
-- Name: enrichment_jobs enrichment_jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."enrichment_jobs"
    ADD CONSTRAINT "enrichment_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: enrichment_targets enrichment_targets_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."enrichment_targets"
    ADD CONSTRAINT "enrichment_targets_sku_fkey" FOREIGN KEY ("sku") REFERENCES "public"."products_ingestion"("sku") ON DELETE CASCADE;


--
-- Name: facet_values facet_values_facet_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."facet_values"
    ADD CONSTRAINT "facet_values_facet_definition_id_fkey" FOREIGN KEY ("facet_definition_id") REFERENCES "public"."facet_definitions"("id") ON DELETE CASCADE;


--
-- Name: scraper_config_versions fk_config_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_config_versions"
    ADD CONSTRAINT "fk_config_id" FOREIGN KEY ("config_id") REFERENCES "public"."scraper_configs"("id") ON DELETE CASCADE;


--
-- Name: scraper_configs fk_current_version; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_configs"
    ADD CONSTRAINT "fk_current_version" FOREIGN KEY ("current_version_id") REFERENCES "public"."scraper_config_versions"("id");


--
-- Name: image_retry_queue image_retry_queue_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."image_retry_queue"
    ADD CONSTRAINT "image_retry_queue_sku_fkey" FOREIGN KEY ("sku") REFERENCES "public"."products_ingestion"("sku") ON DELETE CASCADE;


--
-- Name: integration_sync_runs integration_sync_runs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."integration_sync_runs"
    ADD CONSTRAINT "integration_sync_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: integration_sync_runs integration_sync_runs_external_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."integration_sync_runs"
    ADD CONSTRAINT "integration_sync_runs_external_source_id_fkey" FOREIGN KEY ("external_source_id") REFERENCES "public"."external_sources"("id");


--
-- Name: inventory_reconciliation_items inventory_reconciliation_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inventory_reconciliation_items"
    ADD CONSTRAINT "inventory_reconciliation_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");


--
-- Name: inventory_reconciliation_items inventory_reconciliation_items_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inventory_reconciliation_items"
    ADD CONSTRAINT "inventory_reconciliation_items_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id");


--
-- Name: inventory_reconciliation_items inventory_reconciliation_items_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inventory_reconciliation_items"
    ADD CONSTRAINT "inventory_reconciliation_items_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "public"."integration_sync_runs"("id") ON DELETE CASCADE;


--
-- Name: official_brand_url_candidates official_brand_url_candidates_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."official_brand_url_candidates"
    ADD CONSTRAINT "official_brand_url_candidates_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE SET NULL;


--
-- Name: official_brand_url_candidates official_brand_url_candidates_cohort_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."official_brand_url_candidates"
    ADD CONSTRAINT "official_brand_url_candidates_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort_batches"("id") ON DELETE SET NULL;


--
-- Name: official_brand_url_candidates official_brand_url_candidates_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."official_brand_url_candidates"
    ADD CONSTRAINT "official_brand_url_candidates_sku_fkey" FOREIGN KEY ("sku") REFERENCES "public"."products_ingestion"("sku") ON DELETE CASCADE;


--
-- Name: order_events order_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_events"
    ADD CONSTRAINT "order_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: order_events order_events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_events"
    ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;


--
-- Name: order_items order_items_preorder_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_preorder_batch_id_fkey" FOREIGN KEY ("preorder_batch_id") REFERENCES "public"."preorder_batches"("id");


--
-- Name: order_source_records order_source_records_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_source_records"
    ADD CONSTRAINT "order_source_records_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;


--
-- Name: order_source_records order_source_records_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."order_source_records"
    ADD CONSTRAINT "order_source_records_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "public"."integration_sync_runs"("id") ON DELETE SET NULL;


--
-- Name: orders orders_delivery_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_delivery_address_id_fkey" FOREIGN KEY ("delivery_address_id") REFERENCES "public"."addresses"("id");


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: pipeline_audit_log pipeline_audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pipeline_audit_log"
    ADD CONSTRAINT "pipeline_audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");


--
-- Name: pipeline_retry_queue pipeline_retry_queue_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pipeline_retry_queue"
    ADD CONSTRAINT "pipeline_retry_queue_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");


--
-- Name: preorder_batches preorder_batches_preorder_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."preorder_batches"
    ADD CONSTRAINT "preorder_batches_preorder_group_id_fkey" FOREIGN KEY ("preorder_group_id") REFERENCES "public"."preorder_groups"("id") ON DELETE CASCADE;


--
-- Name: price_history price_history_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."price_history"
    ADD CONSTRAINT "price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: price_history price_history_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."price_history"
    ADD CONSTRAINT "price_history_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE CASCADE;


--
-- Name: product_answers product_answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_answers"
    ADD CONSTRAINT "product_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."product_questions"("id") ON DELETE CASCADE;


--
-- Name: product_answers product_answers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_answers"
    ADD CONSTRAINT "product_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: product_answers product_answers_user_profile_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_answers"
    ADD CONSTRAINT "product_answers_user_profile_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");


--
-- Name: product_attributes product_attributes_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_attributes"
    ADD CONSTRAINT "product_attributes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: product_categories product_categories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;


--
-- Name: product_categories product_categories_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: product_facets product_facets_facet_value_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_facets"
    ADD CONSTRAINT "product_facets_facet_value_id_fkey" FOREIGN KEY ("facet_value_id") REFERENCES "public"."facet_values"("id") ON DELETE CASCADE;


--
-- Name: product_facets product_facets_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_facets"
    ADD CONSTRAINT "product_facets_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: product_group_products product_group_products_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_group_products"
    ADD CONSTRAINT "product_group_products_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."product_groups"("id") ON DELETE CASCADE;


--
-- Name: product_group_products product_group_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_group_products"
    ADD CONSTRAINT "product_group_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: product_groups product_groups_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_groups"
    ADD CONSTRAINT "product_groups_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE SET NULL;


--
-- Name: product_groups product_groups_default_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_groups"
    ADD CONSTRAINT "product_groups_default_product_id_fkey" FOREIGN KEY ("default_product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;


--
-- Name: product_images product_images_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_images"
    ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: product_images product_images_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_images"
    ADD CONSTRAINT "product_images_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE CASCADE;


--
-- Name: product_option_values product_option_values_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_option_values"
    ADD CONSTRAINT "product_option_values_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "public"."product_options"("id") ON DELETE CASCADE;


--
-- Name: product_options product_options_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_options"
    ADD CONSTRAINT "product_options_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: product_pet_types product_pet_types_pet_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_pet_types"
    ADD CONSTRAINT "product_pet_types_pet_type_id_fkey" FOREIGN KEY ("pet_type_id") REFERENCES "public"."pet_types"("id") ON DELETE CASCADE;


--
-- Name: product_pet_types product_pet_types_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_pet_types"
    ADD CONSTRAINT "product_pet_types_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: product_preorder_groups product_preorder_groups_preorder_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_preorder_groups"
    ADD CONSTRAINT "product_preorder_groups_preorder_group_id_fkey" FOREIGN KEY ("preorder_group_id") REFERENCES "public"."preorder_groups"("id") ON DELETE CASCADE;


--
-- Name: product_preorder_groups product_preorder_groups_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_preorder_groups"
    ADD CONSTRAINT "product_preorder_groups_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: product_questions product_questions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_questions"
    ADD CONSTRAINT "product_questions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: product_questions product_questions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_questions"
    ADD CONSTRAINT "product_questions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: product_questions product_questions_user_profile_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_questions"
    ADD CONSTRAINT "product_questions_user_profile_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");


--
-- Name: product_reviews product_reviews_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_reviews"
    ADD CONSTRAINT "product_reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: product_reviews product_reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_reviews"
    ADD CONSTRAINT "product_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: product_reviews product_reviews_user_profile_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_reviews"
    ADD CONSTRAINT "product_reviews_user_profile_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");


--
-- Name: product_scraped_sites product_scraped_sites_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_scraped_sites"
    ADD CONSTRAINT "product_scraped_sites_sku_fkey" FOREIGN KEY ("sku") REFERENCES "public"."products_ingestion"("sku") ON DELETE CASCADE;


--
-- Name: product_storefront_settings product_storefront_settings_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_storefront_settings"
    ADD CONSTRAINT "product_storefront_settings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: product_tags product_tags_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_tags"
    ADD CONSTRAINT "product_tags_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: product_tags product_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_tags"
    ADD CONSTRAINT "product_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;


--
-- Name: product_variants product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: products products_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE SET NULL;


--
-- Name: products products_canonical_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_canonical_category_id_fkey" FOREIGN KEY ("canonical_category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;


--
-- Name: products_ingestion products_ingestion_active_consolidation_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."products_ingestion"
    ADD CONSTRAINT "products_ingestion_active_consolidation_review_id_fkey" FOREIGN KEY ("active_consolidation_review_id") REFERENCES "public"."consolidation_review_requests"("id") ON DELETE SET NULL;


--
-- Name: products_ingestion products_ingestion_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."products_ingestion"
    ADD CONSTRAINT "products_ingestion_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id");


--
-- Name: products_ingestion products_ingestion_cohort_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."products_ingestion"
    ADD CONSTRAINT "products_ingestion_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort_batches"("id") ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: promo_codes promo_codes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: promo_redemptions promo_redemptions_promo_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."promo_redemptions"
    ADD CONSTRAINT "promo_redemptions_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE CASCADE;


--
-- Name: promo_redemptions promo_redemptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."promo_redemptions"
    ADD CONSTRAINT "promo_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: recently_viewed recently_viewed_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recently_viewed"
    ADD CONSTRAINT "recently_viewed_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: recently_viewed recently_viewed_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."recently_viewed"
    ADD CONSTRAINT "recently_viewed_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: related_products related_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."related_products"
    ADD CONSTRAINT "related_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: related_products related_products_related_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."related_products"
    ADD CONSTRAINT "related_products_related_product_id_fkey" FOREIGN KEY ("related_product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: review_helpful_votes review_helpful_votes_review_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."review_helpful_votes"
    ADD CONSTRAINT "review_helpful_votes_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."product_reviews"("id") ON DELETE CASCADE;


--
-- Name: review_helpful_votes review_helpful_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."review_helpful_votes"
    ADD CONSTRAINT "review_helpful_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: runner_api_keys runner_api_keys_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."runner_api_keys"
    ADD CONSTRAINT "runner_api_keys_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: runner_api_keys runner_api_keys_runner_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."runner_api_keys"
    ADD CONSTRAINT "runner_api_keys_runner_name_fkey" FOREIGN KEY ("runner_name") REFERENCES "public"."scraper_runners"("name") ON DELETE CASCADE;


--
-- Name: enrichment_job_logs scrape_job_logs_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."enrichment_job_logs"
    ADD CONSTRAINT "scrape_job_logs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."enrichment_jobs"("id") ON DELETE CASCADE;


--
-- Name: scraper_config_test_skus scraper_config_test_skus_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_config_test_skus"
    ADD CONSTRAINT "scraper_config_test_skus_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "auth"."users"("id");


--
-- Name: scraper_config_test_skus scraper_config_test_skus_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_config_test_skus"
    ADD CONSTRAINT "scraper_config_test_skus_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "public"."scraper_configs"("id") ON DELETE CASCADE;


--
-- Name: scraper_config_versions scraper_config_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_config_versions"
    ADD CONSTRAINT "scraper_config_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: scraper_configs scraper_configs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_configs"
    ADD CONSTRAINT "scraper_configs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: scraper_credentials scraper_credentials_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_credentials"
    ADD CONSTRAINT "scraper_credentials_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");


--
-- Name: scraper_health_metrics scraper_health_metrics_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_health_metrics"
    ADD CONSTRAINT "scraper_health_metrics_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "public"."scraper_configs"("id") ON DELETE CASCADE;


--
-- Name: scraper_runners scraper_runners_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_runners"
    ADD CONSTRAINT "scraper_runners_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: scraper_runners scraper_runners_current_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_runners"
    ADD CONSTRAINT "scraper_runners_current_job_id_fkey" FOREIGN KEY ("current_job_id") REFERENCES "public"."enrichment_jobs"("id") ON DELETE SET NULL;


--
-- Name: scraper_selectors scraper_selectors_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_selectors"
    ADD CONSTRAINT "scraper_selectors_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."scraper_config_versions"("id") ON DELETE CASCADE;


--
-- Name: scraper_workflow_steps scraper_workflow_steps_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scraper_workflow_steps"
    ADD CONSTRAINT "scraper_workflow_steps_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."scraper_config_versions"("id") ON DELETE CASCADE;


--
-- Name: shopsite_product_sync shopsite_product_sync_external_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."shopsite_product_sync"
    ADD CONSTRAINT "shopsite_product_sync_external_source_id_fkey" FOREIGN KEY ("external_source_id") REFERENCES "public"."external_sources"("id") ON DELETE CASCADE;


--
-- Name: shopsite_product_sync shopsite_product_sync_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."shopsite_product_sync"
    ADD CONSTRAINT "shopsite_product_sync_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: stripe_webhook_events stripe_webhook_events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stripe_webhook_events"
    ADD CONSTRAINT "stripe_webhook_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;


--
-- Name: subscription_items subscription_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscription_items"
    ADD CONSTRAINT "subscription_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: subscription_items subscription_items_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscription_items"
    ADD CONSTRAINT "subscription_items_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE CASCADE;


--
-- Name: subscription_suggestions subscription_suggestions_pet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscription_suggestions"
    ADD CONSTRAINT "subscription_suggestions_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "public"."user_pets"("id") ON DELETE SET NULL;


--
-- Name: subscription_suggestions subscription_suggestions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscription_suggestions"
    ADD CONSTRAINT "subscription_suggestions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: subscription_suggestions subscription_suggestions_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscription_suggestions"
    ADD CONSTRAINT "subscription_suggestions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_shipping_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_shipping_address_id_fkey" FOREIGN KEY ("shipping_address_id") REFERENCES "public"."addresses"("id");


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_api_keys user_api_keys_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_api_keys"
    ADD CONSTRAINT "user_api_keys_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: user_api_keys user_api_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_api_keys"
    ADD CONSTRAINT "user_api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_pets user_pets_pet_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_pets"
    ADD CONSTRAINT "user_pets_pet_type_id_fkey" FOREIGN KEY ("pet_type_id") REFERENCES "public"."pet_types"("id") ON DELETE RESTRICT;


--
-- Name: user_pets user_pets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_pets"
    ADD CONSTRAINT "user_pets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");


--
-- Name: wishlists wishlists_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;


--
-- Name: wishlists wishlists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: scraper_health_metrics Admin and staff can add health metrics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can add health metrics" ON "public"."scraper_health_metrics" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scraper_config_test_skus Admin and staff can add test SKUs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can add test SKUs" ON "public"."scraper_config_test_skus" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scraper_config_versions Admin and staff can create scraper config versions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can create scraper config versions" ON "public"."scraper_config_versions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scraper_selectors Admin and staff can create scraper selectors; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can create scraper selectors" ON "public"."scraper_selectors" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scraper_workflow_steps Admin and staff can create workflow steps; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can create workflow steps" ON "public"."scraper_workflow_steps" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: brand_scraper_mappings Admin and staff can delete brand scraper mappings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can delete brand scraper mappings" ON "public"."brand_scraper_mappings" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scraper_config_test_skus Admin and staff can delete test SKUs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can delete test SKUs" ON "public"."scraper_config_test_skus" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: brand_scraper_mappings Admin and staff can insert brand scraper mappings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can insert brand scraper mappings" ON "public"."brand_scraper_mappings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scrape_results Admin and staff can insert scrape results; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can insert scrape results" ON "public"."scrape_results" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: brand_scraper_mappings Admin and staff can read brand scraper mappings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can read brand scraper mappings" ON "public"."brand_scraper_mappings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: brand_scraper_mappings Admin and staff can update brand scraper mappings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can update brand scraper mappings" ON "public"."brand_scraper_mappings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scraper_health_metrics Admin and staff can update health metrics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can update health metrics" ON "public"."scraper_health_metrics" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scraper_config_versions Admin and staff can update scraper config versions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can update scraper config versions" ON "public"."scraper_config_versions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scraper_selectors Admin and staff can update scraper selectors; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can update scraper selectors" ON "public"."scraper_selectors" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scraper_config_test_skus Admin and staff can update test SKUs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can update test SKUs" ON "public"."scraper_config_test_skus" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scraper_workflow_steps Admin and staff can update workflow steps; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can update workflow steps" ON "public"."scraper_workflow_steps" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scraper_health_metrics Admin and staff can view health metrics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can view health metrics" ON "public"."scraper_health_metrics" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scraper_config_versions Admin and staff can view scraper config versions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can view scraper config versions" ON "public"."scraper_config_versions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scraper_selectors Admin and staff can view scraper selectors; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can view scraper selectors" ON "public"."scraper_selectors" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scraper_config_test_skus Admin and staff can view test SKUs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can view test SKUs" ON "public"."scraper_config_test_skus" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scraper_workflow_steps Admin and staff can view workflow steps; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin and staff can view workflow steps" ON "public"."scraper_workflow_steps" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: migration_log Admin can insert migration logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin can insert migration logs" ON "public"."migration_log" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: official_brand_url_candidates Admin can manage official brand URL candidates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin can manage official brand URL candidates" ON "public"."official_brand_url_candidates" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: promo_codes Admin can manage promo codes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin can manage promo codes" ON "public"."promo_codes" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: email_subscribers Admin can manage subscribers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin can manage subscribers" ON "public"."email_subscribers" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: official_brand_url_candidates Admin can read official brand URL candidates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin can read official brand URL candidates" ON "public"."official_brand_url_candidates" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: migration_log Admin can update migration logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin can update migration logs" ON "public"."migration_log" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: migration_log Admin can view all migration logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin can view all migration logs" ON "public"."migration_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: promo_redemptions Admin can view all redemptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin can view all redemptions" ON "public"."promo_redemptions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: enrichment_job_logs Admin can view scrape logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin can view scrape logs" ON "public"."enrichment_job_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scrape_results Admin can view scrape results; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin can view scrape results" ON "public"."scrape_results" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: brand_scraper_affinity Admin manage brand scraper affinity; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manage brand scraper affinity" ON "public"."brand_scraper_affinity" USING ("public"."is_staff"());


--
-- Name: cohort_batches Admin manage cohort batches; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manage cohort batches" ON "public"."cohort_batches" USING ("public"."is_staff"());


--
-- Name: cohort_members Admin manage cohort members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manage cohort members" ON "public"."cohort_members" USING ("public"."is_staff"());


--
-- Name: image_retry_queue Admin manage image retry queue; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manage image retry queue" ON "public"."image_retry_queue" USING ((("auth"."jwt"() ->> 'role'::"text") = ANY (ARRAY['admin'::"text", 'staff'::"text"])));


--
-- Name: legacy_redirects Admin manage legacy_redirects; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manage legacy_redirects" ON "public"."legacy_redirects" USING ("public"."is_staff"());


--
-- Name: preorder_batches Admin manage preorder batches; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manage preorder batches" ON "public"."preorder_batches" USING ("public"."is_staff"());


--
-- Name: preorder_groups Admin manage preorder groups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manage preorder groups" ON "public"."preorder_groups" USING ("public"."is_staff"());


--
-- Name: product_group_products Admin manage product group products; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manage product group products" ON "public"."product_group_products" USING ("public"."is_staff"());


--
-- Name: product_groups Admin manage product groups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manage product groups" ON "public"."product_groups" USING ("public"."is_staff"());


--
-- Name: product_preorder_groups Admin manage product preorder groups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manage product preorder groups" ON "public"."product_preorder_groups" USING ("public"."is_staff"());


--
-- Name: pipeline_retry_queue Admin manage retry queue; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin manage retry queue" ON "public"."pipeline_retry_queue" USING ("public"."is_staff"());


--
-- Name: b2b_feeds Admin users can manage b2b_feeds; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin users can manage b2b_feeds" ON "public"."b2b_feeds" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: b2b_sync_jobs Admin users can manage b2b_sync_jobs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin users can manage b2b_sync_jobs" ON "public"."b2b_sync_jobs" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: image_retry_queue Admin view image retry queue; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin view image retry queue" ON "public"."image_retry_queue" FOR SELECT USING ((("auth"."jwt"() ->> 'role'::"text") = ANY (ARRAY['admin'::"text", 'staff'::"text"])));


--
-- Name: pipeline_audit_log Admin view pipeline audit log; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin view pipeline audit log" ON "public"."pipeline_audit_log" FOR SELECT USING ("public"."is_staff"());


--
-- Name: brands Admin/Staff Write Brands; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin/Staff Write Brands" ON "public"."brands" USING ("public"."is_staff"());


--
-- Name: categories Admin/Staff Write Categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin/Staff Write Categories" ON "public"."categories" USING ("public"."is_staff"());


--
-- Name: products_ingestion Admin/Staff Write Ingestion; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin/Staff Write Ingestion" ON "public"."products_ingestion" USING ("public"."is_staff"());


--
-- Name: product_categories Admin/Staff Write Product Categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin/Staff Write Product Categories" ON "public"."product_categories" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());


--
-- Name: product_storefront_settings Admin/Staff Write Product Storefront Settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin/Staff Write Product Storefront Settings" ON "public"."product_storefront_settings" USING ("public"."is_staff"());


--
-- Name: products Admin/Staff Write Products; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin/Staff Write Products" ON "public"."products" USING ("public"."is_staff"());


--
-- Name: services Admin/Staff Write Services; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin/Staff Write Services" ON "public"."services" USING ("public"."is_staff"());


--
-- Name: site_settings Admin/Staff Write Site Settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin/Staff Write Site Settings" ON "public"."site_settings" USING ("public"."is_staff"());


--
-- Name: ai_provider_credentials Admin/Staff read ai provider credentials; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin/Staff read ai provider credentials" ON "public"."ai_provider_credentials" FOR SELECT USING ("public"."is_staff"());


--
-- Name: scraper_credentials Admin/Staff read scraper credentials; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin/Staff read scraper credentials" ON "public"."scraper_credentials" FOR SELECT USING ("public"."is_staff"());


--
-- Name: ai_provider_credentials Admin/Staff write ai provider credentials; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin/Staff write ai provider credentials" ON "public"."ai_provider_credentials" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());


--
-- Name: scraper_credentials Admin/Staff write scraper credentials; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin/Staff write scraper credentials" ON "public"."scraper_credentials" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());


--
-- Name: profiles Admins and Staff can view all profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins and Staff can view all profiles" ON "public"."profiles" FOR SELECT USING ("public"."is_staff"());


--
-- Name: scraper_health_metrics Admins can delete health metrics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete health metrics" ON "public"."scraper_health_metrics" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));


--
-- Name: scraper_config_versions Admins can delete scraper config versions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete scraper config versions" ON "public"."scraper_config_versions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));


--
-- Name: scraper_configs Admins can delete scraper configs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete scraper configs" ON "public"."scraper_configs" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));


--
-- Name: scraper_selectors Admins can delete scraper selectors; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete scraper selectors" ON "public"."scraper_selectors" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));


--
-- Name: scraper_workflow_steps Admins can delete workflow steps; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete workflow steps" ON "public"."scraper_workflow_steps" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));


--
-- Name: pages Admins can do everything; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can do everything" ON "public"."pages" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));


--
-- Name: profiles Admins can manage profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage profiles" ON "public"."profiles" USING ("public"."is_admin"());


--
-- Name: categories Allow admin write access to categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow admin write access to categories" ON "public"."categories" USING ("public"."is_staff"());


--
-- Name: facet_definitions Allow admin write access to facet_definitions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow admin write access to facet_definitions" ON "public"."facet_definitions" USING ("public"."is_staff"());


--
-- Name: facet_values Allow admin write access to facet_values; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow admin write access to facet_values" ON "public"."facet_values" USING ("public"."is_staff"());


--
-- Name: pet_types Allow admin write access to pet_types; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow admin write access to pet_types" ON "public"."pet_types" USING ("public"."is_admin"());


--
-- Name: product_categories Allow admin write access to product_categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow admin write access to product_categories" ON "public"."product_categories" USING ("public"."is_staff"());


--
-- Name: product_facets Allow admin write access to product_facets; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow admin write access to product_facets" ON "public"."product_facets" USING ("public"."is_staff"());


--
-- Name: product_pet_types Allow admin write access to product_pet_types; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow admin write access to product_pet_types" ON "public"."product_pet_types" USING ("public"."is_staff"());


--
-- Name: scraper_health_metrics Allow admin/staff to manage health_metrics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow admin/staff to manage health_metrics" ON "public"."scraper_health_metrics" TO "authenticated" USING (("public"."is_admin"() OR "public"."is_staff"())) WITH CHECK (("public"."is_admin"() OR "public"."is_staff"()));


--
-- Name: scraper_config_test_skus Allow admin/staff to manage test_skus; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow admin/staff to manage test_skus" ON "public"."scraper_config_test_skus" TO "authenticated" USING (("public"."is_admin"() OR "public"."is_staff"())) WITH CHECK (("public"."is_admin"() OR "public"."is_staff"()));


--
-- Name: inventory_items Allow all access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all access" ON "public"."inventory_items" USING (true) WITH CHECK (true);


--
-- Name: product_scraped_sites Allow all access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all access" ON "public"."product_scraped_sites" USING (true) WITH CHECK (true);


--
-- Name: products_ingestion Allow all on products; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all on products" ON "public"."products_ingestion" USING (true);


--
-- Name: batch_jobs Allow all operations on batch_jobs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all operations on batch_jobs" ON "public"."batch_jobs" USING ("public"."is_staff"());


--
-- Name: product_scraped_sites Allow anon read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow anon read" ON "public"."product_scraped_sites" FOR SELECT TO "anon" USING (true);


--
-- Name: product_scraped_sites Allow authenticated read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow authenticated read" ON "public"."product_scraped_sites" FOR SELECT TO "authenticated" USING (true);


--
-- Name: batch_job_items Allow authenticated users to insert batch job items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow authenticated users to insert batch job items" ON "public"."batch_job_items" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: llm_parallel_runs Allow authenticated users to insert llm parallel runs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow authenticated users to insert llm parallel runs" ON "public"."llm_parallel_runs" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: service_costs Allow authenticated users to manage service_costs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow authenticated users to manage service_costs" ON "public"."service_costs" TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: batch_job_items Allow authenticated users to read batch job items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow authenticated users to read batch job items" ON "public"."batch_job_items" FOR SELECT TO "authenticated" USING (true);


--
-- Name: llm_parallel_runs Allow authenticated users to read llm parallel runs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow authenticated users to read llm parallel runs" ON "public"."llm_parallel_runs" FOR SELECT TO "authenticated" USING (true);


--
-- Name: service_costs Allow authenticated users to read service_costs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow authenticated users to read service_costs" ON "public"."service_costs" FOR SELECT TO "authenticated" USING (true);


--
-- Name: batch_job_items Allow authenticated users to update batch job items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow authenticated users to update batch job items" ON "public"."batch_job_items" FOR UPDATE TO "authenticated" USING (true);


--
-- Name: llm_parallel_runs Allow authenticated users to update llm parallel runs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow authenticated users to update llm parallel runs" ON "public"."llm_parallel_runs" FOR UPDATE TO "authenticated" USING (true);


--
-- Name: product_scraped_sites Allow authenticated write; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow authenticated write" ON "public"."product_scraped_sites" TO "authenticated" USING (true);


--
-- Name: categories Allow public read access to categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow public read access to categories" ON "public"."categories" FOR SELECT USING (true);


--
-- Name: facet_definitions Allow public read access to facet_definitions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow public read access to facet_definitions" ON "public"."facet_definitions" FOR SELECT USING (true);


--
-- Name: facet_values Allow public read access to facet_values; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow public read access to facet_values" ON "public"."facet_values" FOR SELECT USING (true);


--
-- Name: pet_types Allow public read access to pet_types; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow public read access to pet_types" ON "public"."pet_types" FOR SELECT USING (true);


--
-- Name: product_categories Allow public read access to product_categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow public read access to product_categories" ON "public"."product_categories" FOR SELECT USING (true);


--
-- Name: product_facets Allow public read access to product_facets; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow public read access to product_facets" ON "public"."product_facets" FOR SELECT USING (true);


--
-- Name: product_pet_types Allow public read access to product_pet_types; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow public read access to product_pet_types" ON "public"."product_pet_types" FOR SELECT USING (true);


--
-- Name: scraper_health_metrics Allow read access to health_metrics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow read access to health_metrics" ON "public"."scraper_health_metrics" FOR SELECT TO "authenticated" USING (true);


--
-- Name: scraper_config_test_skus Allow read access to test_skus; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow read access to test_skus" ON "public"."scraper_config_test_skus" FOR SELECT TO "authenticated" USING (true);


--
-- Name: order_items Anyone can insert order items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Anyone can insert order items" ON "public"."order_items" FOR INSERT WITH CHECK (true);


--
-- Name: orders Anyone can insert orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Anyone can insert orders" ON "public"."orders" FOR INSERT WITH CHECK (((("auth"."uid"() IS NULL) AND ("user_id" IS NULL)) OR ("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"])))))));


--
-- Name: email_subscribers Anyone can subscribe; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Anyone can subscribe" ON "public"."email_subscribers" FOR INSERT WITH CHECK (true);


--
-- Name: promo_codes Anyone can validate active promo codes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Anyone can validate active promo codes" ON "public"."promo_codes" FOR SELECT USING ((("is_active" = true) AND ("starts_at" <= "now"()) AND (("expires_at" IS NULL) OR ("expires_at" > "now"()))));


--
-- Name: product_answers Authenticated users can answer; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can answer" ON "public"."product_answers" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: product_questions Authenticated users can ask questions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can ask questions" ON "public"."product_questions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: scraper_config_versions Authenticated users can create draft versions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can create draft versions" ON "public"."scraper_config_versions" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: product_reviews Authenticated users can create reviews; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can create reviews" ON "public"."product_reviews" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: scraper_configs Authenticated users can create scraper configs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can create scraper configs" ON "public"."scraper_configs" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: runner_api_keys Authenticated users can read keys; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can read keys" ON "public"."runner_api_keys" FOR SELECT TO "authenticated" USING (true);


--
-- Name: scraper_runners Authenticated users can read runners; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can read runners" ON "public"."scraper_runners" FOR SELECT TO "authenticated" USING (true);


--
-- Name: scraper_configs Authenticated users can read scraper configs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can read scraper configs" ON "public"."scraper_configs" FOR SELECT TO "authenticated" USING (true);


--
-- Name: users Can update own user data.; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Can update own user data." ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id"));


--
-- Name: users Can view own user data.; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Can view own user data." ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));


--
-- Name: orders_ingestion Enable all access for anon users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable all access for anon users" ON "public"."orders_ingestion" TO "anon" USING (true) WITH CHECK (true);


--
-- Name: orders_ingestion Enable all access for authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable all access for authenticated users" ON "public"."orders_ingestion" TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: migration_log Enable read for authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read for authenticated users" ON "public"."migration_log" FOR SELECT TO "authenticated" USING (true);


--
-- Name: brands Public Read Brands; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public Read Brands" ON "public"."brands" FOR SELECT USING (true);


--
-- Name: categories Public Read Categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public Read Categories" ON "public"."categories" FOR SELECT USING (true);


--
-- Name: product_storefront_settings Public Read Product Storefront Settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public Read Product Storefront Settings" ON "public"."product_storefront_settings" FOR SELECT USING (true);


--
-- Name: products Public Read Products; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public Read Products" ON "public"."products" FOR SELECT USING (true);


--
-- Name: products_ingestion Public Read Published Ingestion; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public Read Published Ingestion" ON "public"."products_ingestion" FOR SELECT USING (("exported_at" IS NOT NULL));


--
-- Name: services Public Read Services; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public Read Services" ON "public"."services" FOR SELECT USING (true);


--
-- Name: site_settings Public Read Site Settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public Read Site Settings" ON "public"."site_settings" FOR SELECT USING (true);


--
-- Name: product_answers Public can view answers to approved questions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view answers to approved questions" ON "public"."product_answers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."product_questions"
  WHERE (("product_questions"."id" = "product_answers"."question_id") AND ("product_questions"."status" = 'approved'::"text")))));


--
-- Name: product_questions Public can view approved questions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view approved questions" ON "public"."product_questions" FOR SELECT USING (("status" = 'approved'::"text"));


--
-- Name: product_reviews Public can view approved reviews; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view approved reviews" ON "public"."product_reviews" FOR SELECT USING (("status" = 'approved'::"text"));


--
-- Name: product_option_values Public can view option values; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view option values" ON "public"."product_option_values" FOR SELECT USING (true);


--
-- Name: price_history Public can view price history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view price history" ON "public"."price_history" FOR SELECT USING (true);


--
-- Name: product_attributes Public can view product attributes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view product attributes" ON "public"."product_attributes" FOR SELECT USING (true);


--
-- Name: product_images Public can view product images; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view product images" ON "public"."product_images" FOR SELECT USING (true);


--
-- Name: product_options Public can view product options; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view product options" ON "public"."product_options" FOR SELECT USING (true);


--
-- Name: product_tags Public can view product tags; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view product tags" ON "public"."product_tags" FOR SELECT USING (true);


--
-- Name: related_products Public can view related products; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view related products" ON "public"."related_products" FOR SELECT USING (true);


--
-- Name: tags Public can view tags; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view tags" ON "public"."tags" FOR SELECT USING (true);


--
-- Name: product_variants Public can view variants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view variants" ON "public"."product_variants" FOR SELECT USING (true);


--
-- Name: pages Public pages are viewable by everyone; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public pages are viewable by everyone" ON "public"."pages" FOR SELECT USING (("is_published" = true));


--
-- Name: brand_scraper_affinity Public read brand scraper affinity; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public read brand scraper affinity" ON "public"."brand_scraper_affinity" FOR SELECT USING (true);


--
-- Name: cohort_batches Public read cohort batches; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public read cohort batches" ON "public"."cohort_batches" FOR SELECT USING (true);


--
-- Name: cohort_members Public read cohort members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public read cohort members" ON "public"."cohort_members" FOR SELECT USING (true);


--
-- Name: legacy_redirects Public read legacy_redirects; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public read legacy_redirects" ON "public"."legacy_redirects" FOR SELECT USING (true);


--
-- Name: preorder_batches Public read preorder batches; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public read preorder batches" ON "public"."preorder_batches" FOR SELECT USING (true);


--
-- Name: preorder_groups Public read preorder groups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public read preorder groups" ON "public"."preorder_groups" FOR SELECT USING (true);


--
-- Name: product_group_products Public read product group products; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public read product group products" ON "public"."product_group_products" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."product_groups"
  WHERE (("product_groups"."id" = "product_group_products"."group_id") AND ("product_groups"."is_active" = true)))));


--
-- Name: product_groups Public read product groups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public read product groups" ON "public"."product_groups" FOR SELECT USING (("is_active" = true));


--
-- Name: product_preorder_groups Public read product preorder groups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public read product preorder groups" ON "public"."product_preorder_groups" FOR SELECT USING (true);


--
-- Name: scraper_runners Runners can insert own record; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Runners can insert own record" ON "public"."scraper_runners" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "auth_user_id"));


--
-- Name: scraper_config_versions Runners can read published versions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Runners can read published versions" ON "public"."scraper_config_versions" FOR SELECT TO "authenticated" USING ((("status")::"text" = 'published'::"text"));


--
-- Name: scraper_runners Runners can update own record; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Runners can update own record" ON "public"."scraper_runners" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "auth_user_id")) WITH CHECK (("auth"."uid"() = "auth_user_id"));


--
-- Name: scraper_health_metrics Service role bypass for health_metrics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role bypass for health_metrics" ON "public"."scraper_health_metrics" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: scraper_config_test_skus Service role bypass for test_skus; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role bypass for test_skus" ON "public"."scraper_config_test_skus" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: app_settings Service role can do all on app_settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can do all on app_settings" ON "public"."app_settings" USING (("auth"."role"() = 'service_role'::"text"));


--
-- Name: enrichment_job_logs Service role can insert scrape logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can insert scrape logs" ON "public"."enrichment_job_logs" FOR INSERT WITH CHECK (true);


--
-- Name: scrape_results Service role can insert scrape results; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can insert scrape results" ON "public"."scrape_results" FOR INSERT TO "service_role" WITH CHECK (true);


--
-- Name: brand_scraper_mappings Service role can manage brand scraper mappings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can manage brand scraper mappings" ON "public"."brand_scraper_mappings" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: external_sources Service role can manage external sources; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can manage external sources" ON "public"."external_sources" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));


--
-- Name: scraper_health_metrics Service role can manage health metrics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can manage health metrics" ON "public"."scraper_health_metrics" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: integration_sync_runs Service role can manage integration sync runs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can manage integration sync runs" ON "public"."integration_sync_runs" USING (("auth"."role"() = 'service_role'::"text"));


--
-- Name: official_brand_url_candidates Service role can manage official brand URL candidates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can manage official brand URL candidates" ON "public"."official_brand_url_candidates" USING (true) WITH CHECK (true);


--
-- Name: order_events Service role can manage order events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can manage order events" ON "public"."order_events" USING (("auth"."role"() = 'service_role'::"text"));


--
-- Name: order_source_records Service role can manage order source records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can manage order source records" ON "public"."order_source_records" USING (("auth"."role"() = 'service_role'::"text"));


--
-- Name: inventory_reconciliation_items Service role can manage reconciliation items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can manage reconciliation items" ON "public"."inventory_reconciliation_items" USING (("auth"."role"() = 'service_role'::"text"));


--
-- Name: scraper_config_versions Service role can manage scraper config versions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can manage scraper config versions" ON "public"."scraper_config_versions" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: scraper_selectors Service role can manage scraper selectors; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can manage scraper selectors" ON "public"."scraper_selectors" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: shopsite_product_sync Service role can manage shopsite product sync; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can manage shopsite product sync" ON "public"."shopsite_product_sync" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));


--
-- Name: scraper_config_test_skus Service role can manage test SKUs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can manage test SKUs" ON "public"."scraper_config_test_skus" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: scraper_workflow_steps Service role can manage workflow steps; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can manage workflow steps" ON "public"."scraper_workflow_steps" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: runner_api_keys Service role has full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role has full access" ON "public"."runner_api_keys" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: scraper_runners Service role has full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role has full access" ON "public"."scraper_runners" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: user_api_keys Service role has full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role has full access" ON "public"."user_api_keys" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: pipeline_audit_log Service role insert audit log; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role insert audit log" ON "public"."pipeline_audit_log" FOR INSERT WITH CHECK (true);


--
-- Name: image_retry_queue Service role insert image retry queue; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role insert image retry queue" ON "public"."image_retry_queue" FOR INSERT WITH CHECK (true);


--
-- Name: image_retry_queue Service role update image retry queue; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role update image retry queue" ON "public"."image_retry_queue" FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: pipeline_retry_queue Service role update retry queue; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role update retry queue" ON "public"."pipeline_retry_queue" FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: enrichment_attempts Staff can manage enrichment attempts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can manage enrichment attempts" ON "public"."enrichment_attempts" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());


--
-- Name: enrichment_jobs Staff can manage enrichment jobs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can manage enrichment jobs" ON "public"."enrichment_jobs" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());


--
-- Name: enrichment_targets Staff can manage enrichment targets; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can manage enrichment targets" ON "public"."enrichment_targets" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());


--
-- Name: external_sources Staff can manage external sources; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can manage external sources" ON "public"."external_sources" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: integration_sync_runs Staff can manage integration sync runs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can manage integration sync runs" ON "public"."integration_sync_runs" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: order_events Staff can manage order events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can manage order events" ON "public"."order_events" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: order_source_records Staff can manage order source records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can manage order source records" ON "public"."order_source_records" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: inventory_reconciliation_items Staff can manage reconciliation items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can manage reconciliation items" ON "public"."inventory_reconciliation_items" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: shopsite_product_sync Staff can manage shopsite product sync; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can manage shopsite product sync" ON "public"."shopsite_product_sync" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scraper_config_versions Staff can read all versions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can read all versions" ON "public"."scraper_config_versions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: orders Staff can update orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can update orders" ON "public"."orders" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: scraper_configs Staff can update scraper config metadata; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can update scraper config metadata" ON "public"."scraper_configs" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: order_items Staff can view all order items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can view all order items" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: orders Staff can view all orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can view all orders" ON "public"."orders" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: user_pets Staff can view all pets; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can view all pets" ON "public"."user_pets" FOR SELECT USING ("public"."is_staff"());


--
-- Name: external_sources Staff can view external sources; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can view external sources" ON "public"."external_sources" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: integration_sync_runs Staff can view integration sync runs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can view integration sync runs" ON "public"."integration_sync_runs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: order_events Staff can view order events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can view order events" ON "public"."order_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: order_source_records Staff can view order source records; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can view order source records" ON "public"."order_source_records" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: order_payments Staff can view payments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can view payments" ON "public"."order_payments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: inventory_reconciliation_items Staff can view reconciliation items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can view reconciliation items" ON "public"."inventory_reconciliation_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: shopsite_product_sync Staff can view shopsite product sync; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff can view shopsite product sync" ON "public"."shopsite_product_sync" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: consolidation_review_requests Staff read consolidation review requests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff read consolidation review requests" ON "public"."consolidation_review_requests" FOR SELECT USING ("public"."is_staff"());


--
-- Name: consolidation_review_requests Staff write consolidation review requests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Staff write consolidation review requests" ON "public"."consolidation_review_requests" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());


--
-- Name: order_payments System can insert payments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "System can insert payments" ON "public"."order_payments" FOR INSERT WITH CHECK (true);


--
-- Name: promo_redemptions System can insert redemptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "System can insert redemptions" ON "public"."promo_redemptions" FOR INSERT WITH CHECK (true);


--
-- Name: subscription_items Users can add items to their subscriptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can add items to their subscriptions" ON "public"."subscription_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."subscriptions"
  WHERE (("subscriptions"."id" = "subscription_items"."subscription_id") AND ("subscriptions"."user_id" = "auth"."uid"())))));


--
-- Name: recently_viewed Users can add to their history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can add to their history" ON "public"."recently_viewed" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: review_helpful_votes Users can change their vote; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can change their vote" ON "public"."review_helpful_votes" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: subscriptions Users can create their own subscriptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create their own subscriptions" ON "public"."subscriptions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: scraper_config_versions Users can delete draft versions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete draft versions" ON "public"."scraper_config_versions" FOR DELETE TO "authenticated" USING ((("status")::"text" = 'draft'::"text"));


--
-- Name: subscription_items Users can delete items from their subscriptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete items from their subscriptions" ON "public"."subscription_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."subscriptions"
  WHERE (("subscriptions"."id" = "subscription_items"."subscription_id") AND ("subscriptions"."user_id" = "auth"."uid"())))));


--
-- Name: addresses Users can delete own addresses; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete own addresses" ON "public"."addresses" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: user_pets Users can delete own pets; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete own pets" ON "public"."user_pets" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: product_reviews Users can delete own reviews; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete own reviews" ON "public"."product_reviews" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: wishlists Users can delete own wishlist; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete own wishlist" ON "public"."wishlists" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: recently_viewed Users can delete their history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their history" ON "public"."recently_viewed" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: subscriptions Users can delete their own subscriptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own subscriptions" ON "public"."subscriptions" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: subscription_suggestions Users can dismiss suggestions for their subscriptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can dismiss suggestions for their subscriptions" ON "public"."subscription_suggestions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."subscriptions"
  WHERE (("subscriptions"."id" = "subscription_suggestions"."subscription_id") AND ("subscriptions"."user_id" = "auth"."uid"())))));


--
-- Name: addresses Users can insert own addresses; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own addresses" ON "public"."addresses" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_pets Users can insert own pets; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own pets" ON "public"."user_pets" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));


--
-- Name: wishlists Users can insert own wishlist; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own wishlist" ON "public"."wishlists" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_api_keys Users can read their own keys; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can read their own keys" ON "public"."user_api_keys" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: review_helpful_votes Users can remove their vote; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can remove their vote" ON "public"."review_helpful_votes" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: scraper_config_versions Users can update draft versions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update draft versions" ON "public"."scraper_config_versions" FOR UPDATE TO "authenticated" USING ((("status")::"text" = 'draft'::"text")) WITH CHECK ((("status")::"text" = 'draft'::"text"));


--
-- Name: subscription_items Users can update items of their subscriptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update items of their subscriptions" ON "public"."subscription_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."subscriptions"
  WHERE (("subscriptions"."id" = "subscription_items"."subscription_id") AND ("subscriptions"."user_id" = "auth"."uid"())))));


--
-- Name: addresses Users can update own addresses; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own addresses" ON "public"."addresses" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: product_reviews Users can update own pending reviews; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own pending reviews" ON "public"."product_reviews" FOR UPDATE USING ((("auth"."uid"() = "user_id") AND ("status" = 'pending'::"text")));


--
-- Name: user_pets Users can update own pets; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own pets" ON "public"."user_pets" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));


--
-- Name: recently_viewed Users can update their history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their history" ON "public"."recently_viewed" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: subscriptions Users can update their own subscriptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own subscriptions" ON "public"."subscriptions" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: review_helpful_votes Users can view all votes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view all votes" ON "public"."review_helpful_votes" FOR SELECT USING (true);


--
-- Name: subscription_items Users can view items of their subscriptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view items of their subscriptions" ON "public"."subscription_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."subscriptions"
  WHERE (("subscriptions"."id" = "subscription_items"."subscription_id") AND ("subscriptions"."user_id" = "auth"."uid"())))));


--
-- Name: addresses Users can view own addresses; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own addresses" ON "public"."addresses" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: order_items Users can view own order items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own order items" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND ("orders"."user_id" = "auth"."uid"())))));


--
-- Name: orders Users can view own orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own orders" ON "public"."orders" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: user_pets Users can view own pets; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own pets" ON "public"."user_pets" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));


--
-- Name: product_questions Users can view own questions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own questions" ON "public"."product_questions" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: promo_redemptions Users can view own redemptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own redemptions" ON "public"."promo_redemptions" FOR SELECT USING (("user_id" = "auth"."uid"()));


--
-- Name: product_reviews Users can view own reviews; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own reviews" ON "public"."product_reviews" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: wishlists Users can view own wishlist; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own wishlist" ON "public"."wishlists" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: subscription_suggestions Users can view suggestions for their subscriptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view suggestions for their subscriptions" ON "public"."subscription_suggestions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."subscriptions"
  WHERE (("subscriptions"."id" = "subscription_suggestions"."subscription_id") AND ("subscriptions"."user_id" = "auth"."uid"())))));


--
-- Name: recently_viewed Users can view their own history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own history" ON "public"."recently_viewed" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: subscriptions Users can view their own subscriptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own subscriptions" ON "public"."subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: review_helpful_votes Users can vote on reviews; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can vote on reviews" ON "public"."review_helpful_votes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: users Users cannot update is_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users cannot update is_admin" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("is_admin" = ( SELECT "users_1"."is_admin"
   FROM "public"."users" "users_1"
  WHERE ("users_1"."id" = "auth"."uid"()))));


--
-- Name: addresses; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."addresses" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_provider_credentials; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_provider_credentials" ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: b2b_feeds; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."b2b_feeds" ENABLE ROW LEVEL SECURITY;

--
-- Name: b2b_sync_jobs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."b2b_sync_jobs" ENABLE ROW LEVEL SECURITY;

--
-- Name: batch_job_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."batch_job_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: batch_jobs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."batch_jobs" ENABLE ROW LEVEL SECURITY;

--
-- Name: brand_scraper_affinity; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."brand_scraper_affinity" ENABLE ROW LEVEL SECURITY;

--
-- Name: brand_scraper_mappings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."brand_scraper_mappings" ENABLE ROW LEVEL SECURITY;

--
-- Name: brands; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."brands" ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;

--
-- Name: cohort_batches; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."cohort_batches" ENABLE ROW LEVEL SECURITY;

--
-- Name: cohort_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."cohort_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: consolidation_review_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."consolidation_review_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: email_subscribers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."email_subscribers" ENABLE ROW LEVEL SECURITY;

--
-- Name: enrichment_attempts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."enrichment_attempts" ENABLE ROW LEVEL SECURITY;

--
-- Name: enrichment_job_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."enrichment_job_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: enrichment_jobs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."enrichment_jobs" ENABLE ROW LEVEL SECURITY;

--
-- Name: enrichment_targets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."enrichment_targets" ENABLE ROW LEVEL SECURITY;

--
-- Name: external_sources; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."external_sources" ENABLE ROW LEVEL SECURITY;

--
-- Name: facet_definitions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."facet_definitions" ENABLE ROW LEVEL SECURITY;

--
-- Name: facet_values; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."facet_values" ENABLE ROW LEVEL SECURITY;

--
-- Name: image_retry_queue; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."image_retry_queue" ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_sync_runs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."integration_sync_runs" ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."inventory_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_reconciliation_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."inventory_reconciliation_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: legacy_redirects; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."legacy_redirects" ENABLE ROW LEVEL SECURITY;

--
-- Name: llm_parallel_runs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."llm_parallel_runs" ENABLE ROW LEVEL SECURITY;

--
-- Name: migration_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."migration_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: official_brand_url_candidates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."official_brand_url_candidates" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."order_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."order_payments" ENABLE ROW LEVEL SECURITY;

--
-- Name: order_source_records; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."order_source_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: orders_ingestion; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."orders_ingestion" ENABLE ROW LEVEL SECURITY;

--
-- Name: pages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pages" ENABLE ROW LEVEL SECURITY;

--
-- Name: pet_types; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pet_types" ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pipeline_audit_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_retry_queue; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pipeline_retry_queue" ENABLE ROW LEVEL SECURITY;

--
-- Name: preorder_batches; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."preorder_batches" ENABLE ROW LEVEL SECURITY;

--
-- Name: preorder_groups; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."preorder_groups" ENABLE ROW LEVEL SECURITY;

--
-- Name: price_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."price_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_answers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_answers" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_attributes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_attributes" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_categories; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_categories" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_facets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_facets" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_group_products; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_group_products" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_groups; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_groups" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_images; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_images" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_option_values; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_option_values" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_options; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_options" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_pet_types; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_pet_types" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_preorder_groups; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_preorder_groups" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_questions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_questions" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_reviews; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_reviews" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_scraped_sites; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_scraped_sites" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_storefront_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_storefront_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_tags; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_tags" ENABLE ROW LEVEL SECURITY;

--
-- Name: product_variants; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."product_variants" ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;

--
-- Name: products_ingestion; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."products_ingestion" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_codes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."promo_codes" ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_redemptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."promo_redemptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: recently_viewed; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."recently_viewed" ENABLE ROW LEVEL SECURITY;

--
-- Name: related_products; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."related_products" ENABLE ROW LEVEL SECURITY;

--
-- Name: review_helpful_votes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."review_helpful_votes" ENABLE ROW LEVEL SECURITY;

--
-- Name: runner_api_keys; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."runner_api_keys" ENABLE ROW LEVEL SECURITY;

--
-- Name: scrape_results; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scrape_results" ENABLE ROW LEVEL SECURITY;

--
-- Name: scraper_config_test_skus; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scraper_config_test_skus" ENABLE ROW LEVEL SECURITY;

--
-- Name: scraper_config_versions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scraper_config_versions" ENABLE ROW LEVEL SECURITY;

--
-- Name: scraper_configs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scraper_configs" ENABLE ROW LEVEL SECURITY;

--
-- Name: scraper_credentials; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scraper_credentials" ENABLE ROW LEVEL SECURITY;

--
-- Name: scraper_health_metrics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scraper_health_metrics" ENABLE ROW LEVEL SECURITY;

--
-- Name: scraper_runners; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scraper_runners" ENABLE ROW LEVEL SECURITY;

--
-- Name: scraper_selectors; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scraper_selectors" ENABLE ROW LEVEL SECURITY;

--
-- Name: scraper_workflow_steps; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scraper_workflow_steps" ENABLE ROW LEVEL SECURITY;

--
-- Name: service_costs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."service_costs" ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_webhook_events service_role_manage_stripe_webhook_events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "service_role_manage_stripe_webhook_events" ON "public"."stripe_webhook_events" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;

--
-- Name: shopsite_product_sync; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."shopsite_product_sync" ENABLE ROW LEVEL SECURITY;

--
-- Name: site_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."site_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_webhook_events staff_read_stripe_webhook_events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "staff_read_stripe_webhook_events" ON "public"."stripe_webhook_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));


--
-- Name: stripe_webhook_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."stripe_webhook_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."subscription_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_suggestions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."subscription_suggestions" ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_api_keys; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_api_keys" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_pets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_pets" ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

--
-- Name: wishlists; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."wishlists" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "admin_migrate_data"("target_user_id" "uuid", "user_email" "text", "profile_data" "jsonb", "work_data" "jsonb", "edu_data" "jsonb", "project_data" "jsonb", "skill_data" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."admin_migrate_data"("target_user_id" "uuid", "user_email" "text", "profile_data" "jsonb", "work_data" "jsonb", "edu_data" "jsonb", "project_data" "jsonb", "skill_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_migrate_data"("target_user_id" "uuid", "user_email" "text", "profile_data" "jsonb", "work_data" "jsonb", "edu_data" "jsonb", "project_data" "jsonb", "skill_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_migrate_data"("target_user_id" "uuid", "user_email" "text", "profile_data" "jsonb", "work_data" "jsonb", "edu_data" "jsonb", "project_data" "jsonb", "skill_data" "jsonb") TO "service_role";


--
-- Name: FUNCTION "calculate_scraper_health"("p_scraper_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."calculate_scraper_health"("p_scraper_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_scraper_health"("p_scraper_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_scraper_health"("p_scraper_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "claim_next_pending_enrichment_attempt"("p_runner_name" "text", "p_claim_duration_minutes" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."claim_next_pending_enrichment_attempt"("p_runner_name" "text", "p_claim_duration_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_next_pending_enrichment_attempt"("p_runner_name" "text", "p_claim_duration_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_next_pending_enrichment_attempt"("p_runner_name" "text", "p_claim_duration_minutes" integer) TO "service_role";


--
-- Name: FUNCTION "ensure_product_storefront_settings_row"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."ensure_product_storefront_settings_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_product_storefront_settings_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_product_storefront_settings_row"() TO "service_role";


--
-- Name: FUNCTION "exec_sql"("query" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."exec_sql"("query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."exec_sql"("query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."exec_sql"("query" "text") TO "service_role";


--
-- Name: FUNCTION "generate_order_number"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_order_number"() TO "service_role";


--
-- Name: FUNCTION "generate_subscription_suggestions"("p_subscription_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."generate_subscription_suggestions"("p_subscription_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_subscription_suggestions"("p_subscription_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_subscription_suggestions"("p_subscription_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_action_required_items"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_action_required_items"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_action_required_items"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_action_required_items"() TO "service_role";


--
-- Name: FUNCTION "get_ai_cost_stats"("p_start_date" "date", "p_end_date" "date"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_ai_cost_stats"("p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_ai_cost_stats"("p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_ai_cost_stats"("p_start_date" "date", "p_end_date" "date") TO "service_role";


--
-- Name: FUNCTION "get_dashboard_recent_activity"("limit_count" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_dashboard_recent_activity"("limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_recent_activity"("limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_recent_activity"("limit_count" integer) TO "service_role";


--
-- Name: FUNCTION "get_inventory_drift"("p_days" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_inventory_drift"("p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_inventory_drift"("p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inventory_drift"("p_days" integer) TO "service_role";


--
-- Name: FUNCTION "get_job_retry_history"("p_job_type" "text", "p_job_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_job_retry_history"("p_job_type" "text", "p_job_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_job_retry_history"("p_job_type" "text", "p_job_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_job_retry_history"("p_job_type" "text", "p_job_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_next_version_number"("p_config_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_next_version_number"("p_config_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_version_number"("p_config_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_version_number"("p_config_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_pending_image_retries"("p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_pending_image_retries"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_pending_image_retries"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pending_image_retries"("p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "get_pending_retries"("p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_pending_retries"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_pending_retries"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pending_retries"("p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "get_personalized_products"("user_uuid" "uuid", "result_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_personalized_products"("user_uuid" "uuid", "result_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_personalized_products"("user_uuid" "uuid", "result_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_personalized_products"("user_uuid" "uuid", "result_limit" integer) TO "service_role";


--
-- Name: FUNCTION "get_pipeline_stage_sources"("p_stage_status" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_pipeline_stage_sources"("p_stage_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_pipeline_stage_sources"("p_stage_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pipeline_stage_sources"("p_stage_status" "text") TO "service_role";


--
-- Name: FUNCTION "get_pipeline_status_counts"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_pipeline_status_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_pipeline_status_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pipeline_status_counts"() TO "service_role";


--
-- Name: FUNCTION "get_product_image_retry_history"("p_sku" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_product_image_retry_history"("p_sku" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_product_image_retry_history"("p_sku" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_product_image_retry_history"("p_sku" "text") TO "service_role";


--
-- Name: FUNCTION "get_products_for_pet_types"("pet_type_ids" "uuid"[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_products_for_pet_types"("pet_type_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_products_for_pet_types"("pet_type_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_products_for_pet_types"("pet_type_ids" "uuid"[]) TO "service_role";


--
-- Name: FUNCTION "get_sales_metrics"("start_date" timestamp without time zone, "end_date" timestamp without time zone, "p_source" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_sales_metrics"("start_date" timestamp without time zone, "end_date" timestamp without time zone, "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_sales_metrics"("start_date" timestamp without time zone, "end_date" timestamp without time zone, "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_sales_metrics"("start_date" timestamp without time zone, "end_date" timestamp without time zone, "p_source" "text") TO "service_role";


--
-- Name: FUNCTION "get_sales_trends"("start_date" timestamp without time zone, "end_date" timestamp without time zone, "period" "text", "p_source" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_sales_trends"("start_date" timestamp without time zone, "end_date" timestamp without time zone, "period" "text", "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_sales_trends"("start_date" timestamp without time zone, "end_date" timestamp without time zone, "period" "text", "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_sales_trends"("start_date" timestamp without time zone, "end_date" timestamp without time zone, "period" "text", "p_source" "text") TO "service_role";


--
-- Name: FUNCTION "get_store_analytics"("start_date" timestamp with time zone, "end_date" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_store_analytics"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_store_analytics"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_store_analytics"("start_date" timestamp with time zone, "end_date" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_sync_health"("p_days" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_sync_health"("p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_sync_health"("p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_sync_health"("p_days" integer) TO "service_role";


--
-- Name: FUNCTION "handle_default_address"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."handle_default_address"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_default_address"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_default_address"() TO "service_role";


--
-- Name: FUNCTION "handle_new_user"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


--
-- Name: FUNCTION "insert_scraper_test_run"("p_scraper_id" "uuid", "p_test_type" "text", "p_skus_tested" "text"[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."insert_scraper_test_run"("p_scraper_id" "uuid", "p_test_type" "text", "p_skus_tested" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."insert_scraper_test_run"("p_scraper_id" "uuid", "p_test_type" "text", "p_skus_tested" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_scraper_test_run"("p_scraper_id" "uuid", "p_test_type" "text", "p_skus_tested" "text"[]) TO "service_role";


--
-- Name: FUNCTION "is_admin"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";


--
-- Name: FUNCTION "is_source_enabled"("p_sku" "text", "p_source_id" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_source_enabled"("p_sku" "text", "p_source_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_source_enabled"("p_sku" "text", "p_source_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_source_enabled"("p_sku" "text", "p_source_id" "text") TO "service_role";


--
-- Name: FUNCTION "is_staff"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_staff"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "service_role";


--
-- Name: FUNCTION "mark_first_order_complete"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."mark_first_order_complete"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_first_order_complete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_first_order_complete"() TO "service_role";


--
-- Name: FUNCTION "merge_enrichment_attempt_result"("p_sku" "text", "p_job_id" "uuid", "p_attempt_id" "uuid", "p_status" "text", "p_confidence" numeric, "p_source_url" "text", "p_source_data" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."merge_enrichment_attempt_result"("p_sku" "text", "p_job_id" "uuid", "p_attempt_id" "uuid", "p_status" "text", "p_confidence" numeric, "p_source_url" "text", "p_source_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."merge_enrichment_attempt_result"("p_sku" "text", "p_job_id" "uuid", "p_attempt_id" "uuid", "p_status" "text", "p_confidence" numeric, "p_source_url" "text", "p_source_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_enrichment_attempt_result"("p_sku" "text", "p_job_id" "uuid", "p_attempt_id" "uuid", "p_status" "text", "p_confidence" numeric, "p_source_url" "text", "p_source_data" "jsonb") TO "service_role";


--
-- Name: FUNCTION "record_product_price_change"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."record_product_price_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_product_price_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_product_price_change"() TO "service_role";


--
-- Name: FUNCTION "record_variant_price_change"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."record_variant_price_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."record_variant_price_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_variant_price_change"() TO "service_role";


--
-- Name: FUNCTION "set_order_source_type"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_order_source_type"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_order_source_type"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_order_source_type"() TO "service_role";


--
-- Name: FUNCTION "sync_inventory_to_products"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."sync_inventory_to_products"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_inventory_to_products"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_inventory_to_products"() TO "service_role";


--
-- Name: FUNCTION "update_b2b_feeds_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_b2b_feeds_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_b2b_feeds_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_b2b_feeds_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_batch_jobs_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_batch_jobs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_batch_jobs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_batch_jobs_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_brand_scraper_affinity_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_brand_scraper_affinity_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_brand_scraper_affinity_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_brand_scraper_affinity_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_brand_scraper_mappings_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_brand_scraper_mappings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_brand_scraper_mappings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_brand_scraper_mappings_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_brand_sources_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_brand_sources_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_brand_sources_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_brand_sources_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_cohort_batches_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_cohort_batches_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_cohort_batches_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_cohort_batches_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_enrichment_job_counters"("p_job_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_enrichment_job_counters"("p_job_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_enrichment_job_counters"("p_job_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_enrichment_job_counters"("p_job_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "update_enrichment_tables_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_enrichment_tables_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_enrichment_tables_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_enrichment_tables_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_health_metrics"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_health_metrics"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_health_metrics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_health_metrics"() TO "service_role";


--
-- Name: FUNCTION "update_health_metrics_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_health_metrics_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_health_metrics_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_health_metrics_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_image_retry_queue_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_image_retry_queue_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_image_retry_queue_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_image_retry_queue_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_inventory_items_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_inventory_items_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_inventory_items_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_inventory_items_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_llm_parallel_runs_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_llm_parallel_runs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_llm_parallel_runs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_llm_parallel_runs_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_pipeline_retry_queue_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_pipeline_retry_queue_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_pipeline_retry_queue_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_pipeline_retry_queue_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_product_groups_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_product_groups_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_product_groups_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_product_groups_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_product_scraped_sites_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_product_scraped_sites_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_product_scraped_sites_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_product_scraped_sites_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_promo_code_usage"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_promo_code_usage"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_promo_code_usage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_promo_code_usage"() TO "service_role";


--
-- Name: FUNCTION "update_review_helpful_count"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_review_helpful_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_review_helpful_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_review_helpful_count"() TO "service_role";


--
-- Name: FUNCTION "update_scraper_configs_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_scraper_configs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_scraper_configs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_scraper_configs_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_scraper_test_run"("p_id" "uuid", "p_status" "text", "p_results" "jsonb", "p_error_message" "text", "p_duration_ms" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_scraper_test_run"("p_id" "uuid", "p_status" "text", "p_results" "jsonb", "p_error_message" "text", "p_duration_ms" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_scraper_test_run"("p_id" "uuid", "p_status" "text", "p_results" "jsonb", "p_error_message" "text", "p_duration_ms" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_scraper_test_run"("p_id" "uuid", "p_status" "text", "p_results" "jsonb", "p_error_message" "text", "p_duration_ms" integer) TO "service_role";


--
-- Name: FUNCTION "update_service_costs_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_service_costs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_service_costs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_service_costs_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_updated_at_column"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


--
-- Name: FUNCTION "update_user_pets_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_user_pets_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_pets_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_pets_updated_at"() TO "service_role";


--
-- Name: FUNCTION "upsert_recently_viewed"("p_user_id" "uuid", "p_product_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."upsert_recently_viewed"("p_user_id" "uuid", "p_product_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_recently_viewed"("p_user_id" "uuid", "p_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_recently_viewed"("p_user_id" "uuid", "p_product_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "validate_ai_config"("config" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."validate_ai_config"("config" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_ai_config"("config" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_ai_config"("config" "jsonb") TO "service_role";


--
-- Name: FUNCTION "validate_runner_api_key"("api_key" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."validate_runner_api_key"("api_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_runner_api_key"("api_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_runner_api_key"("api_key" "text") TO "service_role";


--
-- Name: FUNCTION "validate_user_api_key"("api_key" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."validate_user_api_key"("api_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_user_api_key"("api_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_user_api_key"("api_key" "text") TO "service_role";


--
-- Name: TABLE "addresses"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."addresses" TO "anon";
GRANT ALL ON TABLE "public"."addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."addresses" TO "service_role";


--
-- Name: TABLE "admin_orders_list"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."admin_orders_list" TO "anon";
GRANT ALL ON TABLE "public"."admin_orders_list" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_orders_list" TO "service_role";


--
-- Name: TABLE "ai_provider_credentials"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ai_provider_credentials" TO "anon";
GRANT ALL ON TABLE "public"."ai_provider_credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_provider_credentials" TO "service_role";


--
-- Name: TABLE "scraper_config_versions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."scraper_config_versions" TO "anon";
GRANT ALL ON TABLE "public"."scraper_config_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."scraper_config_versions" TO "service_role";


--
-- Name: TABLE "scraper_configs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."scraper_configs" TO "anon";
GRANT ALL ON TABLE "public"."scraper_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."scraper_configs" TO "service_role";


--
-- Name: TABLE "ai_scraper_stats"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ai_scraper_stats" TO "anon";
GRANT ALL ON TABLE "public"."ai_scraper_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_scraper_stats" TO "service_role";


--
-- Name: TABLE "app_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";


--
-- Name: TABLE "b2b_feeds"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."b2b_feeds" TO "anon";
GRANT ALL ON TABLE "public"."b2b_feeds" TO "authenticated";
GRANT ALL ON TABLE "public"."b2b_feeds" TO "service_role";


--
-- Name: TABLE "b2b_sync_jobs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."b2b_sync_jobs" TO "anon";
GRANT ALL ON TABLE "public"."b2b_sync_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."b2b_sync_jobs" TO "service_role";


--
-- Name: TABLE "batch_job_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."batch_job_items" TO "anon";
GRANT ALL ON TABLE "public"."batch_job_items" TO "authenticated";
GRANT ALL ON TABLE "public"."batch_job_items" TO "service_role";


--
-- Name: TABLE "batch_jobs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."batch_jobs" TO "anon";
GRANT ALL ON TABLE "public"."batch_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."batch_jobs" TO "service_role";


--
-- Name: TABLE "brand_scraper_affinity"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."brand_scraper_affinity" TO "anon";
GRANT ALL ON TABLE "public"."brand_scraper_affinity" TO "authenticated";
GRANT ALL ON TABLE "public"."brand_scraper_affinity" TO "service_role";


--
-- Name: TABLE "brand_scraper_mappings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."brand_scraper_mappings" TO "anon";
GRANT ALL ON TABLE "public"."brand_scraper_mappings" TO "authenticated";
GRANT ALL ON TABLE "public"."brand_scraper_mappings" TO "service_role";


--
-- Name: TABLE "brand_sources"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."brand_sources" TO "anon";
GRANT ALL ON TABLE "public"."brand_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."brand_sources" TO "service_role";


--
-- Name: TABLE "brands"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."brands" TO "anon";
GRANT ALL ON TABLE "public"."brands" TO "authenticated";
GRANT ALL ON TABLE "public"."brands" TO "service_role";


--
-- Name: TABLE "categories"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";


--
-- Name: TABLE "cohort_batches"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cohort_batches" TO "anon";
GRANT ALL ON TABLE "public"."cohort_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."cohort_batches" TO "service_role";


--
-- Name: TABLE "cohort_members"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cohort_members" TO "anon";
GRANT ALL ON TABLE "public"."cohort_members" TO "authenticated";
GRANT ALL ON TABLE "public"."cohort_members" TO "service_role";


--
-- Name: TABLE "consolidation_review_requests"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."consolidation_review_requests" TO "anon";
GRANT ALL ON TABLE "public"."consolidation_review_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."consolidation_review_requests" TO "service_role";


--
-- Name: TABLE "inventory_reconciliation_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."inventory_reconciliation_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_reconciliation_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_reconciliation_items" TO "service_role";


--
-- Name: TABLE "dashboard_inventory_reconciliation_stats"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."dashboard_inventory_reconciliation_stats" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_inventory_reconciliation_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_inventory_reconciliation_stats" TO "service_role";


--
-- Name: TABLE "orders"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";


--
-- Name: TABLE "dashboard_migration_progress"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."dashboard_migration_progress" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_migration_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_migration_progress" TO "service_role";


--
-- Name: TABLE "dashboard_order_stats"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."dashboard_order_stats" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_order_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_order_stats" TO "service_role";


--
-- Name: TABLE "products"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";


--
-- Name: TABLE "dashboard_product_stats"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."dashboard_product_stats" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_product_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_product_stats" TO "service_role";


--
-- Name: TABLE "enrichment_jobs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."enrichment_jobs" TO "anon";
GRANT ALL ON TABLE "public"."enrichment_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."enrichment_jobs" TO "service_role";


--
-- Name: TABLE "dashboard_scraper_stats"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."dashboard_scraper_stats" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_scraper_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_scraper_stats" TO "service_role";


--
-- Name: TABLE "email_subscribers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."email_subscribers" TO "anon";
GRANT ALL ON TABLE "public"."email_subscribers" TO "authenticated";
GRANT ALL ON TABLE "public"."email_subscribers" TO "service_role";


--
-- Name: TABLE "enrichment_attempts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."enrichment_attempts" TO "anon";
GRANT ALL ON TABLE "public"."enrichment_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."enrichment_attempts" TO "service_role";


--
-- Name: TABLE "enrichment_job_logs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."enrichment_job_logs" TO "anon";
GRANT ALL ON TABLE "public"."enrichment_job_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."enrichment_job_logs" TO "service_role";


--
-- Name: TABLE "enrichment_targets"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."enrichment_targets" TO "anon";
GRANT ALL ON TABLE "public"."enrichment_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."enrichment_targets" TO "service_role";


--
-- Name: TABLE "external_sources"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."external_sources" TO "anon";
GRANT ALL ON TABLE "public"."external_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."external_sources" TO "service_role";


--
-- Name: TABLE "facet_definitions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."facet_definitions" TO "anon";
GRANT ALL ON TABLE "public"."facet_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."facet_definitions" TO "service_role";


--
-- Name: TABLE "facet_values"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."facet_values" TO "anon";
GRANT ALL ON TABLE "public"."facet_values" TO "authenticated";
GRANT ALL ON TABLE "public"."facet_values" TO "service_role";


--
-- Name: TABLE "image_retry_queue"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."image_retry_queue" TO "anon";
GRANT ALL ON TABLE "public"."image_retry_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."image_retry_queue" TO "service_role";


--
-- Name: TABLE "integration_sync_runs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."integration_sync_runs" TO "anon";
GRANT ALL ON TABLE "public"."integration_sync_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."integration_sync_runs" TO "service_role";


--
-- Name: TABLE "inventory_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";


--
-- Name: TABLE "legacy_redirects"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."legacy_redirects" TO "anon";
GRANT ALL ON TABLE "public"."legacy_redirects" TO "authenticated";
GRANT ALL ON TABLE "public"."legacy_redirects" TO "service_role";


--
-- Name: TABLE "llm_parallel_runs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."llm_parallel_runs" TO "anon";
GRANT ALL ON TABLE "public"."llm_parallel_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."llm_parallel_runs" TO "service_role";


--
-- Name: TABLE "migration_log"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."migration_log" TO "anon";
GRANT ALL ON TABLE "public"."migration_log" TO "authenticated";
GRANT ALL ON TABLE "public"."migration_log" TO "service_role";


--
-- Name: TABLE "official_brand_url_candidates"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."official_brand_url_candidates" TO "anon";
GRANT ALL ON TABLE "public"."official_brand_url_candidates" TO "authenticated";
GRANT ALL ON TABLE "public"."official_brand_url_candidates" TO "service_role";


--
-- Name: TABLE "order_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."order_events" TO "anon";
GRANT ALL ON TABLE "public"."order_events" TO "authenticated";
GRANT ALL ON TABLE "public"."order_events" TO "service_role";


--
-- Name: TABLE "order_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";


--
-- Name: TABLE "order_payments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."order_payments" TO "anon";
GRANT ALL ON TABLE "public"."order_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."order_payments" TO "service_role";


--
-- Name: TABLE "order_source_records"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."order_source_records" TO "anon";
GRANT ALL ON TABLE "public"."order_source_records" TO "authenticated";
GRANT ALL ON TABLE "public"."order_source_records" TO "service_role";


--
-- Name: TABLE "orders_ingestion"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."orders_ingestion" TO "anon";
GRANT ALL ON TABLE "public"."orders_ingestion" TO "authenticated";
GRANT ALL ON TABLE "public"."orders_ingestion" TO "service_role";


--
-- Name: TABLE "pages"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pages" TO "anon";
GRANT ALL ON TABLE "public"."pages" TO "authenticated";
GRANT ALL ON TABLE "public"."pages" TO "service_role";


--
-- Name: TABLE "pet_types"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pet_types" TO "anon";
GRANT ALL ON TABLE "public"."pet_types" TO "authenticated";
GRANT ALL ON TABLE "public"."pet_types" TO "service_role";


--
-- Name: TABLE "pipeline_audit_log"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pipeline_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_audit_log" TO "service_role";


--
-- Name: TABLE "products_ingestion"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."products_ingestion" TO "anon";
GRANT ALL ON TABLE "public"."products_ingestion" TO "authenticated";
GRANT ALL ON TABLE "public"."products_ingestion" TO "service_role";


--
-- Name: TABLE "pipeline_export_queue"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pipeline_export_queue" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_export_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_export_queue" TO "service_role";


--
-- Name: TABLE "pipeline_finalizing_queue"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pipeline_finalizing_queue" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_finalizing_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_finalizing_queue" TO "service_role";


--
-- Name: TABLE "pipeline_finalized_review"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pipeline_finalized_review" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_finalized_review" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_finalized_review" TO "service_role";


--
-- Name: TABLE "pipeline_retry_queue"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pipeline_retry_queue" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_retry_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_retry_queue" TO "service_role";


--
-- Name: TABLE "preorder_batches"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."preorder_batches" TO "anon";
GRANT ALL ON TABLE "public"."preorder_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."preorder_batches" TO "service_role";


--
-- Name: TABLE "preorder_groups"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."preorder_groups" TO "anon";
GRANT ALL ON TABLE "public"."preorder_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."preorder_groups" TO "service_role";


--
-- Name: TABLE "price_history"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."price_history" TO "anon";
GRANT ALL ON TABLE "public"."price_history" TO "authenticated";
GRANT ALL ON TABLE "public"."price_history" TO "service_role";


--
-- Name: TABLE "product_answers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_answers" TO "anon";
GRANT ALL ON TABLE "public"."product_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."product_answers" TO "service_role";


--
-- Name: TABLE "product_attributes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_attributes" TO "anon";
GRANT ALL ON TABLE "public"."product_attributes" TO "authenticated";
GRANT ALL ON TABLE "public"."product_attributes" TO "service_role";


--
-- Name: TABLE "product_categories"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_categories" TO "anon";
GRANT ALL ON TABLE "public"."product_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."product_categories" TO "service_role";


--
-- Name: TABLE "product_facets"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_facets" TO "anon";
GRANT ALL ON TABLE "public"."product_facets" TO "authenticated";
GRANT ALL ON TABLE "public"."product_facets" TO "service_role";


--
-- Name: TABLE "product_group_products"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_group_products" TO "anon";
GRANT ALL ON TABLE "public"."product_group_products" TO "authenticated";
GRANT ALL ON TABLE "public"."product_group_products" TO "service_role";


--
-- Name: TABLE "product_groups"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_groups" TO "anon";
GRANT ALL ON TABLE "public"."product_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."product_groups" TO "service_role";


--
-- Name: TABLE "product_images"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_images" TO "anon";
GRANT ALL ON TABLE "public"."product_images" TO "authenticated";
GRANT ALL ON TABLE "public"."product_images" TO "service_role";


--
-- Name: TABLE "product_option_values"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_option_values" TO "anon";
GRANT ALL ON TABLE "public"."product_option_values" TO "authenticated";
GRANT ALL ON TABLE "public"."product_option_values" TO "service_role";


--
-- Name: TABLE "product_options"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_options" TO "anon";
GRANT ALL ON TABLE "public"."product_options" TO "authenticated";
GRANT ALL ON TABLE "public"."product_options" TO "service_role";


--
-- Name: TABLE "product_pet_types"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_pet_types" TO "anon";
GRANT ALL ON TABLE "public"."product_pet_types" TO "authenticated";
GRANT ALL ON TABLE "public"."product_pet_types" TO "service_role";


--
-- Name: TABLE "product_preorder_groups"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_preorder_groups" TO "anon";
GRANT ALL ON TABLE "public"."product_preorder_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."product_preorder_groups" TO "service_role";


--
-- Name: TABLE "product_questions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_questions" TO "anon";
GRANT ALL ON TABLE "public"."product_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."product_questions" TO "service_role";


--
-- Name: TABLE "product_reviews"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_reviews" TO "anon";
GRANT ALL ON TABLE "public"."product_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."product_reviews" TO "service_role";


--
-- Name: TABLE "product_scraped_sites"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_scraped_sites" TO "anon";
GRANT ALL ON TABLE "public"."product_scraped_sites" TO "authenticated";
GRANT ALL ON TABLE "public"."product_scraped_sites" TO "service_role";


--
-- Name: TABLE "product_storefront_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_storefront_settings" TO "anon";
GRANT ALL ON TABLE "public"."product_storefront_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."product_storefront_settings" TO "service_role";


--
-- Name: TABLE "product_tags"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_tags" TO "anon";
GRANT ALL ON TABLE "public"."product_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."product_tags" TO "service_role";


--
-- Name: TABLE "product_types"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_types" TO "anon";
GRANT ALL ON TABLE "public"."product_types" TO "authenticated";
GRANT ALL ON TABLE "public"."product_types" TO "service_role";


--
-- Name: TABLE "product_variants"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."product_variants" TO "anon";
GRANT ALL ON TABLE "public"."product_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."product_variants" TO "service_role";


--
-- Name: TABLE "products_published"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."products_published" TO "anon";
GRANT ALL ON TABLE "public"."products_published" TO "authenticated";
GRANT ALL ON TABLE "public"."products_published" TO "service_role";


--
-- Name: TABLE "profiles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";


--
-- Name: TABLE "promo_codes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."promo_codes" TO "anon";
GRANT ALL ON TABLE "public"."promo_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."promo_codes" TO "service_role";


--
-- Name: TABLE "promo_redemptions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."promo_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."promo_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."promo_redemptions" TO "service_role";


--
-- Name: TABLE "recently_viewed"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."recently_viewed" TO "anon";
GRANT ALL ON TABLE "public"."recently_viewed" TO "authenticated";
GRANT ALL ON TABLE "public"."recently_viewed" TO "service_role";


--
-- Name: TABLE "related_products"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."related_products" TO "anon";
GRANT ALL ON TABLE "public"."related_products" TO "authenticated";
GRANT ALL ON TABLE "public"."related_products" TO "service_role";


--
-- Name: TABLE "review_helpful_votes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."review_helpful_votes" TO "anon";
GRANT ALL ON TABLE "public"."review_helpful_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."review_helpful_votes" TO "service_role";


--
-- Name: TABLE "runner_api_keys"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."runner_api_keys" TO "anon";
GRANT ALL ON TABLE "public"."runner_api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."runner_api_keys" TO "service_role";


--
-- Name: TABLE "scrape_results"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."scrape_results" TO "anon";
GRANT ALL ON TABLE "public"."scrape_results" TO "authenticated";
GRANT ALL ON TABLE "public"."scrape_results" TO "service_role";


--
-- Name: TABLE "scraper_config_test_skus"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."scraper_config_test_skus" TO "anon";
GRANT ALL ON TABLE "public"."scraper_config_test_skus" TO "authenticated";
GRANT ALL ON TABLE "public"."scraper_config_test_skus" TO "service_role";


--
-- Name: TABLE "scraper_credentials"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."scraper_credentials" TO "anon";
GRANT ALL ON TABLE "public"."scraper_credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."scraper_credentials" TO "service_role";


--
-- Name: TABLE "scraper_health_metrics"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."scraper_health_metrics" TO "anon";
GRANT ALL ON TABLE "public"."scraper_health_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."scraper_health_metrics" TO "service_role";


--
-- Name: TABLE "scraper_runners"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."scraper_runners" TO "anon";
GRANT ALL ON TABLE "public"."scraper_runners" TO "authenticated";
GRANT ALL ON TABLE "public"."scraper_runners" TO "service_role";


--
-- Name: TABLE "scraper_selectors"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."scraper_selectors" TO "anon";
GRANT ALL ON TABLE "public"."scraper_selectors" TO "authenticated";
GRANT ALL ON TABLE "public"."scraper_selectors" TO "service_role";


--
-- Name: TABLE "scraper_workflow_steps"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."scraper_workflow_steps" TO "anon";
GRANT ALL ON TABLE "public"."scraper_workflow_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."scraper_workflow_steps" TO "service_role";


--
-- Name: TABLE "service_costs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."service_costs" TO "anon";
GRANT ALL ON TABLE "public"."service_costs" TO "authenticated";
GRANT ALL ON TABLE "public"."service_costs" TO "service_role";


--
-- Name: TABLE "services"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";


--
-- Name: TABLE "shopsite_product_sync"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."shopsite_product_sync" TO "anon";
GRANT ALL ON TABLE "public"."shopsite_product_sync" TO "authenticated";
GRANT ALL ON TABLE "public"."shopsite_product_sync" TO "service_role";


--
-- Name: TABLE "site_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."site_settings" TO "anon";
GRANT ALL ON TABLE "public"."site_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."site_settings" TO "service_role";


--
-- Name: TABLE "stripe_webhook_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "service_role";


--
-- Name: TABLE "subscription_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."subscription_items" TO "anon";
GRANT ALL ON TABLE "public"."subscription_items" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_items" TO "service_role";


--
-- Name: TABLE "subscription_suggestions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."subscription_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."subscription_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_suggestions" TO "service_role";


--
-- Name: TABLE "subscriptions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";


--
-- Name: TABLE "tags"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";


--
-- Name: TABLE "user_api_keys"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_api_keys" TO "anon";
GRANT ALL ON TABLE "public"."user_api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."user_api_keys" TO "service_role";


--
-- Name: TABLE "user_pets"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_pets" TO "anon";
GRANT ALL ON TABLE "public"."user_pets" TO "authenticated";
GRANT ALL ON TABLE "public"."user_pets" TO "service_role";


--
-- Name: TABLE "users"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";


--
-- Name: TABLE "wishlists"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."wishlists" TO "anon";
GRANT ALL ON TABLE "public"."wishlists" TO "authenticated";
GRANT ALL ON TABLE "public"."wishlists" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

-- \unrestrict oIpWE1Th8OjEF2BFlqlXq6sZSbvpyvvv1df80x0e0aXhQt2rR7QuuDJKDyqiJt1

