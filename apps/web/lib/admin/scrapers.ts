'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface Scraper {
  id: string;
  name: string;
  display_name: string | null;
  base_url: string;
  url_template: string | null;
  requires_auth: boolean;
  status: 'healthy' | 'degraded' | 'broken' | 'unknown';
  disabled: boolean;
  last_tested: string | null;
  test_results: unknown | null;
  selectors: unknown | null;
  workflows: unknown | null;
  created_at: string;
  updated_at: string;
}

export async function getScrapers(): Promise<Scraper[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scrapers')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching scrapers:', error);
    throw new Error('Failed to fetch scrapers');
  }

  return data as Scraper[];
}

export async function getScraperByName(name: string): Promise<Scraper | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scrapers')
    .select('*')
    .eq('name', name)
    .single();

  if (error) {
    console.error(`Error fetching scraper ${name}:`, error);
    return null;
  }

  return data as Scraper;
}

export async function updateScraperStatus(name: string, disabled: boolean) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('scrapers')
    .update({ disabled })
    .eq('name', name);

  if (error) {
    console.error(`Error updating scraper status ${name}:`, error);
    throw new Error('Failed to update scraper status');
  }

  revalidatePath('/admin/scrapers');
}

/**
 * Creates a test job for a scraper. Daemon runners will pick it up
 * and process it automatically.
 */
export async function testScraper(name: string, sku: string) {
  const supabase = await createClient();

  // 1. Get scraper by name
  const scraper = await getScraperByName(name);
  if (!scraper) {
    return { error: 'Scraper not found' };
  }

  // 2. Create a scrape job with test_mode=true
  const TEST_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  const timeoutAt = new Date(Date.now() + TEST_TIMEOUT_MS).toISOString();

  const { data: job, error: jobError } = await supabase
    .from('scrape_jobs')
    .insert({
      skus: [sku],
      scrapers: [scraper.name],
      test_mode: true,
      max_workers: 1,
      status: 'pending',
      timeout_at: timeoutAt,
      test_metadata: {
        test_type: 'manual',
        scraper_name: scraper.name,
      },
    })
    .select('id')
    .single();

  if (jobError || !job) {
    console.error('Failed to create test job:', jobError);
    return { error: 'Failed to create test job' };
  }

  console.log(`[testScraper] Created test job ${job.id} for ${scraper.name} with SKU: ${sku}`);

  return {
    success: true,
    jobId: job.id,
  };
}
