-- Migration: Order Integration Foundation
-- Purpose: Establish canonical order source tracking, payment status enums,
--          fulfillment lifecycle, and integration evidence tables.
-- PR: Phase 1 - Schema Foundation

BEGIN;

-- ============================================================================
-- 1. CREATE ENUM TYPES
-- ============================================================================

-- Order source classification
DO $$ BEGIN
    CREATE TYPE public.order_source_type AS ENUM (
        'web',
        'shopsite',
        'integra',
        'manual',
        'import'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Payment status (replacing text check constraint)
DO $$ BEGIN
    CREATE TYPE public.order_payment_status AS ENUM (
        'unpaid',
        'authorized',
        'paid',
        'failed',
        'partially_refunded',
        'refunded',
        'voided'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Fulfillment lifecycle
DO $$ BEGIN
    CREATE TYPE public.order_fulfillment_status AS ENUM (
        'unfulfilled',
        'reserved',
        'ready_for_pickup',
        'out_for_delivery',
        'fulfilled',
        'partially_fulfilled',
        'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. ADD NEW COLUMNS TO ORDERS
-- ============================================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS source_type public.order_source_type,
    ADD COLUMN IF NOT EXISTS source_system text,
    ADD COLUMN IF NOT EXISTS external_order_id text,
    ADD COLUMN IF NOT EXISTS external_created_at timestamptz,
    ADD COLUMN IF NOT EXISTS imported_at timestamptz,
    ADD COLUMN IF NOT EXISTS fulfillment_status public.order_fulfillment_status NOT NULL DEFAULT 'unfulfilled';

-- ============================================================================
-- 3. MIGRATE payment_status FROM TEXT TO ENUM
-- ============================================================================

-- Map old text values to new enum values
-- pending -> unpaid, processing -> authorized, completed -> paid
-- failed, refunded, partially_refunded map 1:1
DO $$
BEGIN
    -- Drop the old check constraint
    ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Drop old default before type conversion
ALTER TABLE public.orders ALTER COLUMN payment_status DROP DEFAULT;

-- Update existing values to match new enum labels
UPDATE public.orders
SET payment_status =
    CASE payment_status
        WHEN 'pending' THEN 'unpaid'
        WHEN 'processing' THEN 'authorized'
        WHEN 'completed' THEN 'paid'
        ELSE payment_status -- failed, refunded, partially_refunded, or null
    END
WHERE payment_status IS NOT NULL;

-- Alter column type to enum
ALTER TABLE public.orders
    ALTER COLUMN payment_status TYPE public.order_payment_status
    USING payment_status::public.order_payment_status;

-- Set default for new orders
ALTER TABLE public.orders
    ALTER COLUMN payment_status SET DEFAULT 'unpaid';

-- ============================================================================
-- 4. BACKFILL source_type FROM source
-- ============================================================================

UPDATE public.orders
SET source_type =
    CASE source
        WHEN 'shopsite' THEN 'shopsite'::public.order_source_type
        WHEN 'integra' THEN 'integra'::public.order_source_type
        WHEN 'web' THEN 'web'::public.order_source_type
        ELSE NULL
    END
WHERE source_type IS NULL;

-- Backfill remaining NULL source_type by order_number pattern
UPDATE public.orders
SET source_type =
    CASE
        WHEN order_number LIKE 'BSP-%' THEN 'web'::public.order_source_type
        WHEN order_number LIKE 'INT-%' THEN 'integra'::public.order_source_type
        WHEN order_number ~ '^[0-9]+$' THEN 'shopsite'::public.order_source_type
        ELSE 'web'::public.order_source_type
    END
WHERE source_type IS NULL;

-- Set NOT NULL constraint
ALTER TABLE public.orders
    ALTER COLUMN source_type SET NOT NULL;

-- ============================================================================
-- 5. BACKFILL external_order_id FOR LEGACY ORDERS
-- ============================================================================

-- ShopSite orders: order_number IS the legacy ShopSite number
UPDATE public.orders
SET external_order_id = order_number
WHERE source_type = 'shopsite'
  AND external_order_id IS NULL;

-- Integra orders: order_number is already INT-... pattern
UPDATE public.orders
SET external_order_id = order_number
WHERE source_type = 'integra'
  AND external_order_id IS NULL;

-- ============================================================================
-- 6. ADD INDEXES ON ORDERS
-- ============================================================================

-- Unique constraint: prevent duplicate imports
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_source_external_unique
    ON public.orders (source_type, source_system, external_order_id)
    WHERE external_order_id IS NOT NULL;

-- Source filtering
CREATE INDEX IF NOT EXISTS idx_orders_source_type_created_at
    ON public.orders (source_type, created_at DESC);

-- Payment status lookup
CREATE INDEX IF NOT EXISTS idx_orders_payment_status
    ON public.orders (payment_status);

-- Fulfillment status lookup
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status
    ON public.orders (fulfillment_status);

-- ============================================================================
-- 7. CREATE order_source_records TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_source_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,

    source_type public.order_source_type NOT NULL,
    source_system text NOT NULL,
    external_id text,
    external_order_number text,

    raw_payload jsonb NOT NULL DEFAULT '{}',
    normalized_payload jsonb NOT NULL DEFAULT '{}',

    payload_hash text,
    sync_run_id uuid,

    imported_at timestamptz NOT NULL DEFAULT now(),
    external_created_at timestamptz,
    external_updated_at timestamptz,

    UNIQUE (source_type, source_system, external_id)
);

CREATE INDEX IF NOT EXISTS idx_order_source_records_order_id
    ON public.order_source_records (order_id);

CREATE INDEX IF NOT EXISTS idx_order_source_records_source
    ON public.order_source_records (source_type, source_system);

CREATE INDEX IF NOT EXISTS idx_order_source_records_sync_run
    ON public.order_source_records (sync_run_id);

-- ============================================================================
-- 8. CREATE integration_sync_runs TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.integration_sync_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    source_type public.order_source_type NOT NULL,
    source_system text NOT NULL,

    sync_kind text NOT NULL,           -- e.g. 'orders', 'inventory', 'products'
    status text NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed', 'partial')),

    file_name text,
    row_count integer DEFAULT 0,
    inserted_count integer DEFAULT 0,
    updated_count integer DEFAULT 0,
    skipped_count integer DEFAULT 0,
    error_count integer DEFAULT 0,

    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    created_by uuid REFERENCES auth.users,

    error_summary text,
    metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_integration_sync_runs_source
    ON public.integration_sync_runs (source_type, source_system);

CREATE INDEX IF NOT EXISTS idx_integration_sync_runs_started
    ON public.integration_sync_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_sync_runs_created_by
    ON public.integration_sync_runs (created_by);

-- ============================================================================
-- 9. CREATE order_events TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,

    event_type text NOT NULL,           -- e.g. 'imported_from_shopsite', 'status_changed', etc.
    previous_value jsonb,
    new_value jsonb,
    note text,

    created_by uuid REFERENCES auth.users,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_id_created_at
    ON public.order_events (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_events_event_type
    ON public.order_events (event_type);

-- ============================================================================
-- 10. ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.order_source_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

-- Staff can view all source records
DROP POLICY IF EXISTS "Staff can view order source records" ON public.order_source_records;
CREATE POLICY "Staff can view order source records" ON public.order_source_records
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );

-- Staff can insert/update source records (service role for scripts)
DROP POLICY IF EXISTS "Staff can manage order source records" ON public.order_source_records;
CREATE POLICY "Staff can manage order source records" ON public.order_source_records
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );

-- Staff can view all sync runs
DROP POLICY IF EXISTS "Staff can view integration sync runs" ON public.integration_sync_runs;
CREATE POLICY "Staff can view integration sync runs" ON public.integration_sync_runs
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );

