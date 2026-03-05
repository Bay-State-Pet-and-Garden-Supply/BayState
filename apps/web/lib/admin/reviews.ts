'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ProductReview, ReviewStatus } from '@/lib/types';

export interface ReviewWithProduct extends ProductReview {
  product: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export async function getReviews(options?: {
  status?: ReviewStatus;
  productId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ reviews: ReviewWithProduct[]; count: number }> {
  const supabase = await createClient();
  
  let query = supabase
    .from('product_reviews')
    .select(`
      *,
      product:products(id, name, slug),
      user:profiles(full_name)
    `, { count: 'exact' });
  
  if (options?.status) {
    query = query.eq('status', options.status);
  }
  
  if (options?.productId) {
    query = query.eq('product_id', options.productId);
  }
  
  query = query.order('created_at', { ascending: false });
  
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);
  
  const { data, error, count } = await query;
  
  if (error) {
    console.error('Error fetching reviews:', error);
    return { reviews: [], count: 0 };
  }
  
  return {
    reviews: (data || []) as ReviewWithProduct[],
    count: count || 0,
  };
}

export async function updateReviewStatus(
  reviewId: string,
  status: ReviewStatus
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('product_reviews')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', reviewId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath('/admin/reviews');
  return { success: true };
}

export async function deleteReview(
  reviewId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('product_reviews')
    .delete()
    .eq('id', reviewId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath('/admin/reviews');
  return { success: true };
}

export async function getReviewStats(): Promise<{
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}> {
  const supabase = await createClient();
  
  const [pending, approved, rejected] = await Promise.all([
    supabase.from('product_reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('product_reviews').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('product_reviews').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
  ]);
  
  return {
    pending: pending.count || 0,
    approved: approved.count || 0,
    rejected: rejected.count || 0,
    total: (pending.count || 0) + (approved.count || 0) + (rejected.count || 0),
  };
}
