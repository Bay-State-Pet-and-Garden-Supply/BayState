/**
 * order-payment-reconciliation.ts
 *
 * Shared server-only logic for reconciling Stripe events (PaymentIntent,
 * charge refunds) with order state. Both the webhook route and the
 * payment-complete endpoint use this helper to ensure idempotent,
 * consistent updates.
 *
 * Idempotency contract:
 * - If an order_payments row already exists for the same stripe_event_id,
 *   this is a no-op.
 * - If the order's payment_status would be downgraded (e.g. from 'paid'
 *   to 'failed'), this is skipped.
 */

import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/server';
import { dollarsFromCents } from '@/lib/payments/stripe';
import type { OrderPaymentStatusEnum } from '@/lib/orders';

type PaymentStatus = OrderPaymentStatusEnum;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReconciliationResult {
  updated: boolean;
  orderId: string;
  previousStatus: PaymentStatus | null;
  newStatus: PaymentStatus | null;
  eventId: string;
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

/**
 * Map a Stripe PaymentIntent status to our order_payment_status enum.
 */
function statusFromIntentStatus(
  intentStatus: Stripe.PaymentIntent.Status
): PaymentStatus | null {
  switch (intentStatus) {
    case 'succeeded':
      return 'paid';
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
    case 'processing':
      return 'authorized';
    case 'canceled':
      return 'voided';
    default:
      return null;
  }
}

/**
 * Determine refund status based on cumulative refund amount vs order total.
 */
function refundStatus(
  totalRefunded: number,
  orderTotal: number
): PaymentStatus {
  if (totalRefunded <= 0) return 'paid';
  if (totalRefunded >= orderTotal) return 'refunded';
  return 'partially_refunded';
}

// ---------------------------------------------------------------------------
// Webhook event ledger
// ---------------------------------------------------------------------------

/**
 * Try to mark a webhook event as processing. Returns false if the event
 * was already processed or is currently processing (idempotent dedup).
 * Returns true if the event is new or was previously failed (retryable).
 */
export async function claimWebhookEvent(
  eventId: string,
  eventType: string,
  stripeObjectId: string | null,
  orderId: string | null,
  payload: Record<string, unknown>
): Promise<'new' | 'retry' | 'duplicate'> {
  const supabase = await createAdminClient();

  // Try to insert
  const { error } = await supabase.from('stripe_webhook_events').insert({
    event_id: eventId,
    event_type: eventType,
    stripe_object_id: stripeObjectId,
    order_id: orderId,
    status: 'processing',
    payload,
  });

  // Successfully inserted — first time seeing this event
  if (!error) return 'new';

  // Conflict — event already exists
  const { data: existing } = await supabase
    .from('stripe_webhook_events')
    .select('status')
    .eq('event_id', eventId)
    .single();

  if (!existing) return 'new'; // race condition, treat as new

  if (existing.status === 'failed') {
    // Retry: update status back to processing
    await supabase
      .from('stripe_webhook_events')
      .update({ status: 'processing', processed_at: null, error_message: null })
      .eq('event_id', eventId);
    return 'retry';
  }

  // processed, skipped, or currently processing — skip
  return 'duplicate';
}

/**
 * Mark a webhook event as processed (or failed).
 */
export async function finalizeWebhookEvent(
  eventId: string,
  status: 'processed' | 'skipped' | 'failed',
  errorMessage?: string
): Promise<void> {
  const supabase = await createAdminClient();
  await supabase
    .from('stripe_webhook_events')
    .update({
      status,
      processed_at: new Date().toISOString(),
      error_message: errorMessage || null,
    })
    .eq('event_id', eventId);
}

// ---------------------------------------------------------------------------
// Order payment reconciliation
// ---------------------------------------------------------------------------

/**
 * Record a payment transaction in order_payments.
 * Idempotent by stripe_event_id unique index.
 */
async function recordPayment(
  orderId: string,
  amount: number,
  currency: string,
  stripePaymentIntentId: string,
  stripeChargeId: string | null,
  status: string,
  stripeEventId: string,
  errorMessage?: string | null
): Promise<boolean> {
  const supabase = await createAdminClient();

  const { error } = await supabase.from('order_payments').insert({
    order_id: orderId,
    amount,
    currency,
    payment_method: 'credit_card',
    stripe_payment_intent_id: stripePaymentIntentId,
    stripe_charge_id: stripeChargeId,
    status,
    error_message: errorMessage || null,
    stripe_event_id: stripeEventId,
    metadata: {},
  });

  if (error) {
    // Unique violation on stripe_event_id means duplicate — that's fine
    if (error.code === '23505') return true;
    console.error('Error recording payment:', error.message);
    return false;
  }

  return true;
}

/**
 * Update order's payment status, recording an event only on change.
 */
async function updateOrderPaymentStatus(
  orderId: string,
  newStatus: PaymentStatus,
  extraFields?: Record<string, unknown>
): Promise<{ previousStatus: PaymentStatus | null; changed: boolean }> {
  const supabase = await createAdminClient();

  // Read current status
  const { data: order } = await supabase
    .from('orders')
    .select('payment_status')
    .eq('id', orderId)
    .single();

  if (!order) {
    console.error(`Order ${orderId} not found for payment status update`);
    return { previousStatus: null, changed: false };
  }

  const previousStatus = order.payment_status as PaymentStatus | null;

  // No downgrade from paid/refunded to a lower status
  if (previousStatus && isDowngrade(previousStatus, newStatus)) {
    console.warn(
      `Skipping payment status downgrade for order ${orderId}: ${previousStatus} -> ${newStatus}`
    );
    return { previousStatus, changed: false };
  }

  const updateData: Record<string, unknown> = {
    payment_status: newStatus,
    ...extraFields,
  };

  if (newStatus === 'paid' && !extraFields?.paid_at) {
    updateData.paid_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', orderId);

  if (error) {
    console.error('Error updating order payment status:', error.message);
    return { previousStatus, changed: false };
  }

  // Record order event only when status actually changes
  if (previousStatus !== newStatus) {
    await supabase.from('order_events').insert({
      order_id: orderId,
      event_type: 'payment_status_changed',
      previous_value: { payment_status: previousStatus },
      new_value: { payment_status: newStatus, ...extraFields },
    });
  }

  return { previousStatus, changed: true };
}

/**
 * Returns true if `newStatus` is a downgrade from `currentStatus`.
 * We never want to go from paid/refunded back to unpaid/failed.
 */
function isDowngrade(current: PaymentStatus, newStatus: PaymentStatus): boolean {
  const hierarchy: Record<PaymentStatus, number> = {
    unpaid: 0,
    authorized: 1,
    paid: 3,
    failed: 1,
    partially_refunded: 4,
    refunded: 5,
    voided: 6,
  };

  const currentLevel = hierarchy[current] ?? 0;
  const newLevel = hierarchy[newStatus] ?? 0;

  // Allow same-level transitions (e.g. paid -> partially_refunded)
  // but not going from paid (3) to unpaid (0) or failed (1)
  return newLevel < currentLevel && currentLevel >= 3;
}

// ---------------------------------------------------------------------------
// Public reconciliation handlers
// ---------------------------------------------------------------------------

/**
 * Handle a payment_intent.succeeded event.
 */
export async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
  eventId: string
): Promise<ReconciliationResult> {
  const orderId = paymentIntent.metadata?.order_id;
  const chargedAmount = dollarsFromCents(paymentIntent.amount_received || paymentIntent.amount);
  const chargeId = typeof paymentIntent.latest_charge === 'string'
    ? paymentIntent.latest_charge
    : null;

  const result: ReconciliationResult = {
    updated: false,
    orderId: orderId || 'unknown',
    previousStatus: null,
    newStatus: 'paid',
    eventId,
  };

  if (!orderId) {
    console.warn('PaymentIntent has no order_id metadata:', paymentIntent.id);
    await finalizeWebhookEvent(eventId, 'skipped', 'No order_id in metadata');
    return result;
  }

  // Update order status
  const { previousStatus, changed } = await updateOrderPaymentStatus(
    orderId,
    'paid',
    { stripe_payment_intent_id: paymentIntent.id }
  );
  result.previousStatus = previousStatus;
  result.updated = changed;

  // Record payment transaction (idempotent by stripe_event_id)
  await recordPayment(
    orderId,
    chargedAmount,
    paymentIntent.currency,
    paymentIntent.id,
    chargeId,
    'succeeded',
    eventId
  );

  await finalizeWebhookEvent(eventId, changed ? 'processed' : 'skipped');
  return result;
}

/**
 * Handle a payment_intent.payment_failed event.
 */
export async function handlePaymentIntentFailed(
  paymentIntent: Stripe.PaymentIntent,
  eventId: string
): Promise<ReconciliationResult> {
  const orderId = paymentIntent.metadata?.order_id;

  const result: ReconciliationResult = {
    updated: false,
    orderId: orderId || 'unknown',
    previousStatus: null,
    newStatus: 'failed',
    eventId,
  };

  if (!orderId) {
    await finalizeWebhookEvent(eventId, 'skipped', 'No order_id in metadata');
    return result;
  }

  const { previousStatus, changed } = await updateOrderPaymentStatus(orderId, 'failed');
  result.previousStatus = previousStatus;
  result.updated = changed;

  await finalizeWebhookEvent(eventId, changed ? 'processed' : 'skipped');
  return result;
}

/**
 * Handle a payment_intent.canceled event.
 */
export async function handlePaymentIntentCanceled(
  paymentIntent: Stripe.PaymentIntent,
  eventId: string
): Promise<ReconciliationResult> {
  const orderId = paymentIntent.metadata?.order_id;

  const result: ReconciliationResult = {
    updated: false,
    orderId: orderId || 'unknown',
    previousStatus: null,
    newStatus: 'voided',
    eventId,
  };

  if (!orderId) {
    await finalizeWebhookEvent(eventId, 'skipped', 'No order_id in metadata');
    return result;
  }

  const { previousStatus, changed } = await updateOrderPaymentStatus(orderId, 'voided');
  result.previousStatus = previousStatus;
  result.updated = changed;

  await finalizeWebhookEvent(eventId, changed ? 'processed' : 'skipped');
  return result;
}

/**
 * Handle a charge.refunded event.
 */
export async function handleChargeRefunded(
  charge: Stripe.Charge,
  eventId: string
): Promise<ReconciliationResult> {
  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id;

  const result: ReconciliationResult = {
    updated: false,
    orderId: 'unknown',
    previousStatus: null,
    newStatus: 'refunded',
    eventId,
  };

  if (!paymentIntentId) {
    await finalizeWebhookEvent(eventId, 'skipped', 'No payment_intent on charge');
    return result;
  }

  // Find the order by stripe_payment_intent_id
  const supabase = await createAdminClient();
  const { data: order } = await supabase
    .from('orders')
    .select('id, total, refunded_amount, payment_status')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .single();

  if (!order) {
    console.warn(`No order found for PI ${paymentIntentId} on refund`);
    await finalizeWebhookEvent(eventId, 'skipped', 'Order not found');
    return result;
  }

  result.orderId = order.id;
  const refundAmount = dollarsFromCents(charge.amount_refunded);
  const previousRefunded = order.refunded_amount || 0;
  const newRefundedAmount = previousRefunded + refundAmount;
  const newStatus = refundStatus(newRefundedAmount, order.total);

  result.newStatus = newStatus;
  result.previousStatus = order.payment_status as PaymentStatus;

  const { changed } = await updateOrderPaymentStatus(order.id, newStatus, {
    refunded_amount: newRefundedAmount,
  });
  result.updated = changed;

  // Record refund transaction
  await recordPayment(
    order.id,
    refundAmount,
    charge.currency,
    paymentIntentId,
    charge.id,
    'refunded',
    eventId
  );

  await finalizeWebhookEvent(eventId, changed ? 'processed' : 'skipped');
  return result;
}

/**
 * Verify and reconcile a payment-complete request from the browser.
 * This is a lighter check: verify the PaymentIntent server-side, then
 * update the order if the webhook hasn't already done so.
 */
export async function reconcileFromBrowser(
  orderId: string,
  paymentIntent: Stripe.PaymentIntent,
  eventId: string
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    updated: false,
    orderId,
    previousStatus: null,
    newStatus: 'paid',
    eventId,
  };

  // Verify metadata matches
  if (paymentIntent.metadata?.order_id !== orderId) {
    throw new Error(
      `PaymentIntent metadata.order_id (${paymentIntent.metadata?.order_id}) does not match order ${orderId}`
    );
  }

  // Verify status
  if (paymentIntent.status !== 'succeeded') {
    throw new Error(
      `PaymentIntent ${paymentIntent.id} has status "${paymentIntent.status}", expected "succeeded"`
    );
  }

  const chargedAmount = dollarsFromCents(paymentIntent.amount_received || paymentIntent.amount);
  const chargeId = typeof paymentIntent.latest_charge === 'string'
    ? paymentIntent.latest_charge
    : null;

  // Update order status
  const { previousStatus, changed } = await updateOrderPaymentStatus(
    orderId,
    'paid',
    { stripe_payment_intent_id: paymentIntent.id }
  );
  result.previousStatus = previousStatus;
  result.updated = changed;

  // Record payment if not already recorded (idempotent by event_id)
  if (eventId) {
    await recordPayment(
      orderId,
      chargedAmount,
      paymentIntent.currency,
      paymentIntent.id,
      chargeId,
      'succeeded',
      eventId
    );
  }

  return result;
}
