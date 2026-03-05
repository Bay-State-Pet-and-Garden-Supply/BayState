import { NextResponse } from 'next/server';
import { validatePromoCode } from '@/lib/promo-codes';
import * as z from 'zod';

const validateSchema = z.object({
  code: z.string().min(1),
  subtotal: z.number().min(0),
  userId: z.string().uuid().optional().nullable(),
  email: z.string().email().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code, subtotal, userId, email } = validateSchema.parse(body);

    const result = await validatePromoCode({
      code,
      subtotal,
      userId,
      email,
    });

    if (!result.valid) {
      return NextResponse.json(
        { valid: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      code: result.promo?.code,
      discount: result.discount,
      discountType: result.discountType,
      description: result.promo?.description,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { valid: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }

    console.error('Promo validation error:', error);
    return NextResponse.json(
      { valid: false, error: 'Failed to validate promo code' },
      { status: 500 }
    );
  }
}
