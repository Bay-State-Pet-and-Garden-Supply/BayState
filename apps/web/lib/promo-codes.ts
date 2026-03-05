import { createClient } from '@/lib/supabase/server';

export type DiscountType = 'percentage' | 'fixed_amount' | 'free_shipping';

export interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  minimum_order: number;
  maximum_discount: number | null;
  max_uses: number | null;
  current_uses: number;
  max_uses_per_user: number;
  starts_at: string;
  expires_at: string | null;
  is_active: boolean;
  first_order_only: boolean;
  requires_account: boolean;
  created_at: string;
  updated_at: string;
}

export interface PromoValidationResult {
  valid: boolean;
  error?: string;
  promo?: PromoCode;
  discount?: number;
  discountType?: DiscountType;
}

export interface ApplyPromoInput {
  code: string;
  subtotal: number;
  userId?: string | null;
  email?: string;
  isFirstOrder?: boolean;
}

export async function validatePromoCode(input: ApplyPromoInput): Promise<PromoValidationResult> {
  const supabase = await createClient();
  const codeUpper = input.code.toUpperCase().trim();

  if (!codeUpper) {
    return { valid: false, error: 'Please enter a promo code' };
  }

  const { data: promo, error } = await supabase
    .from('promo_codes')
    .select('*')
    .ilike('code', codeUpper)
    .eq('is_active', true)
    .single();

  if (error || !promo) {
    return { valid: false, error: 'Invalid promo code' };
  }

  const now = new Date();
  const startsAt = new Date(promo.starts_at);
  const expiresAt = promo.expires_at ? new Date(promo.expires_at) : null;

  if (now < startsAt) {
    return { valid: false, error: 'This promo code is not yet active' };
  }

  if (expiresAt && now > expiresAt) {
    return { valid: false, error: 'This promo code has expired' };
  }

  if (promo.max_uses && promo.current_uses >= promo.max_uses) {
    return { valid: false, error: 'This promo code has reached its usage limit' };
  }

  if (promo.minimum_order > 0 && input.subtotal < promo.minimum_order) {
    const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(promo.minimum_order);
    return { valid: false, error: `Minimum order of ${formatted} required` };
  }

  if (promo.requires_account && !input.userId) {
    return { valid: false, error: 'Please sign in to use this promo code' };
  }

  if (promo.first_order_only) {
    if (input.userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_order_completed')
        .eq('id', input.userId)
        .single();

      if (profile?.first_order_completed) {
        return { valid: false, error: 'This code is only valid for first-time orders' };
      }
    }

    const { count: redemptionCount } = await supabase
      .from('promo_redemptions')
      .select('*', { count: 'exact', head: true })
      .eq('promo_code_id', promo.id)
      .or(input.userId ? `user_id.eq.${input.userId}` : `guest_email.ilike.${input.email}`);

    if (redemptionCount && redemptionCount > 0) {
      return { valid: false, error: 'This code is only valid for first-time orders' };
    }
  }

  if (input.userId && promo.max_uses_per_user > 0) {
    const { count } = await supabase
      .from('promo_redemptions')
      .select('*', { count: 'exact', head: true })
      .eq('promo_code_id', promo.id)
      .eq('user_id', input.userId);

    if (count && count >= promo.max_uses_per_user) {
      return { valid: false, error: 'You have already used this promo code' };
    }
  }

  const discount = calculateDiscount(promo, input.subtotal);

  return {
    valid: true,
    promo,
    discount,
    discountType: promo.discount_type as DiscountType,
  };
}

export function calculateDiscount(promo: PromoCode, subtotal: number): number {
  let discount = 0;

  switch (promo.discount_type) {
    case 'percentage':
      discount = subtotal * (promo.discount_value / 100);
      if (promo.maximum_discount) {
        discount = Math.min(discount, promo.maximum_discount);
      }
      break;
    case 'fixed_amount':
      discount = Math.min(promo.discount_value, subtotal);
      break;
    case 'free_shipping':
      discount = 0;
      break;
  }

  return Math.round(discount * 100) / 100;
}

