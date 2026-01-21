import { NextRequest, NextResponse } from 'next/server';
import { constructWebhookEvent, retrievePaymentIntent } from '@/lib/payments/stripe';
import { createClient } from '@/lib/supabase/server';
import type Stripe from 'stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!webhookSecret) {
  console.warn('STRIPE_WEBHOOK_SECRET not set. Webhooks will not be processed.');
}

type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'partially_refunded';

async function updateOrderPaymentStatus(
  orderId: string,
  paymentStatus: PaymentStatus,
  stripePaymentIntentId: string,
  paidAt?: string
): Promise<boolean> {
  const supabase = await createClient();

  const updateData: Record<string, unknown> = {
    payment_status: paymentStatus,
    stripe_payment_intent_id: stripePaymentIntentId,
  };

  if (paidAt) {
    updateData.paid_at = paidAt;
  }

  const { error } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', orderId);

  if (error) {
    console.error('Error updating order payment status:', error);
    return false;
  }

  return true;
}

async function recordPaymentTransaction(
  orderId: string,
  paymentIntent: Stripe.PaymentIntent
): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase.from('order_payments').insert({
    order_id: orderId,
    amount: paymentIntent.amount / 100,
    currency: paymentIntent.currency,
    payment_method: paymentIntent.payment_method as string || 'credit_card',
    stripe_payment_intent_id: paymentIntent.id,
    stripe_charge_id: paymentIntent.latest_charge as string,
    status: mapPaymentIntentStatus(paymentIntent.status),
    error_message: paymentIntent.last_payment_error?.message || null,
    metadata: paymentIntent.metadata as Record<string, unknown>,
  });

  if (error) {
    console.error('Error recording payment transaction:', error);
    return false;
  }

  return true;
}

function mapPaymentIntentStatus(
  status: Stripe.PaymentIntent.Status
): 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded' {
  switch (status) {
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
      return 'pending';
    case 'processing':
    case 'requires_capture':
      return 'processing';
    case 'succeeded':
    case 'canceled':
      return 'succeeded';
    case 'requires_capture':
      return 'processing';
    default:
      return 'pending';
  }
}

export async function POST(request: NextRequest) {
  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    const event = constructWebhookEvent(body, signature, webhookSecret);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const orderId = paymentIntent.metadata.order_id;

        if (orderId) {
          await updateOrderPaymentStatus(
            orderId,
            'completed',
            paymentIntent.id,
            new Date().toISOString()
          );
          await recordPaymentTransaction(orderId, paymentIntent);
          console.log(`Order ${orderId} payment completed via webhook`);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const orderId = paymentIntent.metadata.order_id;

        if (orderId) {
          await updateOrderPaymentStatus(
            orderId,
            'failed',
            paymentIntent.id
          );
          console.log(`Order ${orderId} payment failed via webhook`);
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = charge.payment_intent as string;

        if (paymentIntentId) {
          const supabase = await createClient();
          const { data: orders } = await supabase
            .from('orders')
            .select('id')
            .eq('stripe_payment_intent_id', paymentIntentId)
            .single();

          if (orders) {
            const refundAmount = charge.amount_refunded / 100;
            const { data: orderData } = await supabase
              .from('orders')
              .select('total, refunded_amount')
              .eq('id', orders.id)
              .single();

            if (orderData) {
              const newRefundedAmount =
                (orderData.refunded_amount || 0) + refundAmount;
              const paymentStatus: PaymentStatus =
                newRefundedAmount >= (orderData.total || 0)
                  ? 'refunded'
                  : 'partially_refunded';

              await supabase
                .from('orders')
                .update({
                  payment_status: paymentStatus,
                  refunded_amount: newRefundedAmount,
                })
                .eq('id', orders.id);
            }

            await supabase.from('order_payments').insert({
              order_id: orders.id,
              amount: refundAmount,
              currency: charge.currency,
              payment_method: 'credit_card',
              stripe_payment_intent_id: paymentIntentId,
              stripe_charge_id: charge.id,
              status: 'refunded',
              error_message: null,
              metadata: {},
            });

            console.log(`Order ${orders.id} refunded via webhook`);
          }
        }
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);

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