-- Staff can manage sync runs
DROP POLICY IF EXISTS "Staff can manage integration sync runs" ON public.integration_sync_runs;
CREATE POLICY "Staff can manage integration sync runs" ON public.integration_sync_runs
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );

-- Staff can view all order events
DROP POLICY IF EXISTS "Staff can view order events" ON public.order_events;
CREATE POLICY "Staff can view order events" ON public.order_events
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );

-- Staff can insert order events (for status changes, notes, etc.)
DROP POLICY IF EXISTS "Staff can manage order events" ON public.order_events;
CREATE POLICY "Staff can manage order events" ON public.order_events
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );

-- Service role bypass for scripts (order_events)
DROP POLICY IF EXISTS "Service role can manage order events" ON public.order_events;
CREATE POLICY "Service role can manage order events" ON public.order_events
    FOR ALL USING (auth.role() = 'service_role');

-- Service role bypass for source records (sync scripts)
DROP POLICY IF EXISTS "Service role can manage order source records" ON public.order_source_records;
CREATE POLICY "Service role can manage order source records" ON public.order_source_records
    FOR ALL USING (auth.role() = 'service_role');

-- Service role bypass for sync runs
DROP POLICY IF EXISTS "Service role can manage integration sync runs" ON public.integration_sync_runs;
CREATE POLICY "Service role can manage integration sync runs" ON public.integration_sync_runs
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- 11. CREATE admin_orders_list VIEW
-- ============================================================================

CREATE OR REPLACE VIEW public.admin_orders_list AS
SELECT
    o.id,
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
    COUNT(oi.id) AS item_count,
    COALESCE(SUM(oi.quantity), 0) AS total_quantity
FROM public.orders o
LEFT JOIN public.order_items oi ON oi.order_id = o.id
GROUP BY o.id;

GRANT SELECT ON public.admin_orders_list TO authenticated;

COMMIT;
