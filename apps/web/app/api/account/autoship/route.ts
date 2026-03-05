import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createSubscription, getUserSubscriptions } from '@/lib/subscriptions';
import * as z from 'zod';

const createSchema = z.object({
  name: z.string().optional(),
  frequency: z.enum(['weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly']).optional(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
    })
  ).min(1),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const subscriptions = await getUserSubscriptions(user.id);
  return NextResponse.json({ subscriptions });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = createSchema.parse(body);

    const subscription = await createSubscription({
      userId: user.id,
      name: validatedData.name,
      frequency: validatedData.frequency,
      items: validatedData.items,
    });

    if (!subscription) {
      return NextResponse.json(
        { error: 'Failed to create subscription' },
        { status: 500 }
      );
    }

    return NextResponse.json({ subscription }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Subscription creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
