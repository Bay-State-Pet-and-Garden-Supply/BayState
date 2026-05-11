-- =====================================================================
-- Stripe Webhook Idempotency
-- Migration: 20260510210000
--
-- Ensures duplicate Stripe webhook deliveries do not create
-- duplicate order_payments rows or cause inconsistent order state.
-- =====================================================================

-- ---------------------------------------------------------------------
-- stripe_webhook_events: ledger of received webhook events
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  stripe_object_id text,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'processed', 'skipped', 'failed')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error_message text,
  payload jsonb NOT NULL
);

-- Allow quick lookup of events by order_id
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_order_id
  ON stripe_webhook_events(order_id)
  WHERE order_id IS NOT NULL;

-- Allow lookup of events by Stripe object (PI / charge / refund)
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_object_id
  ON stripe_webhook_events(stripe_object_id)
  WHERE stripe_object_id IS NOT NULL;

-- RLS: service role manages; staff can read
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Service role can manage (insert, update, delete)
DROP POLICY IF EXISTS "service_role_manage_stripe_webhook_events" ON stripe_webhook_events;
CREATE POLICY "service_role_manage_stripe_webhook_events"
  ON stripe_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Staff can read
DROP POLICY IF EXISTS "staff_read_stripe_webhook_events" ON stripe_webhook_events;
CREATE POLICY "staff_read_stripe_webhook_events"
  ON stripe_webhook_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
  );

-- ---------------------------------------------------------------------
-- Add stripe_event_id to order_payments for dedup
-- ---------------------------------------------------------------------
ALTER TABLE order_payments
  ADD COLUMN IF NOT EXISTS stripe_event_id text;

-- Unique partial index: only one row per event id
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_payments_stripe_event_id
  ON order_payments(stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;
