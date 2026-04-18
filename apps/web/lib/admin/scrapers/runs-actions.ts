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
  const nowIso = new Date().toISOString();

  // 1. Update the job status
  const { error: jobError } = await supabase
    .from('scrape_jobs')
    .update({ 
      status: 'cancelled',
      completed_at: nowIso,
      updated_at: nowIso
    })
    .eq('id', jobId);

  if (jobError) {
    console.error(`Error cancelling scraper run ${jobId}:`, jobError);
    return { error: 'Failed to cancel scraper run' };
  }

  // 2. Update all chunks for this job that are not in a terminal state
  const { error: chunkError } = await supabase
    .from('scrape_job_chunks')
    .update({ 
      status: 'failed',
      error_message: 'Job was cancelled',
      completed_at: nowIso,
      updated_at: nowIso
    })
    .eq('job_id', jobId)
    .in('status', ['pending', 'running']);

  if (chunkError) {
    console.warn(`Warning: Failed to update chunks for cancelled job ${jobId}:`, chunkError);
  }

  // 3. Revert product pipeline status for products in this job
  // Fetch the job to get the SKUs
  const { data: jobData, error: fetchError } = await supabase
    .from('scrape_jobs')
    .select('skus')
    .eq('id', jobId)
    .single();

  if (!fetchError && jobData?.skus) {
    const { error: productError } = await supabase
      .from('products_ingestion')
      .update({
        pipeline_status: 'imported',
        updated_at: nowIso,
        error_message: 'Job was cancelled'
      })
      .in('sku', jobData.skus)
      .eq('pipeline_status', 'scraping');

    if (productError) {
      console.warn(`Warning: Failed to revert product status for cancelled job ${jobId}:`, productError);
    }
  }

  revalidatePath('/admin/scrapers/runs');
  revalidatePath('/admin/pipeline');
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
