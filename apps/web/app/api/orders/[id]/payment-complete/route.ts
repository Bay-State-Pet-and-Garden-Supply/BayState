import { NextRequest, NextResponse } from 'next/server';
import { getStripeServerClient, retrievePaymentIntent } from '@/lib/payments/stripe';
import { createAdminClient } from '@/lib/supabase/server';
import { reconcileFromBrowser } from '@/lib/payments/order-payment-reconciliation';
import { z } from 'zod';

/**
 * POST /api/orders/[id]/payment-complete
 *
 * Called by the browser (Stripe Elements) after a successful card payment.
 * This endpoint is NOT the source of truth — the webhook is.
 *
 * Workflow:
 * 1. Receive paymentIntentId from the browser
 * 2. Retrieve PaymentIntent server-side from Stripe
 * 3. Verify metadata.order_id matches the URL parameter
 * 4. Verify paymentIntent.status === 'succeeded'
 * 5. Call shared reconciliation (idempotent — no-op if already processed by webhook)
 * 6. Return current order payment status
 *
 * Security: Never trusts the browser's claim of payment success.
 * Always verifies the PaymentIntent status with Stripe server-side.
 */

const paymentCompleteSchema = z.object({
  paymentIntentId: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const body = await request.json();

    // --- Validate request ---
    const validatedData = paymentCompleteSchema.parse(body);
    const { paymentIntentId } = validatedData;

    // --- Check Stripe is configured ---
    let stripeClient;
    try {
      stripeClient = getStripeServerClient();
    } catch {
      return NextResponse.json(
        { error: 'Payment processing is not configured.' },
        { status: 500 }
      );
    }

    // --- Load order server-side ---
    const supabase = await createAdminClient();
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // --- Retrieve PaymentIntent from Stripe ---
    let paymentIntent;
    try {
      paymentIntent = await retrievePaymentIntent(paymentIntentId);
    } catch (err) {
      console.error('Error retrieving PaymentIntent:', err);
      return NextResponse.json(
        { error: 'Could not retrieve PaymentIntent from Stripe' },
        { status: 400 }
      );
    }

    // --- Verify metadata.order_id matches ---
    if (paymentIntent.metadata?.order_id !== orderId) {
      return NextResponse.json(
        {
          error: 'PaymentIntent order_id mismatch',
          expected: orderId,
          received: paymentIntent.metadata?.order_id,
        },
        { status: 400 }
      );
    }

    // --- Verify payment status ---
    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json(
        {
          error: `PaymentIntent has status "${paymentIntent.status}", expected "succeeded"`,
        },
        { status: 400 }
      );
    }

    // --- Verify amount matches order total ---
    const expectedAmountCents = Math.round(order.total * 100);
    const actualAmountCents = paymentIntent.amount_received || paymentIntent.amount;

    if (actualAmountCents !== expectedAmountCents) {
      return NextResponse.json(
        {
          error: 'PaymentIntent amount does not match order total',
          expected: expectedAmountCents,
          received: actualAmountCents,
        },
        { status: 400 }
      );
    }

    // --- Reconcile (idempotent — webhook may have already processed this) ---
    const result = await reconcileFromBrowser(
      orderId,
      paymentIntent,
      `browser:${paymentIntentId}`
    );

    return NextResponse.json({
      success: true,
      orderId,
      paymentStatus: result.newStatus,
      updated: result.updated,
    });
  } catch (error) {
    console.error('Error completing payment:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', issues: error.issues },
        { status: 400 }
      );
    }

    // Re-throw known reconciliation errors
    if (error instanceof Error && error.message.includes('PaymentIntent')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to complete payment' },
      { status: 500 }
    );
  }
}
