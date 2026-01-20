'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Options for scraping jobs.
 * SKUs are split into up to maxRunners separate jobs for parallel processing.
 */
export interface ScrapeOptions {
    /** Workers per runner (default: 3) */
    maxWorkers?: number;
    /** Run in test mode */
    testMode?: boolean;
    /** Specific scrapers to use (empty = all) */
    scrapers?: string[];
    /** Maximum number of parallel jobs to create (default: 3) */
    maxRunners?: number;
}

export interface ScrapeResult {
    success: boolean;
    jobIds?: string[];
    error?: string;
}

/**
 * Triggers scraping job(s) for selected products in the pipeline.
 *
 * SKUs are split into up to `maxRunners` separate jobs using round-robin
 * distribution. Each job is processed independently by daemon runners.
 *
 * @param skus - Array of product SKUs to scrape
 * @param options - Scraping options including maxRunners (default: 3)
 * @returns Object with success status and array of job IDs
 */
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
    const maxRunners = options?.maxRunners ?? 3;

    const supabase = await createClient();

    // Partition SKUs into up to maxRunners jobs
    // Uses round-robin distribution for even workload across runners
    const numJobs = Math.min(maxRunners, skus.length);
    const partitions: string[][] = Array.from({ length: numJobs }, () => []);

    skus.forEach((sku, index) => {
        partitions[index % numJobs].push(sku);
    });

    const jobIds: string[] = [];

    for (const partition of partitions) {
        const { data: job, error: insertError } = await supabase
            .from('scrape_jobs')
            .insert({
                skus: partition,
                scrapers: scrapers,
                test_mode: testMode,
                max_workers: maxWorkers,
                status: 'pending',
            })
            .select('id')
            .single();

        if (insertError || !job) {
            console.error('[Pipeline Scraping] Failed to create job:', insertError);
            return { success: false, error: 'Failed to create scraping job' };
        }

        jobIds.push(job.id);
    }

    console.log(
        `[Pipeline Scraping] Created ${jobIds.length} job(s) for ${skus.length} SKUs ` +
        `(${partitions.map(p => p.length).join(', ')} SKUs per job)`
    );

    return {
        success: true,
        jobIds: jobIds,
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
