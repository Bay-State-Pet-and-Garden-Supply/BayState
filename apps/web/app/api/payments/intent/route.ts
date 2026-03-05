import { NextRequest, NextResponse } from 'next/server';
import { createPaymentIntent } from '@/lib/payments/stripe';
import { z } from 'zod';

const createIntentSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default('usd'),
  customerEmail: z.string().email(),
  customerName: z.string().min(1),
  orderId: z.string().optional(),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      quantity: z.number().positive(),
      unitPrice: z.number().positive(),
    })
  ),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validatedData = createIntentSchema.parse(body);

    const paymentIntent = await createPaymentIntent({
      amount: validatedData.amount,
      currency: validatedData.currency,
      customerEmail: validatedData.customerEmail,
      customerName: validatedData.customerName,
      orderId: validatedData.orderId,
      metadata: {
        item_count: validatedData.items.length.toString(),
        items: JSON.stringify(
          validatedData.items.map((item) => ({
            id: item.id,
            name: item.name,
            qty: item.quantity,
          }))
        ),
      },
    });

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
