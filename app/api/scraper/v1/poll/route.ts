import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';

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
    } | null;
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

        // Query scrapers directly (same as /api/scraper/v1/job endpoint)
        let scraperQuery = supabase
            .from('scrapers')
            .select('*')
            .eq('disabled', false);

        if (job.scrapers && job.scrapers.length > 0) {
            scraperQuery = scraperQuery.in('name', job.scrapers);
        }

        const { data: scrapers, error: scraperError } = await scraperQuery;
        
        if (scraperError) {
            console.error('[Poll] Scraper query error:', scraperError);
        }

        console.log('[Poll] Scrapers from DB:', scrapers?.length || 0);

        const skus: string[] = job.skus || [];
        if (skus.length === 0) {
            console.error(`[Poll] Job ${job.job_id} has no SKUs - this should not happen`);
            return NextResponse.json(
                { error: 'Job has no SKUs configured' },
                { status: 400 }
            );
        }

        console.log(`[Poll] Runner ${runnerName} assigned job ${job.job_id}: ${skus.length} SKUs, ${scrapers?.length || 0} scrapers`);

        // Transform scrapers to response format
        const response: PollResponse = {
            job: {
                job_id: job.job_id,
                skus,
                scrapers: (scrapers || []).map(s => ({
                    name: s.name,
                    disabled: s.disabled || false,
                    base_url: s.base_url,
                    search_url_template: s.search_url_template,
                    selectors: s.selectors,
                    options: s.options,
                    test_skus: s.test_skus,
                })),
                test_mode: job.test_mode || false,
                max_workers: job.max_workers || 3,
            },
        };

        return NextResponse.json(response);
        if (skus.length === 0) {
            console.error(`[Poll] Job ${job.job_id} has no SKUs - this should not happen`);
            return NextResponse.json(
                { error: 'Job has no SKUs configured' },
                { status: 400 }
            );
        }

        console.log(`[Poll] Runner ${runnerName} assigned job ${job.job_id}: ${skus.length} SKUs, ${scrapers?.length || 0} scrapers`);

        // Transform new versioned configs to old format for runner compatibility
        const response: PollResponse = {
            job: {
                job_id: job.job_id,
                skus,
                scrapers: (scrapers || []).map(config => {
                    // scraper_config_versions is an array from FK relation - get first element
                    const versions = config.scraper_config_versions as Array<{ id: string; config: Record<string, unknown>; status: string; version_number: number }> | null;
                    const version = versions?.[0];
                    const configJson = (version?.config || {}) as Record<string, unknown>;
                    
                    // Debug log for this specific scraper
                    console.log(`[Poll] Scraper ${config.slug}: hasConfig=${!!configJson}, workflowCount=${(configJson.workflows as unknown[])?.length || 0}`);
                    
                    const workflowOptions = configJson.workflows ? { 
                        workflows: configJson.workflows as unknown[],
                        timeout: configJson.timeout as number | undefined,
                        retries: configJson.retries as number | undefined
                    } : undefined;
                    return {
                        name: config.slug,
                        disabled: false,
                        base_url: (configJson.base_url as string) || `https://${config.domain}`,
                        search_url_template: configJson.search_url_template as string | undefined,
                        selectors: configJson.selectors as Record<string, unknown> | undefined,
                        options: workflowOptions,
                        test_skus: configJson.test_skus as string[] | undefined,
                    };
                }),
                test_mode: job.test_mode || false,
                max_workers: job.max_workers || 3,
            },
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error('[Poll] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
