'use server';

import { createPromoCode, updatePromoCode, deletePromoCode, type DiscountType } from '@/lib/promo-codes';
import { revalidatePath } from 'next/cache';

export async function createPromoCodeAction(formData: FormData) {
  const code = formData.get('code') as string;
  const description = formData.get('description') as string;
  const discountType = formData.get('discountType') as DiscountType;
  const discountValue = parseFloat(formData.get('discountValue') as string);
  const minimumOrder = parseFloat(formData.get('minimumOrder') as string) || 0;
  const maximumDiscount = formData.get('maximumDiscount') 
    ? parseFloat(formData.get('maximumDiscount') as string) 
    : undefined;
  const maxUses = formData.get('maxUses') 
    ? parseInt(formData.get('maxUses') as string) 
    : undefined;
  const maxUsesPerUser = parseInt(formData.get('maxUsesPerUser') as string) || 1;
  const expiresAt = formData.get('expiresAt') as string || undefined;
  const firstOrderOnly = formData.get('firstOrderOnly') === 'on';
  const requiresAccount = formData.get('requiresAccount') === 'on';

  const promo = await createPromoCode({
    code,
    description,
    discountType,
    discountValue,
    minimumOrder,
    maximumDiscount,
    maxUses,
    maxUsesPerUser,
    expiresAt: expiresAt || undefined,
    firstOrderOnly,
    requiresAccount,
  });

  if (!promo) {
    return { success: false, error: 'Failed to create promo code' };
  }

  revalidatePath('/admin/promotions');
  return { success: true };
}

export async function updatePromoCodeAction(id: string, formData: FormData) {
  const isActive = formData.get('isActive') === 'on';

  const success = await updatePromoCode(id, { isActive });

  if (!success) {
    return { success: false, error: 'Failed to update promo code' };
  }

  revalidatePath('/admin/promotions');
  return { success: true };
}

export async function deletePromoCodeAction(id: string) {
  const success = await deletePromoCode(id);

  if (!success) {
    return { success: false, error: 'Failed to delete promo code' };
  }

  revalidatePath('/admin/promotions');
  return { success: true };
}
