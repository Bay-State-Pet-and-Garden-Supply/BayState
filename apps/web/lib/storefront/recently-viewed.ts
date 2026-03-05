'use server';

import { createClient } from '@/lib/supabase/server';

export interface RecentlyViewedProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  images: string[];
  stock_status: 'in_stock' | 'out_of_stock' | 'pre_order';
  viewed_at: string;
}

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

export async function getRecentlyViewedProducts(
  excludeProductId?: string,
  limit = 8
): Promise<RecentlyViewedProduct[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];

  const query = supabase
    .from('recently_viewed')
    .select(`
      viewed_at,
      product:products(
        id,
        name,
        slug,
        price,
        images,
        stock_status
      )
    `)
    .eq('user_id', user.id)
    .order('viewed_at', { ascending: false })
    .limit(limit + 1);

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching recently viewed:', error);
    return [];
  }

  return (data || [])
    .filter((item) => {
      const product = Array.isArray(item.product) ? item.product[0] : item.product;
      if (!product) return false;
      if (excludeProductId && product.id === excludeProductId) return false;
      return true;
    })
    .slice(0, limit)
    .map((item) => {
      const product = Array.isArray(item.product) ? item.product[0] : item.product;
      const p = product as {
        id: string;
        name: string;
        slug: string;
        price: number;
        images: string[];
        stock_status: 'in_stock' | 'out_of_stock' | 'pre_order';
      };
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        price: p.price,
        images: p.images || [],
        stock_status: p.stock_status,
        viewed_at: item.viewed_at,
      };
    });
}
