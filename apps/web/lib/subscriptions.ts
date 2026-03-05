import { createClient } from '@/lib/supabase/server';
import type { Product } from '@/lib/types';

export type SubscriptionFrequency = 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';

export interface Subscription {
  id: string;
  user_id: string;
  name: string;
  frequency: SubscriptionFrequency;
  status: SubscriptionStatus;
  next_order_date: string;
  last_order_date: string | null;
  shipping_address_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items?: SubscriptionItem[];
}

export interface SubscriptionItem {
  id: string;
  subscription_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  product?: Product;
}

export interface SubscriptionSuggestion {
  id: string;
  subscription_id: string;
  product_id: string;
  pet_id: string | null;
  reason: string | null;
  is_dismissed: boolean;
  created_at: string;
  product?: Product;
  petName?: string;
}

export const FREQUENCY_LABELS: Record<SubscriptionFrequency, string> = {
  weekly: 'Every Week',
  biweekly: 'Every 2 Weeks',
  monthly: 'Every Month',
  bimonthly: 'Every 2 Months',
  quarterly: 'Every 3 Months',
};

export async function getUserSubscriptions(userId: string): Promise<Subscription[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('subscriptions')
    .select(`
      *,
      items:subscription_items(
        *,
        product:products(id, name, slug, price, images, stock_status)
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching subscriptions:', error);
    return [];
  }

  return data || [];
}

export async function getSubscriptionById(
  subscriptionId: string,
  userId: string
): Promise<Subscription | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('subscriptions')
    .select(`
      *,
      items:subscription_items(
        *,
        product:products(id, name, slug, price, images, stock_status)
      )
    `)
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Error fetching subscription:', error);
    return null;
  }

  return data;
}

export async function createSubscription(input: {
  userId: string;
  name?: string;
  frequency?: SubscriptionFrequency;
  items: { productId: string; quantity: number }[];
}): Promise<Subscription | null> {
  const supabase = await createClient();

  const nextOrderDate = calculateNextOrderDate(
    new Date(),
    input.frequency || 'monthly'
  );

  const { data: subscription, error: subError } = await supabase
    .from('subscriptions')
    .insert({
      user_id: input.userId,
      name: input.name || 'My Autoship',
      frequency: input.frequency || 'monthly',
      next_order_date: nextOrderDate.toISOString().split('T')[0],
    })
    .select()
    .single();

  if (subError || !subscription) {
    console.error('Error creating subscription:', subError);
    return null;
  }

  if (input.items.length > 0) {
    const items = input.items.map((item) => ({
      subscription_id: subscription.id,
      product_id: item.productId,
      quantity: item.quantity,
    }));

    const { error: itemsError } = await supabase
      .from('subscription_items')
      .insert(items);

    if (itemsError) {
      console.error('Error adding subscription items:', itemsError);
    }
  }

  await supabase.rpc('generate_subscription_suggestions', {
    p_subscription_id: subscription.id,
  });

  return subscription;
}

export async function updateSubscription(
  subscriptionId: string,
  userId: string,
  updates: {
    name?: string;
    frequency?: SubscriptionFrequency;
    status?: SubscriptionStatus;
    notes?: string;
  }
): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('subscriptions')
    .update(updates)
    .eq('id', subscriptionId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error updating subscription:', error);
    return false;
  }

  return true;
}

export async function addSubscriptionItem(
  subscriptionId: string,
  userId: string,
  productId: string,
  quantity: number
): Promise<boolean> {
  const supabase = await createClient();

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .single();

  if (!subscription) {
    return false;
  }

  const { error } = await supabase
    .from('subscription_items')
    .upsert(
      {
        subscription_id: subscriptionId,
        product_id: productId,
        quantity,
      },
      { onConflict: 'subscription_id,product_id' }
    );

  if (error) {
    console.error('Error adding subscription item:', error);
    return false;
  }

  return true;
}

export async function removeSubscriptionItem(
  subscriptionId: string,
  userId: string,
  productId: string
): Promise<boolean> {
  const supabase = await createClient();

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .single();

  if (!subscription) {
    return false;
  }

  const { error } = await supabase
    .from('subscription_items')
    .delete()
    .eq('subscription_id', subscriptionId)
    .eq('product_id', productId);

  if (error) {
    console.error('Error removing subscription item:', error);
    return false;
  }

  return true;
}

export async function getSubscriptionSuggestions(
  subscriptionId: string,
  userId: string
): Promise<SubscriptionSuggestion[]> {
  const supabase = await createClient();

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .single();

  if (!subscription) {
    return [];
  }

  const { data, error } = await supabase
    .from('subscription_suggestions')
    .select(`
      *,
      product:products(id, name, slug, price, images, stock_status),
      pet:user_pets(name)
    `)
    .eq('subscription_id', subscriptionId)
    .eq('is_dismissed', false)
    .limit(10);

  if (error) {
    console.error('Error fetching suggestions:', error);
    return [];
  }

  return (data || []).map((s) => ({
    ...s,
    petName: s.pet?.name,
  }));
}

export async function dismissSuggestion(
  suggestionId: string,
  userId: string
): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('subscription_suggestions')
    .update({ is_dismissed: true })
    .eq('id', suggestionId)
    .eq(
      'subscription_id',
      supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
    );

  if (error) {
    console.error('Error dismissing suggestion:', error);
    return false;
  }

  return true;
}

function calculateNextOrderDate(
  fromDate: Date,
  frequency: SubscriptionFrequency
): Date {
  const result = new Date(fromDate);

  switch (frequency) {
    case 'weekly':
      result.setDate(result.getDate() + 7);
      break;
    case 'biweekly':
      result.setDate(result.getDate() + 14);
      break;
    case 'monthly':
      result.setMonth(result.getMonth() + 1);
      break;
    case 'bimonthly':
      result.setMonth(result.getMonth() + 2);
      break;
    case 'quarterly':
      result.setMonth(result.getMonth() + 3);
      break;
  }

  return result;
}
