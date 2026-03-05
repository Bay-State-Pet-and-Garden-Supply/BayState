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
    scraper_config_versions: ScraperConfigVersionRow | ScraperConfigVersionRow[] | null;
}

interface PollResponse {
    job: {
        job_id: string;
        skus: string[];
        scrapers: ScraperConfig[];
        test_mode: boolean;
        max_workers: number;
        job_type?: string;
        job_config?: Record<string, unknown>;
        ai_credentials?: {
            openai_api_key?: string;
            brave_api_key?: string;
        };
        lease_token?: string;
        lease_expires_at?: string;
    } | null;
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

export async function POST(request: NextRequest) {
    try {
        const runner = await validateRunnerAuth({
            apiKey: request.headers.get('X-API-Key'),
            authorization: request.headers.get('Authorization'),
        });

        if (!runner) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const runnerName = runner.runnerName;
        const supabase = getSupabaseAdmin();

        await supabase
            .from('scraper_runners')
            .update({
                last_seen_at: new Date().toISOString(),
                status: 'polling',
            })
            .eq('name', runnerName);

        const { data: claimedJobs, error: claimError } = await supabase.rpc('claim_next_pending_job', {
            p_runner_name: runnerName,
        });

        if (claimError) {
            console.error('[Poll] RPC error:', claimError);
            return NextResponse.json(
                { error: 'Failed to poll for jobs', details: claimError.message },
                { status: 500 }
            );
        }

        if (!claimedJobs || claimedJobs.length === 0) {
            const response: PollResponse = { job: null };
            return NextResponse.json(response);
        }

        const job = claimedJobs[0];

        // Query scraper configs from canonical versioned schema
        let scraperQuery = supabase
            .from('scraper_configs')
            .select(`
                slug,
                scraper_config_versions!fk_current_version (
                    status,
                    config
                )
            `)
            .eq('scraper_config_versions.status', 'published');

        if (job.scrapers && job.scrapers.length > 0) {
            scraperQuery = scraperQuery.in('slug', job.scrapers);
        }

        const { data: scraperRows, error: scraperError } = await scraperQuery;

        if (scraperError) {
            console.error('[Poll] Scraper query error:', scraperError);
        }

        const scrapers: ScraperConfig[] = ((scraperRows || []) as ScraperConfigRow[]).map((row) => {
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

        console.log('[Poll] Scrapers from DB:', scrapers.length);

        // Extract config from JSONB column
        const skus: string[] = job.skus || [];
        if (skus.length === 0) {
            console.error(`[Poll] Job ${job.job_id} has no SKUs - this should not happen`);
            return NextResponse.json(
                { error: 'Job has no SKUs configured' },
                { status: 400 }
            );
        }

        console.log(`[Poll] Runner ${runnerName} assigned job ${job.job_id}: ${skus.length} SKUs, ${scrapers.length} scrapers`);

        // Broadcast job assignment event to admin dashboard
        try {
            await supabase.channel('job-assignments').send({
                type: 'broadcast',
                event: 'job_assigned',
                payload: {
                    job_id: job.job_id,
                    runner_id: runnerName,
                    runner_name: runner.runnerName,
                    scrapers: job.scrapers || [],
                    skus_count: skus.length,
                    timestamp: new Date().toISOString(),
                },
            });
            console.log(`[Poll] Broadcast job_assigned event for ${job.job_id}`);
        } catch (broadcastError) {
            // Log but don't fail the request if broadcast fails
            console.error(`[Poll] Failed to broadcast job assignment: ${broadcastError}`);
        }

        const aiDefaults = await getAIScrapingDefaults();
        const aiCredentials = await getAIScrapingRuntimeCredentials();

        // Transform scrapers to response format for runner consumption
        // Runner expects options.workflows and optional timeout
        const response: PollResponse = {
            job: {
                job_id: job.job_id,
                skus,
                scrapers,
                test_mode: job.test_mode || false,
                max_workers: job.max_workers || 3,
                job_type: job.type || 'standard',
                job_config: (job.config || undefined) as Record<string, unknown> | undefined,
                ai_credentials: aiCredentials || undefined,
                lease_token: job.lease_token || undefined,
                lease_expires_at: job.lease_expires_at || undefined,
            },
        };

        if (response.job) {
            const isDiscovery = job.type === 'discovery' || (job.scrapers || []).includes('ai_discovery');
            if (isDiscovery) {
                const rawConfig = (job.config || {}) as Record<string, unknown>;
                const maxSearchResults = pickNumber(rawConfig.max_search_results, aiDefaults.max_search_results);
                const maxSteps = pickNumber(rawConfig.max_steps, aiDefaults.max_steps);
                const confidenceThreshold = pickNumber(rawConfig.confidence_threshold, aiDefaults.confidence_threshold);
                const llmModel = rawConfig.llm_model === 'gpt-4o' ? 'gpt-4o' : aiDefaults.llm_model;

                const updatedScrapers = response.job.scrapers.map((scraper) => {
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

                response.job.scrapers = updatedScrapers;
                response.job.job_config = {
                    ...(response.job.job_config || {}),
                    max_search_results: maxSearchResults,
                    max_steps: maxSteps,
                    confidence_threshold: confidenceThreshold,
                    llm_model: llmModel,
                };
            }
        }

        return NextResponse.json(response, {
            headers: {
                'X-Enforced-Runner-Name': runnerName
            }
        });
    } catch (error) {
        console.error('[Poll] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
