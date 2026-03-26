'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { ScraperRunRecord } from '@/lib/admin/scrapers/runs-types';
import { normalizeScrapeLogEntry, type ScrapeJobLogEntry } from '@/lib/scraper-logs';

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
    .select(
      `
      id,
      scrapers,
      status,
      skus,
      test_mode,
      max_workers,
      created_at,
      completed_at,
      error_message,
      created_by
    `,
      { count: 'exact' }
    );

  if (options?.scraperName) {
    query = query.contains('scrapers', [options.scraperName]);
  }

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching scraper runs:', error);
    throw new Error('Failed to fetch scraper runs');
  }

  const runs: ScraperRunRecord[] = (data || []).map((job) => ({
    id: job.id,
    scraper_name: Array.isArray(job.scrapers) ? job.scrapers[0] ?? 'unknown' : 'unknown',
    status: job.status,
    skus: job.skus || [],
    total_skus: Array.isArray(job.skus) ? job.skus.length : 0,
    completed_skus: 0,
    failed_skus: 0,
    items_found: 0,
    started_at: null,
    completed_at: job.completed_at,
    created_at: job.created_at,
    updated_at: job.created_at,
    error_message: job.error_message,
    test_mode: job.test_mode || false,
  }));

  return { runs, totalCount: count || 0 };
}

export async function getScraperRunById(id: string): Promise<ScraperRunRecord | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scrape_jobs')
    .select(
      `
      id,
      scrapers,
      status,
      skus,
      test_mode,
      github_run_id,
      created_at,
      completed_at,
      error_message,
      created_by
    `
    )
    .eq('id', id)
    .single();

  if (error) {
    console.error(`Error fetching scraper run ${id}:`, error);
    return null;
  }

  return {
    id: data.id,
    scraper_name: Array.isArray(data.scrapers) ? data.scrapers[0] ?? 'unknown' : 'unknown',
    status: data.status,
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
    test_mode: data.test_mode || false,
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

  revalidatePath('/admin/scrapers/runs');
  revalidatePath(`/admin/scrapers/runs/${jobId}`);
  return { success: true };
}

export async function retryScraperRun(jobId: string) {
  const supabase = await createClient();

  const { data: originalJob, error: fetchError } = await supabase
    .from('scrape_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (fetchError || !originalJob) {
    return { error: 'Original job not found' };
  }

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

  if (createError || !newJob) {
    console.error('Error retrying scraper run:', createError);
    return { error: 'Failed to retry scraper run' };
  }

  const scrapers = originalJob.scrapers || [];
  if (scrapers.length > 0) {
    const chunks = scrapers.map((scraperName: string, index: number) => ({
      job_id: newJob.id,
      chunk_index: index,
      skus: originalJob.skus || [],
      scrapers: [scraperName],
      status: 'pending' as const,
      test_mode: originalJob.test_mode || false,
      max_workers: originalJob.max_workers || 3,
    }));

    const { error: chunkError } = await supabase.from('scrape_job_chunks').insert(chunks);
    if (chunkError) {
      console.error('Error creating chunks for retried job:', chunkError);
    }
  }

  revalidatePath('/admin/scrapers/runs');
  return { success: true, newJobId: newJob.id };
}

export type ScrapeJobLog = ScrapeJobLogEntry;

export async function getScraperRunLogs(jobId: string): Promise<ScrapeJobLog[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scrape_job_logs')
    .select(
      'id, event_id, job_id, level, message, details, created_at, runner_id, runner_name, source, scraper_name, sku, phase, sequence'
    )
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
    .order('sequence', { ascending: true });

  if (error) {
    console.error(`Error fetching logs for job ${jobId}:`, error);
    return [];
  }

  return (data || []).map((row) => normalizeScrapeLogEntry(row as Record<string, unknown>, { persisted: true }));
}
