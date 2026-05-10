import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { retrievePaymentIntent } from '@/lib/payments/stripe';
import { z } from 'zod';

const paymentCompleteSchema = z.object({
  paymentIntentId: z.string(),
  paymentMethod: z.enum(['pickup', 'credit_card', 'paypal', 'in_store']).default('credit_card'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const body = await request.json();

    const validatedData = paymentCompleteSchema.parse(body);

    const supabase = await createClient();

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

    const newPaymentStatus = order.stripe_payment_intent_id !== validatedData.paymentIntentId
      ? (await retrievePaymentIntent(validatedData.paymentIntentId)).status === 'succeeded' ? 'paid' : 'authorized'
      : 'paid';

    if (order.stripe_payment_intent_id !== validatedData.paymentIntentId) {
      const paymentIntent = await retrievePaymentIntent(validatedData.paymentIntentId);

      await supabase
        .from('orders')
        .update({
          stripe_payment_intent_id: validatedData.paymentIntentId,
          payment_method: validatedData.paymentMethod,
          payment_status: newPaymentStatus,
          paid_at: newPaymentStatus === 'paid' ? new Date().toISOString() : null,
        })
        .eq('id', orderId);
    } else {
      await supabase
        .from('orders')
        .update({
          payment_method: validatedData.paymentMethod,
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .eq('id', orderId);
    }

    await supabase.from('order_events').insert({
      order_id: orderId,
      event_type: 'payment_status_changed',
      previous_value: { payment_status: order.payment_status },
      new_value: { payment_status: newPaymentStatus },
    });

    return NextResponse.json({ success: true, orderId });
  } catch (error) {
    console.error('Error completing payment:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', issues: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to complete payment' },
      { status: 500 }
    );
  }
}
