import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import { submitBatch } from '@/lib/consolidation/batch-service';

function getSupabaseAdmin(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing Supabase configuration');
    }
    return createClient(url, key);
}

/**
 * Trigger consolidation for scraped products (Event-Driven Automation)
 * This function is called after a scrape job completes successfully
 */
async function onScraperComplete(jobId: string, skus: string[]): Promise<void> {
    try {
        const supabase = getSupabaseAdmin();

        // Fetch scraped products that are ready for consolidation
        const { data: products } = await supabase
            .from('products_ingestion')
            .select('sku, sources')
            .in('sku', skus)
            .eq('pipeline_status', 'scraped');

        if (!products?.length) {
            console.log(`[Callback] No scraped products to consolidate for job ${jobId}`);
            return;
        }

        // Transform to ProductSource format for consolidation
        const productSources = products.map(p => ({
            sku: p.sku,
            sources: p.sources as Record<string, unknown>,
        }));

        console.log(`[Callback] Triggering consolidation for ${productSources.length} products from job ${jobId}`);

        // Submit batch for AI consolidation
        const result = await submitBatch(productSources, {
            description: `Auto-consolidation for scrape job ${jobId}`,
            auto_apply: true,
            scrape_job_id: jobId,
        });

        if (result.success && result.batch_id) {
            console.log(`[Callback] Consolidation batch ${result.batch_id} created for job ${jobId}`);
        } else {
            const errorResponse = result as { success: false; error: string };
            console.error(`[Callback] Consolidation failed for job ${jobId}:`, errorResponse.error);
        }
    } catch (error) {
        console.error(`[Callback] onScraperComplete error for job ${jobId}:`, error);
    }
}

interface ScrapedData {
    [scraperName: string]: {
        price?: number;
        title?: string;
        description?: string;
        images?: string[];
        availability?: string;
        ratings?: number;
        reviews_count?: number;
        url?: string;
        scraped_at?: string;
    };
}

interface CallbackPayload {
    job_id: string;
    status: 'running' | 'completed' | 'failed';
    runner_name?: string;
    lease_token?: string;
    error_message?: string;
    results?: {
        skus_processed?: number;
        scrapers_run?: string[];
        data?: Record<string, ScrapedData>;
    };
}

