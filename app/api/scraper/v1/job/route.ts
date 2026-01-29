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

interface JobConfigResponse {
    job_id: string;
    skus: string[];
    scrapers: ScraperConfig[];
    test_mode: boolean;
    max_workers: number;
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
        };

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
