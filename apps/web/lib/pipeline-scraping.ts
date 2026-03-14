'use server';

import { createClient } from '@/lib/supabase/server';

import { getLocalScraperConfigs } from '@/lib/admin/scrapers/configs';

interface PostgrestLikeError {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
}

type ScrapeJobInsertType = 'standard' | 'ai_search' | 'discovery';

function isLegacyJobTypeConstraintError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const maybeError = error as PostgrestLikeError;
    const code = typeof maybeError.code === 'string' ? maybeError.code : '';
    const message = typeof maybeError.message === 'string' ? maybeError.message : '';
    const details = typeof maybeError.details === 'string' ? maybeError.details : '';

    return (
        code === '23514' &&
        (message.includes('scrape_jobs_type_check') || details.includes('scrape_jobs_type_check'))
    );
}

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
    /** Number of SKUs per chunk (default: 50) */
    chunkSize?: number;
    jobType?: 'standard' | 'ai_search';
    /** Explicit enrichment method - takes precedence over jobType */
    enrichment_method?: 'scrapers' | 'ai_search';
    aiSearchConfig?: {
        product_name?: string;
        brand?: string;
        max_search_results?: number;
        max_steps?: number;
        confidence_threshold?: number;
        llm_model?: 'gpt-4o-mini' | 'gpt-4o';
        prefer_manufacturer?: boolean;
        fallback_to_static?: boolean;
        max_concurrency?: number;
        extraction_strategy?: 'llm' | 'llm_free' | 'auto';
        cache_enabled?: boolean;
        max_retries?: number;
        timeout?: number;
    };
    /** Maximum cost in USD for AI Search jobs (default: 5.00, max: 10.00) */
    maxAISearchCostUsd?: number;
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
    const chunkSize = options?.chunkSize ?? 50; // Default 50 SKUs per chunk
    const enrichmentMethod = options?.enrichment_method ?? (options?.jobType === 'ai_search' ? 'ai_search' : 'scrapers');
    const isAISearch = enrichmentMethod === 'ai_search';
    const effectiveScrapersRaw = isAISearch ? ['ai_search'] : scrapers;
    const jobType: ScrapeJobInsertType = isAISearch ? 'ai_search' : 'standard';

    // Resolve scraper display names to slugs if possible using local YAML configs
    let effectiveScrapers = effectiveScrapersRaw;
    if (scrapers.length > 0 && !isAISearch) {
        const configs = await getLocalScraperConfigs();
        
        if (configs && configs.length > 0) {
            const slugMap = new Map<string, string>();
            configs.forEach(config => {
                const slug = config.slug;
                if (!slug) {
                    return;
                }

                slugMap.set(slug.toLowerCase(), slug);
                if (config.display_name) {
                    slugMap.set(config.display_name.toLowerCase(), slug);
                }
            });
            effectiveScrapers = effectiveScrapersRaw.map(s => slugMap.get(s.toLowerCase()) || s);
        }
    }

    const supabase = await createClient();

    const maxAISearchCostUsd = isAISearch ? (options?.maxAISearchCostUsd ?? 5.00) : undefined;
    if (isAISearch && maxAISearchCostUsd !== undefined && maxAISearchCostUsd > 10.00) {
        return { success: false, error: 'Cost cap exceeds maximum of $10.00' };
    }

    const nowIso = new Date().toISOString();

    const buildJobInsertPayload = (type: ScrapeJobInsertType) => ({
        skus,
        scrapers: effectiveScrapers,
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
        type,
        config: isAISearch ? {
            ...(options?.aiSearchConfig ?? {}),
            max_cost_usd: maxAISearchCostUsd,
        } : null,
        metadata: isAISearch
            ? {
                source: 'pipeline',
                mode: 'ai_search',
                requested_job_type: 'ai_search',
                stored_job_type: type,
            }
            : null,
        updated_at: nowIso,
    });

    let { data: job, error: insertError } = await supabase
        .from('scrape_jobs')
        .insert(buildJobInsertPayload(jobType))
        .select('id')
        .single();

    if (insertError && isAISearch && isLegacyJobTypeConstraintError(insertError)) {
        console.warn('[Pipeline Scraping] Legacy scrape_jobs type constraint detected; retrying AI search insert using discovery type');
        const retryResult = await supabase
            .from('scrape_jobs')
            .insert(buildJobInsertPayload('discovery'))
            .select('id')
            .single();

        job = retryResult.data;
        insertError = retryResult.error;
    }

    if (insertError || !job) {
        console.error('[Pipeline Scraping] Failed to create parent job:', insertError);
        const errorMessage =
            insertError && typeof insertError === 'object' && 'message' in insertError
                ? String((insertError as { message?: unknown }).message ?? '')
                : JSON.stringify(insertError);
        return { success: false, error: `Failed to create scraping job: ${errorMessage}` };
    }

    // Create chunks with configurable size (default 50 SKUs per chunk)
    const chunks: Array<{
        job_id: string;
        chunk_index: number;
        skus: string[];
        scrapers: string[];
        status: string;
        updated_at: string;
    }> = [];

    for (let i = 0; i < skus.length; i += chunkSize) {
        chunks.push({
            job_id: job.id,
            chunk_index: chunks.length,
            skus: skus.slice(i, i + chunkSize),
            scrapers: effectiveScrapers,
            status: 'pending',
            updated_at: nowIso,
        });
    }

    const { error: unitsError } = await supabase
        .from('scrape_job_chunks')
        .insert(chunks);

    if (unitsError) {
        console.error('[Pipeline Scraping] Failed to create work units:', unitsError);
        await supabase.from('scrape_jobs').delete().eq('id', job.id);
        return { success: false, error: 'Failed to create scraping work units' };
    }

    console.log(`[Pipeline Scraping] Created parent job ${job.id} with ${chunks.length} chunks (${chunkSize} SKUs each)`);

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
    aiSearchMetrics?: {
        extraction_strategy?: string[];
        cost_breakdown?: Record<string, unknown>;
        anti_bot_metrics?: Record<string, unknown>;
        llm_count?: number;
        llm_free_count?: number;
        llm_ratio?: number | null;
    };
}> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('scrape_jobs')
        .select('status, completed_at, error_message, metadata')
        .eq('id', jobId)
        .single();

    if (error || !data) {
        return { status: 'failed', error: 'Job not found' };
    }

    const metadata = (data.metadata && typeof data.metadata === 'object')
        ? (data.metadata as Record<string, unknown>)
        : null;
    const aiSearchMetrics = (metadata?.ai_search && typeof metadata.ai_search === 'object')
        ? (metadata.ai_search as Record<string, unknown>)
        : null;

    return {
        status: data.status,
        completedAt: data.completed_at,
        error: data.error_message,
        aiSearchMetrics: aiSearchMetrics
            ? {
                extraction_strategy: Array.isArray(aiSearchMetrics.extraction_strategy)
                    ? (aiSearchMetrics.extraction_strategy as string[])
                    : undefined,
                cost_breakdown: (aiSearchMetrics.cost_breakdown && typeof aiSearchMetrics.cost_breakdown === 'object')
                    ? (aiSearchMetrics.cost_breakdown as Record<string, unknown>)
                    : undefined,
                anti_bot_metrics: (aiSearchMetrics.anti_bot_metrics && typeof aiSearchMetrics.anti_bot_metrics === 'object')
                    ? (aiSearchMetrics.anti_bot_metrics as Record<string, unknown>)
                    : undefined,
                llm_count: typeof aiSearchMetrics.llm_count === 'number' ? aiSearchMetrics.llm_count : undefined,
                llm_free_count: typeof aiSearchMetrics.llm_free_count === 'number' ? aiSearchMetrics.llm_free_count : undefined,
                llm_ratio: typeof aiSearchMetrics.llm_ratio === 'number' ? aiSearchMetrics.llm_ratio : null,
            }
            : undefined,
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
