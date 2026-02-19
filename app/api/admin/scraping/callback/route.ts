import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import { submitBatch } from '@/lib/consolidation/batch-service';
import {
    parseScraperCallbackPayload,
    ScraperCallbackPayload,
    isCallbackValidationSuccess,
} from '@/lib/scraper-callback/contract';
import {
    persistProductsIngestionSourcesPartial,
} from '@/lib/scraper-callback/products-ingestion';
import {
    checkIdempotency,
    recordCallbackProcessed,
} from '@/lib/scraper-callback/idempotency';

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
 * NOTE: Currently disabled - consolidation is now manually triggered by users
 */
async function onScraperComplete(jobId: string, _skus: string[]): Promise<void> {
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

        // NOTE: Consolidation is now manually triggered by users via the UI
        // Previously: This would auto-submit scraped products for AI consolidation
        console.log(`[Callback] Skipping auto-consolidation for job ${jobId} - manual trigger required`);
    } catch (error) {
        console.error(`[Callback] onScraperComplete error for job ${jobId}:`, error);
    }
}

export async function POST(request: NextRequest) {
    try {
        // Read body as text first for HMAC validation
        const bodyText = await request.text();
        const payloadResult = parseScraperCallbackPayload(bodyText);

        if (!payloadResult.success) {
            return NextResponse.json(
                { error: payloadResult.error.message },
                { status: 400 }
            );
        }

        if (!isCallbackValidationSuccess(payloadResult)) {
            return NextResponse.json(
                { error: 'Invalid callback payload' },
                { status: 400 }
            );
        }

        const payload: ScraperCallbackPayload = payloadResult.payload;

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
        const resultsData = payload.results?.data;

        if (isTestJob) {
            console.log(`[Callback] Test job detected: ${payload.job_id} (test_run_id: ${testRunId}) - Will NOT update products_ingestion or trigger consolidation`);
        } else {
            const scrapedCount = resultsData ? Object.keys(resultsData).length : 0;
            console.log(`[Callback] Production job: ${payload.job_id} - Processing ${scrapedCount} scraped products`);
        }

        if (payload.status === 'completed' && resultsData) {
            const skus = Object.keys(resultsData);
            
            // Transform results to handle nested scraper format: { "bradley": { title, price, images } }
            const transformedResults: Record<string, Record<string, unknown>> = {};
            for (const sku of skus) {
                const scrapedDataContainer = resultsData[sku];
                
                // The scraper sends data in format: { "bradley": { title, price, images } }
                // We need to extract the first scraper's data
                if (scrapedDataContainer && typeof scrapedDataContainer === 'object') {
                    const scraperNames = Object.keys(scrapedDataContainer);
                    const scraperName = scraperNames[0];
                    const scrapedData = scraperName 
                        ? (scrapedDataContainer as Record<string, unknown>)[scraperName] 
                        : scrapedDataContainer;

                    if (scrapedData && typeof scrapedData === 'object') {
                        transformedResults[sku] = scrapedData as Record<string, unknown>;
                    } else {
                        console.log(`[Callback] No valid scraped data found for SKU ${sku}`);
                    }
                }
            }

            const idempotencyCheck = await checkIdempotency(
                supabase,
                payload.job_id,
                'admin',
                transformedResults
            );

            if (idempotencyCheck.isDuplicate) {
                console.log(`[Callback] Duplicate callback detected for job ${payload.job_id}. Skipping side effects.`);
                return NextResponse.json({
                    success: true,
                    idempotent: true,
                    message: 'Callback already processed',
                });
            }

            if (isTestJob) {
                console.log(`[Callback] Test job ${payload.job_id} completed with ${skus.length} SKUs. Skipping products_ingestion persistence.`);
            } else {
                const persistenceTimestamp = new Date().toISOString();

                try {
                    const { persisted, missing } = await persistProductsIngestionSourcesPartial(
                        supabase,
                        transformedResults,
                        false,
                        persistenceTimestamp
                    );

                    if (missing.length > 0) {
                        console.warn(
                            `[Callback] Job ${payload.job_id}: ${missing.length} SKU(s) not found in products_ingestion, skipped: ${missing.join(', ')}`
                        );
                    }

                    console.log(`[Callback] Updated ${persisted.length} products with scraped data`);
                } catch (error) {
                    console.error(`[Callback] Failed to persist results for job ${payload.job_id}:`, error);
                    throw error;
                }

                console.log(`[Callback] Updated ${skus.length} products with scraped data (test_mode: ${isTestJob})`);

                // NOTE: Consolidation is now manually triggered by users
                // Previously: await onScraperComplete(payload.job_id, skus);
            }

            const recordResult = await recordCallbackProcessed(
                supabase,
                payload.job_id,
                runnerName,
                idempotencyCheck.key,
                payload.results || {}
            );

            if (!recordResult.success) {
                console.warn(`[Callback] Failed to record idempotency marker: ${recordResult.error}`);
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
