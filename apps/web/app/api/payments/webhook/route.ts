import { NextRequest, NextResponse } from 'next/server';
import { constructWebhookEvent } from '@/lib/payments/stripe';
import {
  claimWebhookEvent,
  finalizeWebhookEvent,
  handlePaymentIntentSucceeded,
  handlePaymentIntentFailed,
  handlePaymentIntentCanceled,
  handleChargeRefunded,
} from '@/lib/payments/order-payment-reconciliation';

function getWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET;
}

/**
 * POST /api/payments/webhook
 *
 * Receives Stripe webhook events and reconciles order state.
 * Idempotent via stripe_webhook_events ledger — duplicate deliveries
 * are detected before any processing occurs.
 *
 * Required env: STRIPE_WEBHOOK_SECRET (from `stripe listen --forward-to ...`)
 *
 * Handled events:
 *   - payment_intent.succeeded
 *   - payment_intent.payment_failed
 *   - payment_intent.canceled
 *   - charge.refunded
 *
 * Returns 200 for all valid events (including duplicates).
 * Returns 400 for missing/invalid signature.
 * Returns 500 for misconfigured webhook secret.
 */
export async function POST(request: NextRequest) {
  const whSecret = getWebhookSecret();
  if (!whSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not set. Webhooks cannot be processed.');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  try {
    // --- Read raw body and verify signature ---
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    const event = constructWebhookEvent(body, signature, whSecret);
    const eventId = event.id;
    const eventType = event.type;
    const eventData = event.data.object as unknown as Record<string, unknown>;
    const stripeObjectId = (eventData as unknown as Record<string, unknown>)?.id as string | null || null;

    console.log(`Webhook received: ${eventType} [${eventId}]`);

    // --- Claim event in ledger (idempotency gate) ---
    const eventOrderId = extractOrderId(event);
    const claimResult = await claimWebhookEvent(
      eventId,
      eventType,
      stripeObjectId,
      eventOrderId,
      event.data.object as unknown as Record<string, unknown>
    );

    // Always return 200 for duplicate events to acknowledge receipt
    if (claimResult === 'duplicate') {
      console.log(`Duplicate webhook event ${eventId} (${eventType}) — skipping`);
      return NextResponse.json({ received: true, duplicate: true });
    }

    if (claimResult === 'retry') {
      console.log(`Retrying previously failed webhook event ${eventId} (${eventType})`);
    }

    // --- Process event (wrapped in try/catch for proper failure handling) ---
    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as import('stripe').Stripe.PaymentIntent;
          const result = await handlePaymentIntentSucceeded(paymentIntent, eventId);
          console.log(
            `Order ${result.orderId}: payment succeeded (updated: ${result.updated}, status: ${result.previousStatus} → ${result.newStatus})`
          );
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object as import('stripe').Stripe.PaymentIntent;
          const result = await handlePaymentIntentFailed(paymentIntent, eventId);
          console.log(
            `Order ${result.orderId}: payment failed (updated: ${result.updated}, status: ${result.previousStatus} → ${result.newStatus})`
          );
          break;
        }

        case 'payment_intent.canceled': {
          const paymentIntent = event.data.object as import('stripe').Stripe.PaymentIntent;
          const result = await handlePaymentIntentCanceled(paymentIntent, eventId);
          console.log(
            `Order ${result.orderId}: payment canceled (updated: ${result.updated}, status: ${result.previousStatus} → ${result.newStatus})`
          );
          break;
        }

        case 'charge.refunded': {
          const charge = event.data.object as import('stripe').Stripe.Charge;
          const result = await handleChargeRefunded(charge, eventId);
          console.log(
            `Order ${result.orderId}: charge refunded (updated: ${result.updated}, status: ${result.previousStatus} → ${result.newStatus})`
          );
          break;
        }

        default:
          console.log(`Unhandled webhook event type: ${event.type}`);
          // Mark as skipped in ledger so it doesn't retry infinitely
          await finalizeWebhookEvent(eventId, 'skipped', `Unhandled event type: ${event.type}`);
      }
    } catch (processingError) {
      console.error(`Error processing webhook event ${eventId} (${eventType}):`, processingError);
      try {
        await finalizeWebhookEvent(
          eventId,
          'failed',
          processingError instanceof Error ? processingError.message : 'Unknown processing error'
        );
      } catch (finalizeErr) {
        console.error(`Failed to finalize webhook event ${eventId} as failed:`, finalizeErr);
      }
      return NextResponse.json(
        { error: 'Event processing failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);

    if (error instanceof Error && error.name === 'StripeSignatureVerificationError') {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

/**
 * Extract the order_id from a Stripe event's metadata if available.
 * We need it early for the ledger lookup, before processing the event.
 */
function extractOrderId(event: import('stripe').Stripe.Event): string | null {
  try {
    const obj = event.data.object as unknown as Record<string, unknown>;
    const metadata = (obj?.metadata as Record<string, string> | undefined) || undefined;
    return metadata?.order_id || null;
  } catch {
    return null;
  }
}
