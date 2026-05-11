import { NextRequest, NextResponse } from 'next/server';
import { createPaymentIntent, getStripeServerClient, retrievePaymentIntent } from '@/lib/payments/stripe';
import { createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';

/**
 * POST /api/payments/intent
 *
 * Creates or retrieves a Stripe PaymentIntent for an order.
 *
 * The server loads the order from the database and derives the payable amount
 * from the stored order total. The client-provided amount is NOT trusted.
 * Existing valid PaymentIntents are reused to avoid duplicates.
 *
 * Request body (JSON):
 *   { orderId: string }
 *
 * Response (200):
 *   { clientSecret, paymentIntentId, amount, currency }
 *
 * Errors:
 *   400 — missing/invalid orderId, missing Stripe config, order not found
 *   409 — order already paid/refunded/voided
 */
const createIntentSchema = z.object({
  orderId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    // --- Validate request ---
    const body = await request.json();
    const validatedData = createIntentSchema.parse(body);
    const { orderId } = validatedData;

    // --- Check Stripe is configured ---
    let stripeClient;
    try {
      stripeClient = getStripeServerClient();
    } catch {
      return NextResponse.json(
        { error: 'Payment processing is not configured. Set STRIPE_SECRET_KEY.' },
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

    // --- Validate order state ---
    const paymentStatus = order.payment_status;

    if (paymentStatus === 'paid' || paymentStatus === 'refunded' || paymentStatus === 'partially_refunded') {
      return NextResponse.json(
        { error: `Order is already ${paymentStatus}` },
        { status: 409 }
      );
    }

    if (paymentStatus === 'voided') {
      return NextResponse.json(
        { error: 'Order payment has been voided' },
        { status: 409 }
      );
    }

    // --- Check for existing PaymentIntent ---
    if (order.stripe_payment_intent_id) {
      try {
        const existingPi = await retrievePaymentIntent(order.stripe_payment_intent_id);

        // If the existing PI is still active, return its client_secret
        if (
          existingPi.status === 'requires_payment_method' ||
          existingPi.status === 'requires_confirmation' ||
          existingPi.status === 'requires_action' ||
          existingPi.status === 'processing'
        ) {
          // Verify amount matches
          if (existingPi.amount === Math.round(order.total * 100)) {
            return NextResponse.json({
              clientSecret: existingPi.client_secret,
              paymentIntentId: existingPi.id,
              amount: existingPi.amount,
              currency: existingPi.currency,
            });
          }

          // Amount changed — cancel and recreate
          console.log(`Order ${orderId}: amount changed, canceling PI ${existingPi.id}`);
          await stripeClient.paymentIntents.cancel(existingPi.id);

          // Clear the stale PI ID
          await supabase
            .from('orders')
            .update({ stripe_payment_intent_id: null })
            .eq('id', orderId);
        }
      } catch (err) {
        // PI may have been deleted or expired — proceed to create new one
        console.warn(`Could not retrieve existing PI ${order.stripe_payment_intent_id}:`, err);
        await supabase
          .from('orders')
          .update({ stripe_payment_intent_id: null })
          .eq('id', orderId);
      }
    }

    // --- Create PaymentIntent with server-derived amount ---
    const amount = order.total;

    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Order total must be greater than zero' },
        { status: 400 }
      );
    }

    // Build metadata
    const metadata: Record<string, string> = {
      order_id: orderId,
      order_number: order.order_number || '',
      customer_email: order.customer_email || '',
    };

    // Use an amount-versioned idempotency key to prevent Stripe from
    // returning a stale (cancelled) PI result if the amount changed
    // between retries.
    const amountCents = Math.round(amount * 100);
    const idempotencyKey = `order:${orderId}:${amountCents}`;

    const paymentIntent = await stripeClient.paymentIntents.create(
      {
        amount: amountCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata,
      },
      {
        idempotencyKey,
      }
    );

    // --- Store PaymentIntent ID on order ---
    await supabase
      .from('orders')
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq('id', orderId);

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', issues: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create payment intent' },
      { status: 500 }
    );
  }
}
