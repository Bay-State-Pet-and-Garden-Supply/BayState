'use server';

import { getLocalScraperConfig } from '@/lib/admin/scrapers/configs';
import { ScraperConfig } from '@/lib/admin/scrapers/types';

export async function getScraperBySlug(slug: string): Promise<ScraperConfig | null> {
  const result = await getLocalScraperConfig(slug);
  return result?.config || null;
}
