'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { scraperConfigSchema } from '@/lib/admin/scrapers/schema';
import { ScraperConfig } from '@/lib/admin/scrapers/types';

export type ActionState = {
  success: boolean;
  error?: string;
  data?: unknown;
};

export async function createScraper(
  name: string,
  baseUrl: string,
  displayName?: string
): Promise<ActionState> {
  const supabase = await createClient();

  // Create minimal valid config
  const config: ScraperConfig = {
    schema_version: "1.0",
    name,
    display_name: displayName || name,
    base_url: baseUrl,
    selectors: [],
    workflows: [],
    timeout: 30,
    retries: 3,
    image_quality: 50,
    test_skus: [],
    fake_skus: [],
  };

  // Validate config
  const parseResult = scraperConfigSchema.safeParse(config);
  if (!parseResult.success) {
    return {
      success: false,
      error: 'Invalid configuration: ' + parseResult.error.issues[0].message,
    };
  }

  const { data, error } = await supabase
    .from('scrapers')
    .insert({
      name,
      display_name: displayName || name,
      base_url: baseUrl,
      config: parseResult.data,
      status: 'draft',
      health_status: 'unknown',
      health_score: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('Database Error:', error);
    return { success: false, error: 'Failed to create scraper: ' + error.message };
  }

  revalidatePath('/admin/scrapers');
  return { success: true, data };
}

export async function updateScraper(
  id: string,
  updates: {
    name?: string;
    display_name?: string;
    base_url?: string;
    status?: 'draft' | 'active' | 'disabled' | 'archived';
    config?: ScraperConfig;
  }
): Promise<ActionState> {
  const supabase = await createClient();

  // If config is provided, validate it
  if (updates.config) {
    const parseResult = scraperConfigSchema.safeParse(updates.config);
    if (!parseResult.success) {
      return {
        success: false,
        error: 'Invalid configuration: ' + parseResult.error.issues[0].message,
      };
    }
    updates.config = parseResult.data as ScraperConfig;
  }

  const { error } = await supabase
    .from('scrapers')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Database Error:', error);
    return { success: false, error: 'Failed to update scraper: ' + error.message };
  }

  revalidatePath('/admin/scrapers');
  return { success: true };
}

export async function deleteScraper(id: string): Promise<ActionState> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('scrapers')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Database Error:', error);
    return { success: false, error: 'Failed to delete scraper: ' + error.message };
  }

  revalidatePath('/admin/scrapers');
  return { success: true };
}

export async function duplicateScraper(id: string): Promise<ActionState> {
  const supabase = await createClient();

  // Fetch original scraper
  const { data: original, error: fetchError } = await supabase
    .from('scrapers')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !original) {
    return { success: false, error: 'Failed to find scraper to duplicate' };
  }

  // Create new scraper with copied config
  const newName = `${original.name}_copy`;
  const { data, error } = await supabase
    .from('scrapers')
    .insert({
      name: newName,
      display_name: `${original.display_name || original.name} (Copy)`,
      base_url: original.base_url,
      config: original.config,
      status: 'draft',
      health_status: 'unknown',
      health_score: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('Database Error:', error);
    return { success: false, error: 'Failed to duplicate scraper: ' + error.message };
  }

  revalidatePath('/admin/scrapers');
  return { success: true, data };
}

export async function updateScraperStatus(
  id: string,
  status: 'draft' | 'active' | 'disabled' | 'archived'
): Promise<ActionState> {
  return updateScraper(id, { status });
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
