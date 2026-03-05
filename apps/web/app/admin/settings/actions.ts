'use server';

import { revalidatePath } from 'next/cache';
import { updateCampaignBanner, type CampaignBannerSettings, type BannerMessage } from '@/lib/settings';

export async function updateCampaignBannerAction(formData: FormData) {
  // Parse messages from JSON string
  const messagesJson = formData.get('messages') as string;
  let messages: BannerMessage[] = [];

  try {
    messages = messagesJson ? JSON.parse(messagesJson) : [];
  } catch {
    messages = [];
  }

  const settings: CampaignBannerSettings = {
    enabled: formData.get('enabled') === 'on',
    messages,
    variant: (formData.get('variant') as 'info' | 'promo' | 'seasonal') || 'info',
    cycleInterval: parseInt(formData.get('cycleInterval') as string, 10) || 5000,
  };

  const success = await updateCampaignBanner(settings);

  if (!success) {
    throw new Error('Failed to update campaign banner');
  }

  revalidatePath('/admin/settings');
  revalidatePath('/'); // Revalidate storefront to show updated banner
}
