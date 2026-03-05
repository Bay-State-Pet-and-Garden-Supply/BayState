'use server';

import { createClient } from '@/lib/supabase/server';
import { ScraperConfig } from '@/lib/admin/scrapers/types';

export async function getScraperBySlug(slug: string): Promise<ScraperConfig | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scraper_configs')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') { // PGRST116 is not found
      console.error('Database Error:', error);
    }
    return null;
  }

  return data as ScraperConfig;
}