export async function POST(request: NextRequest) {
    try {
        // Read body as text first for HMAC validation
        const bodyText = await request.text();
        let payload: CallbackPayload;
        
        try {
            payload = JSON.parse(bodyText);
        } catch {
            return NextResponse.json(
                { error: 'Invalid JSON payload' },
                { status: 400 }
            );
        }

        // Validate authentication using unified auth function
        const runner = await validateRunnerAuth({
            apiKey: request.headers.get('X-API-Key'),
            authorization: request.headers.get('Authorization'),
        });

        if (!runner) {
            console.error('[Callback] Authentication failed - no valid credentials');
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        console.log(`[Callback] Authenticated via ${runner.authMethod}: ${runner.runnerName}`);

        if (!payload.job_id || !payload.status) {
            return NextResponse.json(
                { error: 'Missing required fields: job_id, status' },
                { status: 400 }
            );
        }

        const supabase = getSupabaseAdmin();

        const { data: existingJob, error: existingJobError } = await supabase
            .from('scrape_jobs')
            .select('id, status, lease_token, attempt_count, max_attempts')
            .eq('id', payload.job_id)
            .single();

        if (existingJobError || !existingJob) {
            return NextResponse.json(
                { error: 'Job not found' },
                { status: 404 }
            );
        }

        if (existingJob.lease_token && payload.lease_token !== existingJob.lease_token) {
            return NextResponse.json(
                { error: 'Lease token mismatch' },
                { status: 409 }
            );
        }

        // Update job status
        const nowIso = new Date().toISOString();
        const updateData: Record<string, unknown> = {
            updated_at: nowIso,
        };

        if (payload.status === 'running') {
            updateData.status = 'running';
            updateData.heartbeat_at = nowIso;
        } else if (payload.status === 'completed') {
            updateData.status = 'completed';
            updateData.completed_at = nowIso;
            updateData.heartbeat_at = nowIso;
            updateData.lease_token = null;
            updateData.leased_at = null;
            updateData.lease_expires_at = null;
        } else {
            const canRetry = existingJob.attempt_count < existingJob.max_attempts;
            if (canRetry) {
                const backoffMs = Math.min(2 ** existingJob.attempt_count * 60 * 1000, 15 * 60 * 1000);
                updateData.status = 'pending';
                updateData.backoff_until = new Date(Date.now() + backoffMs).toISOString();
                updateData.lease_token = null;
                updateData.leased_at = null;
                updateData.lease_expires_at = null;
                updateData.heartbeat_at = nowIso;
                updateData.runner_name = null;
            } else {
                updateData.status = 'failed';
                updateData.completed_at = nowIso;
                updateData.heartbeat_at = nowIso;
                updateData.lease_token = null;
                updateData.leased_at = null;
                updateData.lease_expires_at = null;
            }
        }

        if (payload.error_message) {
            updateData.error_message = payload.error_message;
        }

        let jobUpdateQuery = supabase
            .from('scrape_jobs')
            .update(updateData)
            .eq('id', payload.job_id);

        if (existingJob.lease_token) {
            jobUpdateQuery = jobUpdateQuery.eq('lease_token', existingJob.lease_token);
        }

        const { error: updateError } = await jobUpdateQuery;

        if (updateError) {
            console.error('[Callback] Failed to update job:', updateError);
            return NextResponse.json(
                { error: 'Failed to update job' },
                { status: 500 }
            );
        }

        // Update runner status
        const runnerName = payload.runner_name || runner.runnerName;
        const runnerStatus = payload.status === 'running' ? 'busy' : 'online';
        const currentJobId = payload.status === 'running' ? payload.job_id : null;

        await supabase
            .from('scraper_runners')
            .update({
                status: runnerStatus,
                last_seen_at: nowIso,
                current_job_id: currentJobId,
                metadata: { 
                    last_ip: request.headers.get('x-forwarded-for') || 'unknown',
                    auth_method: runner.authMethod,
                }
            })
            .eq('name', runnerName);

        // Fetch job metadata to check if this is a test job
        const { data: jobData } = await supabase
            .from('scrape_jobs')
            .select('test_mode, metadata')
            .eq('id', payload.job_id)
            .single();

        const isTestJob = jobData?.test_mode === true;
        const testRunId = jobData?.metadata?.test_run_id as string | undefined;

        if (isTestJob) {
            console.log(`[Callback] Test job detected: ${payload.job_id} (test_run_id: ${testRunId}) - Will NOT update products_ingestion or trigger consolidation`);
        } else {
            console.log(`[Callback] Production job: ${payload.job_id} - Processing ${payload.results?.data ? Object.keys(payload.results.data).length : 0} scraped products`);
            // Process scraped data if job completed successfully and is NOT a test job
            if (payload.status === 'completed' && payload.results?.data) {
                const skus = Object.keys(payload.results.data);

                for (const sku of skus) {
                    const scrapedData = payload.results.data[sku];

                    const { data: product } = await supabase
                        .from('products_ingestion')
                        .select('sources')
                        .eq('sku', sku)
                        .single();

                    const existingSources = (product?.sources as Record<string, unknown>) || {};
                    const updatedSources = {
                        ...existingSources,
                        ...scrapedData,
                        _last_scraped: new Date().toISOString(),
                    };

                const { error: productError } = await supabase
                    .from('products_ingestion')
                    .update({
                        sources: updatedSources,
                        pipeline_status: 'scraped',
                        is_test_run: isTestJob,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('sku', sku);

                    if (productError) {
                        console.error(`[Callback] Failed to update product ${sku}:`, productError);
                    }
                }

                console.log(`[Callback] Updated ${skus.length} products with scraped data (test_mode: ${isTestJob})`);

                // Trigger consolidation for scraped products (Event-Driven Automation)
                await onScraperComplete(payload.job_id, skus);
            }
        }

        // Store full results for audit/debugging
        if (payload.status === 'completed' && payload.results) {
            const { error: insertError } = await supabase
                .from('scrape_results')
                .insert({
                    job_id: payload.job_id,
                    runner_name: runnerName,
                    data: payload.results,
                });

            if (insertError) {
                console.error('[Callback] Failed to insert results:', insertError);
            }
        }

        console.log(`[Callback] Job ${payload.job_id} updated to ${payload.status} by ${runnerName}`);

        // Update scraper_test_runs if this is a test job with a test_run_id
        if ((payload.status === 'completed' || payload.status === 'failed') && testRunId) {
            console.log(`[Callback] Updating test run ${testRunId} for job ${payload.job_id}`);

            // Calculate test results from the scrape results
            let testStatus: 'passed' | 'failed' | 'partial' = 'failed';
            let results: Array<{
              sku: string;
              status: 'success' | 'no_results' | 'error' | 'timeout';
              data?: Record<string, unknown>;
              error_message?: string;
              duration_ms?: number;
            }> = [];

            if (payload.results?.data) {
              const skus = Object.keys(payload.results.data);
              results = skus.map(sku => {
                const scraperData = payload.results?.data?.[sku];
                const hasData = scraperData && Object.keys(scraperData).some(k => k !== 'scraped_at');
                return {
                  sku,
                  status: hasData ? 'success' : 'no_results',
                  data: scraperData,
                };
              });

              const allSuccess = results.every(r => r.status === 'success' || r.status === 'no_results');
              testStatus = allSuccess ? 'passed' : 'partial';
            }

            await supabase
              .from('scraper_test_runs')
              .update({
                status: testStatus,
                results,
                completed_at: new Date().toISOString(),
              })
              .eq('id', testRunId);

            console.log(`[Callback] Updated test run ${testRunId} with status: ${testStatus}`);
          }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Callback] Error processing request:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
