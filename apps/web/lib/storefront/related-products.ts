'use server';

import { createClient } from '@/lib/supabase/server';
import type { Product, RelationType } from '@/lib/types';

export interface RelatedProductWithDetails {
  id: string;
  name: string;
  slug: string;
  price: number;
  images: string[];
  stock_status: 'in_stock' | 'out_of_stock' | 'pre_order';
  relation_type: RelationType;
}

export async function getRelatedProducts(
  productId: string,
  relationTypes?: RelationType[]
): Promise<RelatedProductWithDetails[]> {
  const supabase = await createClient();

  let query = supabase
    .from('related_products')
    .select(`
      relation_type,
      position,
      related_product:products!related_products_related_product_id_fkey(
        id,
        name,
        slug,
        price,
        images,
        stock_status
      )
    `)
    .eq('product_id', productId)
    .order('position');

  if (relationTypes && relationTypes.length > 0) {
    query = query.in('relation_type', relationTypes);
  }

  const { data, error } = await query.limit(8);

  if (error) {
    console.error('Error fetching related products:', error);
    return [];
  }

  return (data || [])
    .filter((item) => {
      const product = Array.isArray(item.related_product) ? item.related_product[0] : item.related_product;
      return !!product;
    })
    .map((item) => {
      const product = Array.isArray(item.related_product) ? item.related_product[0] : item.related_product;
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
        relation_type: item.relation_type as RelationType,
      };
    });
}

export async function getFrequentlyBoughtTogether(
  productId: string,
  limit = 4
): Promise<RelatedProductWithDetails[]> {
  return getRelatedProducts(productId, ['frequently_bought', 'bundle']);
}

export async function getUpsellProducts(
  productId: string,
  limit = 4
): Promise<RelatedProductWithDetails[]> {
  return getRelatedProducts(productId, ['upsell', 'cross_sell']);
}
