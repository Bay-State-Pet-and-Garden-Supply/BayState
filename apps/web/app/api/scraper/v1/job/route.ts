import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import { assembleScraperConfigBySlug } from '@/lib/admin/scraper-configs/assemble-config';
import {
    getAIScrapingDefaults,
    getAIScrapingRuntimeCredentials,
} from '@/lib/ai-scraping/credentials';

function getSupabaseAdmin(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing Supabase configuration');
    }
    return createClient(url, key);
}

interface ScraperConfig {
    name: string;
    display_name?: string | null;
    disabled: boolean;
    base_url?: string;
    scraper_type?: string;
    selectors?: unknown;
    options?: unknown;
    test_skus?: string[];
    retries?: number;
    validation?: unknown;
    ai_config?: unknown;
    anti_detection?: unknown;
    http_status?: unknown;
    login?: unknown;
    workflows?: unknown;
    normalization?: unknown;
    image_quality?: number;
    fake_skus?: string[];
    edge_case_skus?: string[];
}

interface JobConfigResponse {
    job_id: string;
    skus: string[];
    scrapers: ScraperConfig[];
    test_mode: boolean;
    max_workers: number;
    job_type: string;
    job_config?: Record<string, unknown>;
    ai_credentials?: {
        openai_api_key?: string;
        brave_api_key?: string;
    };
    lease_token?: string;
    lease_expires_at?: string;
}

const DISCOVERY_CONFIG_KEYS = new Set([
    'product_name',
    'brand',
    'max_search_results',
    'max_steps',
    'confidence_threshold',
    'prefer_manufacturer',
    'fallback_to_static',
    'max_concurrency',
]);

const CRAWL4AI_CONFIG_KEYS = new Set([
    'extraction_strategy',
    'cache_enabled',
    'max_retries',
    'timeout',
]);

function hasKnownConfigKeys(
    config: Record<string, unknown> | undefined,
    keys: Set<string>
): boolean {
    if (!config) {
        return false;
    }

    return Object.keys(config).some((key) => keys.has(key));
}

function deriveRequestedScrapers(job: {
    type?: string | null;
    scrapers?: string[] | null;
    config?: unknown;
}): string[] {
    if (Array.isArray(job.scrapers) && job.scrapers.length > 0) {
        return job.scrapers;
    }

    if (job.type === 'discovery') {
        return ['ai_discovery'];
    }

    if (job.type === 'crawl4ai') {
        return ['crawl4ai_discovery'];
    }

    const config = (job.config && typeof job.config === 'object' && !Array.isArray(job.config))
        ? (job.config as Record<string, unknown>)
        : undefined;

    if (hasKnownConfigKeys(config, DISCOVERY_CONFIG_KEYS)) {
        return ['ai_discovery'];
    }

    if (hasKnownConfigKeys(config, CRAWL4AI_CONFIG_KEYS)) {
        return ['crawl4ai_discovery'];
    }

    return [];
}

function pickNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export async function GET(request: NextRequest) {
    try {
        // Validate authentication using unified auth function
        const runner = await validateRunnerAuth({
            apiKey: request.headers.get('X-API-Key'),
            authorization: request.headers.get('Authorization'),
        });

        if (!runner) {
            console.error('[Scraper API] Authentication failed');
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        console.log(`[Scraper API] Authenticated via ${runner.authMethod}: ${runner.runnerName}`);

        const { searchParams } = new URL(request.url);
        const jobId = searchParams.get('job_id');

        if (!jobId) {
            return NextResponse.json(
                { error: 'Missing required parameter: job_id' },
                { status: 400 }
            );
        }

        const supabase = getSupabaseAdmin();

        // Fetch job details
        const { data: job, error: jobError } = await supabase
            .from('scrape_jobs')
            .select('*')
            .eq('id', jobId)
            .single();

        if (jobError || !job) {
            console.error(`[Scraper API] Job not found: ${jobId}`, jobError);
            return NextResponse.json(
                { error: 'Job not found' },
                { status: 404 }
            );
        }

        // Fetch all published scraper configs (for metadata)
        const { data: scraperConfigs, error: scrapersError } = await supabase
            .from('scraper_configs')
            .select('slug, display_name, scraper_type')
            .eq('status', 'active');

        if (scrapersError) {
            console.error(`[Scraper API] Failed to fetch scrapers:`, scrapersError);
            return NextResponse.json(
                { error: 'Failed to fetch scraper configurations' },
                { status: 500 }
            );
        }

        const requestedScrapers = deriveRequestedScrapers(job);
        
        // Filter to only requested scrapers (or all if none specified)
        const filteredConfigs = (scraperConfigs || []).filter((row: { slug: string; display_name: string | null }) => {
            if (requestedScrapers.length === 0) return true;
            return requestedScrapers.includes(row.slug) || 
                   (row.display_name && requestedScrapers.includes(row.display_name));
        });

        // Build scraper configs using the new assembly utility
        const scrapers: ScraperConfig[] = [];
        
        for (const configRow of filteredConfigs) {
            // Use the normalized assembly utility (creates its own admin client)
            const assembledConfig = await assembleScraperConfigBySlug(configRow.slug);
            
            if (assembledConfig) {
                scrapers.push({
                    name: assembledConfig.name,
                    display_name: assembledConfig.display_name,
                    disabled: false,
                    base_url: assembledConfig.base_url,
                    scraper_type: assembledConfig.scraper_type,
                    selectors: assembledConfig.selectors,
                    options: {
                        workflows: assembledConfig.workflows,
                        timeout: assembledConfig.timeout,
                        image_quality: assembledConfig.image_quality,
                        ai_config: assembledConfig.ai_config,
                        anti_detection: assembledConfig.anti_detection,
                        http_status: assembledConfig.http_status,
                        login: assembledConfig.login,
                        normalization: assembledConfig.normalization,
                    },
                    test_skus: assembledConfig.test_skus,
                    fake_skus: assembledConfig.fake_skus,
                    edge_case_skus: assembledConfig.edge_case_skus,
                    retries: assembledConfig.retries,
                    validation: assembledConfig.validation,
                    ai_config: assembledConfig.ai_config,
                    anti_detection: assembledConfig.anti_detection,
                    http_status: assembledConfig.http_status,
                    login: assembledConfig.login,
                    workflows: assembledConfig.workflows,
                    normalization: assembledConfig.normalization,
                    image_quality: assembledConfig.image_quality,
                });
            }
        }

        const skus: string[] = job.skus || [];
        if (skus.length === 0) {
            console.error(`[Scraper API] Job ${jobId} has no SKUs - this should not happen`);
            return NextResponse.json(
                { error: 'Job has no SKUs configured' },
                { status: 400 }
            );
        }

        const aiDefaults = await getAIScrapingDefaults();
        const aiCredentials = await getAIScrapingRuntimeCredentials();

        const response: JobConfigResponse = {
            job_id: job.id,
            skus,
            scrapers,
            test_mode: job.test_mode || false,
            max_workers: job.max_workers || 3,
            job_type: job.type || 'standard',
            job_config: (job.config || undefined) as Record<string, unknown> | undefined,
            ai_credentials: aiCredentials || undefined,
            lease_token: job.lease_token || undefined,
            lease_expires_at: job.lease_expires_at || undefined,
        };

        const isDiscovery = job.type === 'discovery' || requestedScrapers.includes('ai_discovery');
        if (isDiscovery) {
            const rawConfig = (job.config || {}) as Record<string, unknown>;
            const maxSearchResults = pickNumber(rawConfig.max_search_results, aiDefaults.max_search_results);
            const maxSteps = pickNumber(rawConfig.max_steps, aiDefaults.max_steps);
            const confidenceThreshold = pickNumber(rawConfig.confidence_threshold, aiDefaults.confidence_threshold);
            const llmModel = rawConfig.llm_model === 'gpt-4o' ? 'gpt-4o' : aiDefaults.llm_model;

            response.job_config = {
                ...rawConfig,
                max_search_results: maxSearchResults,
                max_steps: maxSteps,
                confidence_threshold: confidenceThreshold,
                llm_model: llmModel,
            };
        }

        console.log(`[Scraper API] Job ${jobId} config sent to ${runner.runnerName}: ${skus.length} SKUs, ${scrapers.length} scrapers`);

        return NextResponse.json(response);
    } catch (error) {
        console.error('[Scraper API] Error processing request:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
