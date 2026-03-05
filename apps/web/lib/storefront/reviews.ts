'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ProductReview } from '@/lib/types';

export type ReviewWithUser = Omit<ProductReview, 'user'> & {
  user: { full_name: string | null } | null;
};

export async function getApprovedReviews(productId: string): Promise<ReviewWithUser[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('product_reviews')
    .select(`
      *,
      user:profiles!product_reviews_user_profile_fkey(full_name)
    `)
    .eq('product_id', productId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching reviews:', error);
    return [];
  }

  return data as ReviewWithUser[];
}

export async function getProductReviewStats(productId: string): Promise<{
  avgRating: number;
  totalReviews: number;
  distribution: { rating: number; count: number }[];
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('product_reviews')
    .select('rating')
    .eq('product_id', productId)
    .eq('status', 'approved');

  if (error || !data || data.length === 0) {
    return {
      avgRating: 0,
      totalReviews: 0,
      distribution: [
        { rating: 5, count: 0 },
        { rating: 4, count: 0 },
        { rating: 3, count: 0 },
        { rating: 2, count: 0 },
        { rating: 1, count: 0 },
      ],
    };
  }

  const total = data.length;
  const sum = data.reduce((acc, r) => acc + r.rating, 0);
  const avg = sum / total;

  const distribution = [5, 4, 3, 2, 1].map(rating => ({
    rating,
    count: data.filter(r => r.rating === rating).length,
  }));

  return {
    avgRating: Math.round(avg * 10) / 10,
    totalReviews: total,
    distribution,
  };
}

export interface SubmitReviewInput {
  productId: string;
  productSlug: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title?: string;
  content?: string;
  pros?: string[];
  cons?: string[];
}

export async function submitReview(
  input: SubmitReviewInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Please sign in to submit a review' };
  }

  const { data: existingReview } = await supabase
    .from('product_reviews')
    .select('id')
    .eq('product_id', input.productId)
    .eq('user_id', user.id)
    .single();

  if (existingReview) {
    return { success: false, error: 'You have already reviewed this product' };
  }

  const { data: hasPurchased } = await supabase
    .from('order_items')
    .select('id, order:orders!inner(user_id, status)')
    .eq('product_id', input.productId)
    .eq('order.user_id', user.id)
    .eq('order.status', 'delivered')
    .limit(1);

  const isVerifiedPurchase = (hasPurchased?.length ?? 0) > 0;

  const { error } = await supabase
    .from('product_reviews')
    .insert({
      product_id: input.productId,
      user_id: user.id,
      rating: input.rating,
      title: input.title?.trim() || null,
      content: input.content?.trim() || null,
      pros: input.pros?.filter(p => p.trim()) || null,
      cons: input.cons?.filter(c => c.trim()) || null,
      is_verified_purchase: isVerifiedPurchase,
      status: 'pending',
    });

  if (error) {
    console.error('Error submitting review:', error);
    return { success: false, error: 'Failed to submit review' };
  }

  revalidatePath(`/products/${input.productSlug}`);
  return { success: true };
}

export async function hasUserReviewedProduct(productId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return false;

  const { data } = await supabase
    .from('product_reviews')
    .select('id')
    .eq('product_id', productId)
    .eq('user_id', user.id)
    .single();

  return !!data;
}