export async function recordPromoRedemption(input: {
  promoCodeId: string;
  orderId: string;
  userId?: string | null;
  guestEmail?: string;
  discountApplied: number;
}): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase.from('promo_redemptions').insert({
    promo_code_id: input.promoCodeId,
    order_id: input.orderId,
    user_id: input.userId || null,
    guest_email: input.userId ? null : input.guestEmail,
    discount_applied: input.discountApplied,
  });

  if (error) {
    console.error('Failed to record promo redemption:', error);
    return false;
  }

  return true;
}

export async function getPromoCodeByCode(code: string): Promise<PromoCode | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('promo_codes')
    .select('*')
    .ilike('code', code.toUpperCase().trim())
    .single();

  if (error || !data) {
    return null;
  }

  return data as PromoCode;
}

export async function getAllPromoCodes(): Promise<PromoCode[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch promo codes:', error);
    return [];
  }

  return data || [];
}

export async function createPromoCode(input: {
  code: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  minimumOrder?: number;
  maximumDiscount?: number;
  maxUses?: number;
  maxUsesPerUser?: number;
  startsAt?: string;
  expiresAt?: string;
  firstOrderOnly?: boolean;
  requiresAccount?: boolean;
  createdBy?: string;
}): Promise<PromoCode | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('promo_codes')
    .insert({
      code: input.code.toUpperCase().trim(),
      description: input.description || null,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      minimum_order: input.minimumOrder || 0,
      maximum_discount: input.maximumDiscount || null,
      max_uses: input.maxUses || null,
      max_uses_per_user: input.maxUsesPerUser || 1,
      starts_at: input.startsAt || new Date().toISOString(),
      expires_at: input.expiresAt || null,
      first_order_only: input.firstOrderOnly || false,
      requires_account: input.requiresAccount || false,
      created_by: input.createdBy || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create promo code:', error);
    return null;
  }

  return data as PromoCode;
}

export async function updatePromoCode(
  id: string,
  updates: Partial<{
    code: string;
    description: string;
    discountType: DiscountType;
    discountValue: number;
    minimumOrder: number;
    maximumDiscount: number | null;
    maxUses: number | null;
    maxUsesPerUser: number;
    startsAt: string;
    expiresAt: string | null;
    isActive: boolean;
    firstOrderOnly: boolean;
    requiresAccount: boolean;
  }>
): Promise<boolean> {
  const supabase = await createClient();

  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.code !== undefined) dbUpdates.code = updates.code.toUpperCase().trim();
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.discountType !== undefined) dbUpdates.discount_type = updates.discountType;
  if (updates.discountValue !== undefined) dbUpdates.discount_value = updates.discountValue;
  if (updates.minimumOrder !== undefined) dbUpdates.minimum_order = updates.minimumOrder;
  if (updates.maximumDiscount !== undefined) dbUpdates.maximum_discount = updates.maximumDiscount;
  if (updates.maxUses !== undefined) dbUpdates.max_uses = updates.maxUses;
  if (updates.maxUsesPerUser !== undefined) dbUpdates.max_uses_per_user = updates.maxUsesPerUser;
  if (updates.startsAt !== undefined) dbUpdates.starts_at = updates.startsAt;
  if (updates.expiresAt !== undefined) dbUpdates.expires_at = updates.expiresAt;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
  if (updates.firstOrderOnly !== undefined) dbUpdates.first_order_only = updates.firstOrderOnly;
  if (updates.requiresAccount !== undefined) dbUpdates.requires_account = updates.requiresAccount;

  const { error } = await supabase
    .from('promo_codes')
    .update(dbUpdates)
    .eq('id', id);

  if (error) {
    console.error('Failed to update promo code:', error);
    return false;
  }

  return true;
}

export async function deletePromoCode(id: string): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('promo_codes')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete promo code:', error);
    return false;
  }

  return true;
}
