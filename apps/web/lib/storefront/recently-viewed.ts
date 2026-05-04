'use server';

import { createClient } from '@/lib/supabase/server';

export async function trackProductView(productId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return;

  const { error } = await supabase
    .from('recently_viewed')
    .upsert(
      {
        user_id: user.id,
        product_id: productId,
        viewed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,product_id' }
    );

  if (error) {
    console.error('Error tracking product view:', error);
  }
}
