import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import { getLocalScraperConfigs } from '@/lib/admin/scrapers/configs';
import {
    type AIScrapingRuntimeCredentials,
    getAIScrapingDefaults,
    getAIScrapingRuntimeCredentials,
} from '@/lib/ai-scraping/credentials';
import {
    CRAWL4AI_CONFIG_KEYS,
    DISCOVERY_CONFIG_KEYS,
    hasKnownConfigKeys,
    normalizeDiscoveryLLMProvider,
    pickNumber,
    sanitizeDiscoveryConfig,
} from '@/lib/ai-scraping/discovery-config';

function getSupabaseAdmin(): SupabaseClient {
    const url = process.env.SUPABASE_URL;
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
    login?: Record<string, unknown>;
    credential_refs?: string[];
}

interface JobConfigResponse {
    job_id: string;
    skus: string[];
    scrapers: ScraperConfig[];
    test_mode: boolean;
    max_workers: number;
    job_type: string;
    job_config?: Record<string, unknown>;
    ai_credentials?: AIScrapingRuntimeCredentials;
    lease_token?: string;
    lease_expires_at?: string;
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


function toSelectors(value: unknown): Record<string, unknown> | Record<string, unknown>[] | undefined {
    if (Array.isArray(value)) {
        return value.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item));
    }

    if (value && typeof value === 'object') {
        return value as Record<string, unknown>;
    }

    return undefined;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
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
                login: toRecord(config.login),
                credential_refs: config.credential_refs,
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

        const [aiDefaults, aiCredentials] = await Promise.all([
            getAIScrapingDefaults(),
            getAIScrapingRuntimeCredentials(),
        ]);

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
            const llmProvider = normalizeDiscoveryLLMProvider(
                sanitizedDiscoveryConfig.llm_provider,
                aiDefaults.llm_provider
            );
            const llmModel =
                typeof sanitizedDiscoveryConfig.llm_model === 'string' && sanitizedDiscoveryConfig.llm_model.length > 0
                    ? sanitizedDiscoveryConfig.llm_model
                    : aiDefaults.llm_model;
            const llmBaseUrl =
                typeof sanitizedDiscoveryConfig.llm_base_url === 'string' && sanitizedDiscoveryConfig.llm_base_url.length > 0
                    ? sanitizedDiscoveryConfig.llm_base_url
                    : aiDefaults.llm_base_url;

            const updatedScrapers = response.scrapers.map((scraper) => {
                if (scraper.name !== 'ai_discovery') {
                    return scraper;
                }

                const nextOptions = {
                    ...(scraper.options || {}),
                    max_search_results: maxSearchResults,
                    max_steps: maxSteps,
                    confidence_threshold: confidenceThreshold,
                    llm_provider: llmProvider,
                    llm_model: llmModel,
                    ...(llmBaseUrl ? { llm_base_url: llmBaseUrl } : {}),
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
