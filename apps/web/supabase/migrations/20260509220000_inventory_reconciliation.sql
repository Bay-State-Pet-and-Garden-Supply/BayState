-- Migration: Inventory Reconciliation
-- Purpose: Persist Integra register reconciliation results as durable, queryable records.
-- PR 4

BEGIN;

-- ============================================================================
-- 1. CREATE ENUM TYPES
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE public.inventory_reconciliation_issue_type AS ENUM (
        'register_only',
        'website_only',
        'price_mismatch',
        'quantity_mismatch',
        'stock_status_mismatch',
        'duplicate_sku',
        'invalid_row'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.inventory_reconciliation_status AS ENUM (
        'open',
        'ignored',
        'resolved',
        'pushed_to_pipeline'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. CREATE RECONCILIATION ITEMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inventory_reconciliation_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    sync_run_id uuid NOT NULL REFERENCES public.integration_sync_runs(id) ON DELETE CASCADE,

    sku text NOT NULL,
    product_id uuid REFERENCES public.products(id),

    register_name text,
    website_name text,

    register_price numeric(10,2),
    website_price numeric(10,2),

    register_quantity numeric(10,2),
    website_quantity numeric(10,2),

    issue_type public.inventory_reconciliation_issue_type NOT NULL,
    severity text NOT NULL DEFAULT 'medium',
    status public.inventory_reconciliation_status NOT NULL DEFAULT 'open',
    recommended_action text,

    raw_register_payload jsonb NOT NULL DEFAULT '{}',
    metadata jsonb NOT NULL DEFAULT '{}',

    resolved_at timestamptz,
    resolved_by uuid REFERENCES auth.users,

    created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_inventory_reconciliation_items_sync_run
    ON public.inventory_reconciliation_items(sync_run_id);

CREATE INDEX IF NOT EXISTS idx_inventory_reconciliation_items_status
    ON public.inventory_reconciliation_items(status);

CREATE INDEX IF NOT EXISTS idx_inventory_reconciliation_items_issue_type
    ON public.inventory_reconciliation_items(issue_type);

CREATE INDEX IF NOT EXISTS idx_inventory_reconciliation_items_sku
    ON public.inventory_reconciliation_items(sku);

-- ============================================================================
-- 4. ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.inventory_reconciliation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view reconciliation items" ON public.inventory_reconciliation_items;
CREATE POLICY "Staff can view reconciliation items" ON public.inventory_reconciliation_items
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );

DROP POLICY IF EXISTS "Staff can manage reconciliation items" ON public.inventory_reconciliation_items;
CREATE POLICY "Staff can manage reconciliation items" ON public.inventory_reconciliation_items
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );

DROP POLICY IF EXISTS "Service role can manage reconciliation items" ON public.inventory_reconciliation_items;
CREATE POLICY "Service role can manage reconciliation items" ON public.inventory_reconciliation_items
    FOR ALL USING (auth.role() = 'service_role');

COMMIT;
