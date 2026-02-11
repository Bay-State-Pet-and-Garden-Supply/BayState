'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Options for scraping jobs.
 */
export interface ScrapeOptions {
    /** Workers per runner (default: 3) */
    maxWorkers?: number;
    /** Run in test mode */
    testMode?: boolean;
    /** Specific scrapers to use (empty = all) */
    scrapers?: string[];
    maxRunners?: number;
    /** Maximum retry attempts before terminal failure (default: 3) */
    maxAttempts?: number;
}

export interface ScrapeResult {
    success: boolean;
    jobIds?: string[];
    error?: string;
}

export async function scrapeProducts(
    skus: string[],
    options?: ScrapeOptions
): Promise<ScrapeResult> {
    if (!skus || skus.length === 0) {
        return { success: false, error: 'No SKUs provided' };
    }

    const maxWorkers = options?.maxWorkers ?? 3;
    const testMode = options?.testMode ?? false;
    const scrapers = options?.scrapers ?? [];
    const maxAttempts = options?.maxAttempts ?? 3;

    const supabase = await createClient();

    const nowIso = new Date().toISOString();

    const { data: job, error: insertError } = await supabase
        .from('scrape_jobs')
        .insert({
            skus,
            scrapers,
            test_mode: testMode,
            max_workers: maxWorkers,
            status: 'pending',
            attempt_count: 0,
            max_attempts: maxAttempts,
            backoff_until: null,
            lease_token: null,
            leased_at: null,
            lease_expires_at: null,
            heartbeat_at: null,
            runner_name: null,
            started_at: null,
            updated_at: nowIso,
        })
        .select('id')
        .single();

    if (insertError || !job) {
        console.error('[Pipeline Scraping] Failed to create parent job:', insertError);
        return { success: false, error: 'Failed to create scraping job' };
    }

    const units = skus.map((sku, index) => ({
        job_id: job.id,
        chunk_index: index,
        skus: [sku],
        scrapers,
        status: 'pending',
        updated_at: nowIso,
    }));

    const { error: unitsError } = await supabase
        .from('scrape_job_chunks')
        .insert(units);

    if (unitsError) {
        console.error('[Pipeline Scraping] Failed to create work units:', unitsError);
        await supabase.from('scrape_jobs').delete().eq('id', job.id);
        return { success: false, error: 'Failed to create scraping work units' };
    }

    console.log(`[Pipeline Scraping] Created parent job ${job.id} with ${units.length} claimable units`);

    return {
        success: true,
        jobIds: [job.id],
    };
}

/**
 * Gets the status of a scraping job for the pipeline.
 */
export async function getScrapeJobStatus(jobId: string): Promise<{
    status: 'pending' | 'running' | 'completed' | 'failed';
    completedAt?: string;
    error?: string;
}> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('scrape_jobs')
        .select('status, completed_at, error_message')
        .eq('id', jobId)
        .single();

    if (error || !data) {
        return { status: 'failed', error: 'Job not found' };
    }

    return {
        status: data.status,
        completedAt: data.completed_at,
        error: data.error_message,
    };
}

/**
 * Checks if any daemon runners are available to process jobs.
 * Looks for runners that have checked in within the last 5 minutes.
 */
export async function checkRunnersAvailable(): Promise<boolean> {
    const count = await getAvailableRunnerCount();
    return count > 0;
}

/**
 * Gets the count of available daemon runners.
 * Only counts runners seen within the last 5 minutes with active status.
 */
export async function getAvailableRunnerCount(): Promise<number> {
    const supabase = await createClient();
    
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { count, error } = await supabase
        .from('scraper_runners')
        .select('*', { count: 'exact', head: true })
        .gt('last_seen_at', fiveMinutesAgo)
        .in('status', ['online', 'polling', 'idle', 'running']);
        
    if (error) {
        console.error('[Pipeline Scraping] Failed to check runners:', error);
        return 0;
    }
    
    return count || 0;
}
