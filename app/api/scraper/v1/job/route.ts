import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';
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
    search_url_template?: string;
    selectors?: Record<string, unknown> | Record<string, unknown>[];
    options?: Record<string, unknown>;
    test_skus?: string[];
    retries?: number;
    validation?: Record<string, unknown>;
}

interface ScraperConfigVersionRow {
    status?: string | null;
    config?: unknown;
}

interface ScraperConfigRow {
    slug: string;
    display_name: string | null;
    scraper_config_versions: ScraperConfigVersionRow | ScraperConfigVersionRow[] | null;
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

function pickNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeCurrentVersion(
    version: ScraperConfigRow['scraper_config_versions']
): ScraperConfigVersionRow | null {
    if (Array.isArray(version)) {
        return version[0] ?? null;
    }
    return version ?? null;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return undefined;
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

function toStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    return value.filter((item): item is string => typeof item === 'string');
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

        // Fetch scraper configurations from the canonical versioned schema
        const { data: scraperRows, error: scrapersError } = await supabase
            .from('scraper_configs')
            .select(`
                slug,
                display_name,
                scraper_config_versions!fk_current_version (
                    status,
                    config
                )
            `)
            .eq('scraper_config_versions.status', 'published');

        if (scrapersError) {
            console.error(`[Scraper API] Failed to fetch scrapers:`, scrapersError);
            return NextResponse.json(
                { error: 'Failed to fetch scraper configurations' },
                { status: 500 }
            );
        }

        const requestedScrapers = job.scrapers || [];
        const filteredScraperRows = (scraperRows || []).filter(row => {
            if (requestedScrapers.length === 0) return true;
            return requestedScrapers.includes(row.slug) || 
                   (row.display_name && requestedScrapers.includes(row.display_name));
        });

        const scrapers: ScraperConfig[] = (filteredScraperRows as ScraperConfigRow[]).map((row) => {
            const version = normalizeCurrentVersion(row.scraper_config_versions);
            const config = toRecord(version?.config);
            const workflows = Array.isArray(config?.workflows) ? config.workflows : undefined;
            const timeout = typeof config?.timeout === 'number' ? config.timeout : undefined;

            const options: Record<string, unknown> = {};
            if (workflows && workflows.length > 0) {
                options.workflows = workflows;
            }
            if (typeof timeout === 'number') {
                options.timeout = timeout;
            }

            return {
                name: row.slug,
                display_name: row.display_name,
                disabled: version?.status === 'archived',
                base_url: typeof config?.base_url === 'string' ? config.base_url : undefined,
                search_url_template:
                    typeof config?.search_url_template === 'string'
                        ? config.search_url_template
                        : undefined,
                selectors: toSelectors(config?.selectors),
                options,
                test_skus: toStringArray(config?.test_skus),
                retries: typeof config?.retries === 'number' ? config.retries : undefined,
                validation: toRecord(config?.validation),
            };
        });

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

        // Transform scrapers - build options with workflows (runner expects options.workflows)
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

        const isDiscovery = job.type === 'discovery' || (job.scrapers || []).includes('ai_discovery');
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
