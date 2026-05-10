-- Oracle Fixes: PR 1/2 blockers identified during review
-- Issues: #1 source_type default trigger, #2 security_invoker view, #10 FK

BEGIN;

-- ============================================================================
-- Issue #1: source_type NOT NULL without default
-- Add BEFORE INSERT trigger that maps legacy source → source_type when missing
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_order_source_type()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_order_source_type ON public.orders;
CREATE TRIGGER trigger_set_order_source_type
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_source_type();

-- Backfill source_system for existing rows so the unique external index works
UPDATE public.orders SET source_system = 'shopsite_15' WHERE source_type = 'shopsite' AND source_system IS NULL;
UPDATE public.orders SET source_system = 'integra_register' WHERE source_type = 'integra' AND source_system IS NULL;

-- ============================================================================
-- Issue #2: admin_orders_list missing security_invoker
-- Recreate the view to prevent RLS bypass by unauthenticated queries
-- ============================================================================

DROP VIEW IF EXISTS public.admin_orders_list;
CREATE OR REPLACE VIEW public.admin_orders_list
WITH (security_invoker = true)
AS
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

-- ============================================================================
-- Issue #10: Missing FK on order_source_records.sync_run_id
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE public.order_source_records
    ADD CONSTRAINT order_source_records_sync_run_id_fkey
    FOREIGN KEY (sync_run_id)
    REFERENCES public.integration_sync_runs(id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
