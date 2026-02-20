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
    disabled: boolean;
    base_url?: string;
    search_url_template?: string;
    selectors?: Record<string, unknown>;
    options?: Record<string, unknown>;
    test_skus?: string[];
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

        // Fetch scraper configurations
        let scraperQuery = supabase
            .from('scrapers')
            .select('*')
            .eq('status', 'active');  // Use status='active' not disabled=false

        if (job.scrapers && job.scrapers.length > 0) {
            scraperQuery = scraperQuery.in('name', job.scrapers);
        }

        const { data: scrapers, error: scrapersError } = await scraperQuery;

        if (scrapersError) {
            console.error(`[Scraper API] Failed to fetch scrapers:`, scrapersError);
            return NextResponse.json(
                { error: 'Failed to fetch scraper configurations' },
                { status: 500 }
            );
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

        // Transform scrapers - build options with workflows (runner expects options.workflows)
        const response: JobConfigResponse = {
            job_id: job.id,
            skus,
            scrapers: (scrapers || []).map(s => {
                const workflows = s.workflows as unknown[] | undefined;
                const options: Record<string, unknown> = {};
                if (workflows && workflows.length > 0) {
                    options["workflows"] = workflows;
                }
                if (s.timeout) {
                    options["timeout"] = s.timeout;
                }
                
                return {
                    name: s.name,
                    disabled: s.status === 'disabled',
                    base_url: s.base_url,
                    search_url_template: s.url_template || undefined,
                    selectors: s.selectors,
                    options: options,
                    test_skus: s.test_skus,
                };
            }),
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

        console.log(`[Scraper API] Job ${jobId} config sent to ${runner.runnerName}: ${skus.length} SKUs, ${scrapers?.length || 0} scrapers`);

        return NextResponse.json(response);
    } catch (error) {
        console.error('[Scraper API] Error processing request:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
