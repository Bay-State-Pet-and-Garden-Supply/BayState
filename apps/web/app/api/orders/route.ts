import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createOrder, getOrderById } from '@/lib/orders';
import { sendOrderConfirmationEmail } from '@/lib/email/resend';
import * as z from 'zod';

const deliveryAddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
});

const orderSchema = z.object({
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  customerPhone: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      price: z.number(),
      quantity: z.number(),
      imageUrl: z.string().nullable().optional(),
      preorderBatchId: z.string().nullable().optional(),
      pickupOnly: z.boolean().nullable().optional(),
    })
  ),
  promoCode: z.string().nullable().optional(),
  promoCodeId: z.string().nullable().optional(),
  discountAmount: z.number().optional(),
  paymentMethod: z.enum(['pickup', 'credit_card', 'paypal']).default('pickup'),
  fulfillmentMethod: z.enum(['pickup', 'delivery']).default('pickup'),
  deliveryAddress: deliveryAddressSchema.nullable().optional(),
  deliveryDistanceMiles: z.number().nullable().optional(),
  deliveryFee: z.number().nullable().optional(),
  deliveryServices: z.array(z.string()).optional(),
  deliveryNotes: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await request.json();
    const validatedData = orderSchema.parse(body);

    if (validatedData.items.length === 0) {
      return NextResponse.json(
        { error: 'Cart is empty' },
        { status: 400 }
      );
    }

    const order = await createOrder({
      userId: user?.id || null,
      customerName: validatedData.customerName,
      customerEmail: validatedData.customerEmail,
      customerPhone: validatedData.customerPhone,
      notes: validatedData.notes,
      items: validatedData.items,
      promoCode: validatedData.promoCode,
      promoCodeId: validatedData.promoCodeId,
      discountAmount: validatedData.discountAmount,
      paymentMethod: validatedData.paymentMethod,
      fulfillmentMethod: validatedData.fulfillmentMethod,
      deliveryAddress: validatedData.deliveryAddress,
      deliveryDistanceMiles: validatedData.deliveryDistanceMiles,
      deliveryFee: validatedData.deliveryFee,
      deliveryServices: validatedData.deliveryServices,
      deliveryNotes: validatedData.deliveryNotes,
    });

    if (!order) {
      return NextResponse.json(
        { error: 'Failed to create order' },
        { status: 500 }
      );
    }

    const orderWithItems = await getOrderById(order.id);
    if (orderWithItems) {
      sendOrderConfirmationEmail(orderWithItems).catch((err) => {
        console.error('Failed to send order confirmation email:', err);
      });
    }

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid order data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Order creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
