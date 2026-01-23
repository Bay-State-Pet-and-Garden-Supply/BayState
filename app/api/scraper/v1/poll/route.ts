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

        let scraperQuery = supabase
            .from('scraper_configs')
            .select(`
                id,
                slug,
                display_name,
                domain,
                current_version_id,
                versions:scraper_config_versions!fk_current_version(
                    id,
                    config,
                    status,
                    version_number
                )
            `)
            .eq('versions.status', 'published');

        if (job.scrapers && job.scrapers.length > 0) {
            scraperQuery = scraperQuery.in('slug', job.scrapers);
        }

        const { data: scrapers } = await scraperQuery;

        const skus: string[] = job.skus || [];
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
                    const version = config.versions?.[0];
                    const configJson = version?.config || {};
                    const workflowOptions = configJson.workflows || configJson.options ? { 
                        workflows: configJson.workflows,
                        timeout: configJson.timeout,
                        retries: configJson.retries
                    } : undefined;
                    return {
                        name: config.slug,
                        disabled: false,
                        base_url: configJson.base_url || `https://${config.domain}`,
                        search_url_template: configJson.search_url_template || undefined,
                        selectors: configJson.selectors || undefined,
                        options: workflowOptions,
                        test_skus: configJson.test_skus || undefined,
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
