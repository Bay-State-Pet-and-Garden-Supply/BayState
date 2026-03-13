'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { ScraperConfig } from '@/lib/admin/scrapers/types';

export type ActionState = {
  success: boolean;
  error?: string;
  data?: unknown;
};

/**
 * DEPRECATED: Use YAML-based config instead.
 * Scraper creation is now done by adding YAML files to the repository.
 */
export async function createScraper(): Promise<ActionState> {
  return { success: false, error: 'UI-based scraper creation is deprecated. Please add a YAML file to the repository instead.' };
}

/**
 * DEPRECATED: Use YAML-based config instead.
 */
export async function updateScraper(): Promise<ActionState> {
  return { success: false, error: 'UI-based scraper editing is deprecated. Please edit the YAML file in the repository instead.' };
}

/**
 * DEPRECATED: Use YAML-based config instead.
 */
export async function deleteScraper(): Promise<ActionState> {
  return { success: false, error: 'UI-based scraper deletion is deprecated. Please remove the YAML file from the repository instead.' };
}

/**
 * DEPRECATED: Use YAML-based config instead.
 */
export async function duplicateScraper(): Promise<ActionState> {
  return { success: false, error: 'UI-based scraper duplication is deprecated. Please copy the YAML file in the repository instead.' };
}

export async function updateScraperStatus(
  id: string,
  status: 'draft' | 'active' | 'disabled' | 'archived'
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('scrapers')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Database Error:', error);
    return { success: false, error: 'Failed to update scraper status: ' + error.message };
  }

  revalidatePath('/admin/scrapers/list');
  return { success: true };
}

export async function getScraperById(id: string): Promise<ActionState> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scrapers')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Database Error:', error);
    return { success: false, error: 'Failed to fetch scraper' };
  }

  return { success: true, data };
}
