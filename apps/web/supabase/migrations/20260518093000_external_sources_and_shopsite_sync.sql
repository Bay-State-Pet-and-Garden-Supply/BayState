BEGIN;

-- ============================================================================
-- Canonical external source registry
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.external_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text NOT NULL UNIQUE,
    name text NOT NULL,
    source_type public.order_source_type NOT NULL,
    source_system text NOT NULL,
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT external_sources_source_type_source_system_key UNIQUE (source_type, source_system)
);

COMMENT ON TABLE public.external_sources IS
    'Canonical registry of upstream and legacy systems (ShopSite, Integra, web, manual imports).';

COMMENT ON COLUMN public.external_sources.key IS
    'Stable application key used by code and migrations.';

DROP TRIGGER IF EXISTS set_external_sources_updated_at ON public.external_sources;
CREATE TRIGGER set_external_sources_updated_at
    BEFORE UPDATE ON public.external_sources
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.external_sources (key, name, source_type, source_system, config)
VALUES
    ('shopsite', 'ShopSite', 'shopsite', 'shopsite_15', '{}'::jsonb),
    ('integra', 'Integra Register', 'integra', 'integra_register', '{}'::jsonb),
    ('web', 'Bay State Web Storefront', 'web', 'web_storefront', '{}'::jsonb),
    ('manual', 'Manual Admin Entry', 'manual', 'manual_admin', '{}'::jsonb),
    ('import', 'Generic Import', 'import', 'generic_import', '{}'::jsonb)
ON CONFLICT (key) DO UPDATE SET
    name = EXCLUDED.name,
    source_type = EXCLUDED.source_type,
    source_system = EXCLUDED.source_system,
    config = EXCLUDED.config,
    is_active = true;

ALTER TABLE public.external_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view external sources" ON public.external_sources;
CREATE POLICY "Staff can view external sources" ON public.external_sources
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

DROP POLICY IF EXISTS "Staff can manage external sources" ON public.external_sources;
CREATE POLICY "Staff can manage external sources" ON public.external_sources
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

DROP POLICY IF EXISTS "Service role can manage external sources" ON public.external_sources;
CREATE POLICY "Service role can manage external sources" ON public.external_sources
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON public.external_sources TO authenticated;
GRANT ALL ON public.external_sources TO service_role;

-- ============================================================================
-- integration_sync_runs now points at the canonical source registry
-- ============================================================================

ALTER TABLE public.integration_sync_runs
    ADD COLUMN IF NOT EXISTS external_source_id uuid REFERENCES public.external_sources(id);

CREATE INDEX IF NOT EXISTS idx_integration_sync_runs_external_source_id
    ON public.integration_sync_runs (external_source_id);

UPDATE public.integration_sync_runs AS runs
SET external_source_id = sources.id
FROM public.external_sources AS sources
WHERE runs.external_source_id IS NULL
  AND runs.source_type = sources.source_type
  AND runs.source_system = sources.source_system;

UPDATE public.integration_sync_runs AS runs
SET external_source_id = sources.id
FROM public.external_sources AS sources
WHERE runs.external_source_id IS NULL
  AND sources.key = CASE runs.source_type
      WHEN 'shopsite'::public.order_source_type THEN 'shopsite'
      WHEN 'integra'::public.order_source_type THEN 'integra'
      WHEN 'web'::public.order_source_type THEN 'web'
      WHEN 'manual'::public.order_source_type THEN 'manual'
      WHEN 'import'::public.order_source_type THEN 'import'
      ELSE NULL
  END;

-- ============================================================================
-- ShopSite sync metadata moves off products into its own table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.shopsite_product_sync (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    external_source_id uuid NOT NULL REFERENCES public.external_sources(id) ON DELETE CASCADE,
    sync_status text NOT NULL DEFAULT 'not_synced'
        CHECK (sync_status IN ('not_synced', 'pending', 'synced', 'failed')),
    last_synced_at timestamptz,
    last_uploaded_at timestamptz,
    last_sync_error text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT shopsite_product_sync_product_source_key UNIQUE (product_id, external_source_id)
);

COMMENT ON TABLE public.shopsite_product_sync IS
    'ShopSite synchronization state for canonical products. Replaces products.shopsite_* metadata.';

CREATE INDEX IF NOT EXISTS idx_shopsite_product_sync_status
    ON public.shopsite_product_sync (sync_status);

CREATE INDEX IF NOT EXISTS idx_shopsite_product_sync_last_synced_at
    ON public.shopsite_product_sync (last_synced_at DESC);

DROP TRIGGER IF EXISTS set_shopsite_product_sync_updated_at ON public.shopsite_product_sync;
CREATE TRIGGER set_shopsite_product_sync_updated_at
    BEFORE UPDATE ON public.shopsite_product_sync
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.shopsite_product_sync (
    product_id,
    external_source_id,
    sync_status,
    last_synced_at,
    last_sync_error,
    metadata
)
SELECT
    p.id,
    shopsite_source.id,
    COALESCE(p.shopsite_sync_status, 'not_synced'),
    p.shopsite_last_synced_at,
    p.shopsite_last_sync_error,
    jsonb_build_object('backfilled_from_products', true)
FROM public.products AS p
CROSS JOIN LATERAL (
    SELECT id
    FROM public.external_sources
    WHERE key = 'shopsite'
    LIMIT 1
) AS shopsite_source
ON CONFLICT (product_id, external_source_id) DO UPDATE SET
    sync_status = EXCLUDED.sync_status,
    last_synced_at = EXCLUDED.last_synced_at,
    last_sync_error = EXCLUDED.last_sync_error,
    metadata = public.shopsite_product_sync.metadata || EXCLUDED.metadata;

ALTER TABLE public.shopsite_product_sync ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view shopsite product sync" ON public.shopsite_product_sync;
CREATE POLICY "Staff can view shopsite product sync" ON public.shopsite_product_sync
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

DROP POLICY IF EXISTS "Staff can manage shopsite product sync" ON public.shopsite_product_sync;
CREATE POLICY "Staff can manage shopsite product sync" ON public.shopsite_product_sync
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

DROP POLICY IF EXISTS "Service role can manage shopsite product sync" ON public.shopsite_product_sync;
CREATE POLICY "Service role can manage shopsite product sync" ON public.shopsite_product_sync
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON public.shopsite_product_sync TO authenticated;
GRANT ALL ON public.shopsite_product_sync TO service_role;

-- ============================================================================
-- Sync health RPCs now prefer canonical sync runs, with legacy fallback
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_inventory_drift(p_days integer DEFAULT 7)
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

CREATE OR REPLACE FUNCTION public.get_sync_health(p_days integer DEFAULT 30)
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

GRANT EXECUTE ON FUNCTION public.get_inventory_drift(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sync_health(integer) TO authenticated;

COMMIT;
