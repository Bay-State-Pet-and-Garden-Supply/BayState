'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { ScraperRunRecord, scrapeJobStatusSchema } from './runs-types';

export async function getScraperRuns(options?: {
  limit?: number;
  offset?: number;
  scraperName?: string;
  status?: string;
}): Promise<{ runs: ScraperRunRecord[]; totalCount: number }> {
  const supabase = await createClient();
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let query = supabase
    .from('scrape_jobs')
    .select(`
      id,
      scrapers,
      status,
      skus,
      github_run_id,
      created_at,
      completed_at,
      error_message,
      created_by
    `, { count: 'exact' });

  // Filter by scraper name if provided
  if (options?.scraperName) {
    query = query.eq('scrapers', [options.scraperName]);
  }

  // Filter by status if provided
  if (options?.status) {
    query = query.eq('status', options.status);
  }

  // Order by creation date descending and paginate
  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching scraper runs:', error);
    throw new Error('Failed to fetch scraper runs');
  }

  // Transform data to include computed fields
  const runs: ScraperRunRecord[] = (data || []).map((job) => ({
    id: job.id,
    scraper_name: Array.isArray(job.scrapers) ? job.scrapers[0] ?? 'unknown' : 'unknown',
    status: scrapeJobStatusSchema.parse(job.status),
    skus: job.skus || [],
    total_skus: Array.isArray(job.skus) ? job.skus.length : 0,
    completed_skus: 0, // Would need to query scrape_results to get this
    failed_skus: 0, // Would need to query scrape_results to get this
    items_found: 0,
    started_at: null,
    completed_at: job.completed_at,
    created_at: job.created_at,
    updated_at: job.created_at,
    error_message: job.error_message,
    test_mode: false,
  }));

  return { runs, totalCount: count || 0 };
}

export async function getScraperRunById(id: string): Promise<ScraperRunRecord | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scrape_jobs')
    .select(`
      id,
      scrapers,
      status,
      skus,
      github_run_id,
      created_at,
      completed_at,
      error_message,
      created_by
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error(`Error fetching scraper run ${id}:`, error);
    return null;
  }

  return {
    id: data.id,
    scraper_name: Array.isArray(data.scrapers) ? data.scrapers[0] ?? 'unknown' : 'unknown',
    status: scrapeJobStatusSchema.parse(data.status),
    skus: data.skus || [],
    total_skus: Array.isArray(data.skus) ? data.skus.length : 0,
    completed_skus: 0,
    failed_skus: 0,
    items_found: 0,
    started_at: null,
    completed_at: data.completed_at,
    created_at: data.created_at,
    updated_at: data.created_at,
    error_message: data.error_message,
    test_mode: false,
  };
}

export async function cancelScraperRun(jobId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('scrape_jobs')
    .update({ status: 'cancelled' })
    .eq('id', jobId);

  if (error) {
    console.error(`Error cancelling scraper run ${jobId}:`, error);
    return { error: 'Failed to cancel scraper run' };
  }

  revalidatePath('/admin/scrapers/runs');
  return { success: true };
}

export async function retryScraperRun(jobId: string) {
  const supabase = await createClient();

  // Get the original job
  const { data: originalJob, error: fetchError } = await supabase
    .from('scrape_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (fetchError || !originalJob) {
    return { error: 'Original job not found' };
  }

  // Create a new job with the same parameters
  const { data: newJob, error: createError } = await supabase
    .from('scrape_jobs')
    .insert({
      skus: originalJob.skus,
      scrapers: originalJob.scrapers,
      test_mode: originalJob.test_mode,
      max_workers: originalJob.max_workers,
      status: 'pending',
    })
    .select()
    .single();

  if (createError) {
    console.error('Error retrying scraper run:', createError);
    return { error: 'Failed to retry scraper run' };
  }

  revalidatePath('/admin/scrapers/runs');
  return { success: true, newJobId: newJob.id };
}
