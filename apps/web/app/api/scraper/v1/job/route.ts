import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import { getLocalScraperConfigs } from '@/lib/admin/scrapers/configs';
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
    disabled: boolean;
    base_url?: string;
    search_url_template?: string;
    selectors?: Record<string, unknown> | Record<string, unknown>[];
    options?: Record<string, unknown>;
    test_skus?: string[];
    retries?: number;
    validation?: Record<string, unknown>;
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

function normalizeRunnerJobType(rawType: unknown): 'standard' | 'ai_search' {
    if (rawType === 'ai_search' || rawType === 'discovery' || rawType === 'crawl4ai') {
        return 'ai_search';
    }

    return 'standard';
}

function pickNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sanitizeDiscoveryConfig(
    config: Record<string, unknown>,
    defaults: {
        max_search_results: number;
        max_steps: number;
        confidence_threshold: number;
        llm_model: 'gpt-4o-mini' | 'gpt-4o';
    }
): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};

    if (typeof config.product_name === 'string') {
        normalized.product_name = config.product_name;
    }
    if (typeof config.brand === 'string') {
        normalized.brand = config.brand;
    }
    if (typeof config.prefer_manufacturer === 'boolean') {
        normalized.prefer_manufacturer = config.prefer_manufacturer;
    }
    if (typeof config.fallback_to_static === 'boolean') {
        normalized.fallback_to_static = config.fallback_to_static;
    }

    normalized.max_search_results = pickNumber(config.max_search_results, defaults.max_search_results);
    normalized.max_steps = pickNumber(config.max_steps, defaults.max_steps);
    normalized.confidence_threshold = pickNumber(config.confidence_threshold, defaults.confidence_threshold);
    normalized.llm_model = config.llm_model === 'gpt-4o' ? 'gpt-4o' : defaults.llm_model;

    return normalized;
}

function toSelectors(value: unknown): Record<string, unknown> | Record<string, unknown>[] | undefined {
    if (Array.isArray(value)) {
        return value.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item));
    }

    if (value && typeof value === 'object') {
        return value as Record<string, unknown>;
    }

    return undefined;
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

        const requestedScrapers = deriveRequestedScrapers(job);
        const normalizedJobType = normalizeRunnerJobType(job.type);

        const allLocalConfigs = await getLocalScraperConfigs();
        const scrapers: ScraperConfig[] = [];

        for (const config of allLocalConfigs) {
            const scraperSlug = config.slug;
            if (!scraperSlug) {
                continue;
            }

            // If specific scrapers are requested, filter by name/slug
            if (requestedScrapers.length > 0 && !requestedScrapers.includes(scraperSlug)) {
                continue;
            }

            const options: Record<string, unknown> = {};
            if (config.workflows && Array.isArray(config.workflows) && config.workflows.length > 0) {
                options.workflows = config.workflows;
            }
            if (typeof config.timeout === 'number') {
                options.timeout = config.timeout;
            }

            const searchUrlTemplate =
                'search_url_template' in config && typeof config.search_url_template === 'string'
                    ? config.search_url_template
                    : undefined;

            scrapers.push({
                name: scraperSlug,
                disabled: config.status === 'disabled' || config.status === 'archived',
                base_url: config.base_url,
                search_url_template: searchUrlTemplate,
                selectors: toSelectors(config.selectors),
                options,
                test_skus: config.test_skus,
                retries: config.retries,
                validation: config.validation,
            });
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
            job_type: normalizedJobType,
            job_config: (job.config || undefined) as Record<string, unknown> | undefined,
            ai_credentials: aiCredentials || undefined,
            lease_token: job.lease_token || undefined,
            lease_expires_at: job.lease_expires_at || undefined,
        };

        const isDiscovery = job.type === 'discovery' || requestedScrapers.includes('ai_discovery');
        if (isDiscovery) {
            const rawConfig = (job.config || {}) as Record<string, unknown>;
            const sanitizedDiscoveryConfig = sanitizeDiscoveryConfig(rawConfig, aiDefaults);
            const maxSearchResults = pickNumber(sanitizedDiscoveryConfig.max_search_results, aiDefaults.max_search_results);
            const maxSteps = pickNumber(sanitizedDiscoveryConfig.max_steps, aiDefaults.max_steps);
            const confidenceThreshold = pickNumber(sanitizedDiscoveryConfig.confidence_threshold, aiDefaults.confidence_threshold);
            const llmModel = sanitizedDiscoveryConfig.llm_model === 'gpt-4o' ? 'gpt-4o' : aiDefaults.llm_model;

            const updatedScrapers = response.scrapers.map((scraper) => {
                if (scraper.name !== 'ai_discovery') {
                    return scraper;
                }

                const nextOptions = {
                    ...(scraper.options || {}),
                    max_search_results: maxSearchResults,
                    max_steps: maxSteps,
                    confidence_threshold: confidenceThreshold,
                    llm_model: llmModel,
                };

                return {
                    ...scraper,
                    options: nextOptions,
                };
            });

            response.scrapers = updatedScrapers;
            response.job_config = sanitizedDiscoveryConfig;
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
