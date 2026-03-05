import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import * as z from 'zod';

const subscribeSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  firstName: z.string().optional(),
  source: z.string().optional().default('footer'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, firstName, source } = subscribeSchema.parse(body);

    const supabase = await createClient();

    const { data: existing } = await supabase
      .from('email_subscribers')
      .select('id, unsubscribed_at')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      if (existing.unsubscribed_at) {
        await supabase
          .from('email_subscribers')
          .update({
            unsubscribed_at: null,
            subscribed_at: new Date().toISOString(),
            source,
          })
          .eq('id', existing.id);

        return NextResponse.json({ 
          success: true, 
          message: 'Welcome back! You have been re-subscribed.' 
        });
      }

      return NextResponse.json({ 
        success: true, 
        message: 'You are already subscribed!' 
      });
    }

    const { error } = await supabase.from('email_subscribers').insert({
      email: email.toLowerCase(),
      first_name: firstName || null,
      source,
    });

    if (error) {
      console.error('Newsletter subscription error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to subscribe. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Thanks for subscribing!',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message || 'Invalid email' },
        { status: 400 }
      );
    }

    console.error('Newsletter subscription error:', error);
    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
