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

        // Query scrapers directly (scrapers table stores config in a JSONB column)
        let scraperQuery = supabase
            .from('scrapers')
            .select('*')
            .eq('status', 'active');  // Use status='active' not disabled=false

        if (job.scrapers && job.scrapers.length > 0) {
            scraperQuery = scraperQuery.in('name', job.scrapers);
        }

        const { data: scrapers, error: scraperError } = await scraperQuery;

        if (scraperError) {
            console.error('[Poll] Scraper query error:', scraperError);
        }

        console.log('[Poll] Scrapers from DB:', scrapers?.length || 0);

        // Extract config from JSONB column
        const skus: string[] = job.skus || [];
        if (skus.length === 0) {
            console.error(`[Poll] Job ${job.job_id} has no SKUs - this should not happen`);
            return NextResponse.json(
                { error: 'Job has no SKUs configured' },
                { status: 400 }
            );
        }

        console.log(`[Poll] Runner ${runnerName} assigned job ${job.job_id}: ${skus.length} SKUs, ${scrapers?.length || 0} scrapers`);

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

        // Transform scrapers to response format - use actual column names from scrapers table
        // The table has workflows, selectors, timeout as separate columns
        // Runner expects options to contain workflows
        const response: PollResponse = {
            job: {
                job_id: job.job_id,
                skus,
                scrapers: (scrapers || []).map(s => {
                    // Get workflows from the workflows column
                    const workflows = s.workflows as unknown[] | undefined;
                    
                    // Build options with workflows (runner looks for options.workflows)
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
                        selectors: s.selectors as Record<string, unknown> | undefined,
                        options: options,
                        test_skus: s.test_skus || undefined,
                    };
                }),
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
