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
import { normalizeProductSources } from '@/lib/product-sources';
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

type TelemetryStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

interface TelemetryStep {
    step_index: number;
    action_type: string;
    status: TelemetryStepStatus;
    started_at?: string;
    completed_at?: string;
    duration_ms?: number;
    error_message?: string;
    extracted_data?: Record<string, unknown>;
    sku?: string;
}

interface TelemetrySelector {
    sku?: string;
    selector_name: string;
    selector_value: string;
    status: 'FOUND' | 'MISSING' | 'ERROR' | 'SKIPPED';
    error_message?: string;
    duration_ms?: number;
}

interface TelemetryExtraction {
    sku?: string;
    field_name: string;
    field_value?: string;
    status: 'SUCCESS' | 'EMPTY' | 'ERROR' | 'NOT_FOUND';
    error_message?: string;
    duration_ms?: number;
}

async function persistTestRunTelemetry(
    supabase: SupabaseClient,
    params: {
        testRunId: string;
        scraperId: string | null;
        steps?: TelemetryStep[];
        selectors?: TelemetrySelector[];
        extractions?: TelemetryExtraction[];
    }
): Promise<void> {
    const { testRunId, scraperId, steps, selectors, extractions } = params;

    if (steps && steps.length > 0) {
        const stepRows = steps.map((step) => ({
            test_run_id: testRunId,
            step_index: step.step_index,
            action_type: step.action_type,
            status: step.status,
            started_at: step.started_at ?? null,
            completed_at: step.completed_at ?? null,
            duration_ms: step.duration_ms ?? null,
            error_message: step.error_message ?? null,
            extracted_data: step.extracted_data ?? {},
        }));

        const { error: stepsError } = await supabase
            .from('scraper_test_run_steps')
            .upsert(stepRows, { onConflict: 'test_run_id,step_index' });

        if (stepsError) {
            console.warn(`[Callback] Failed to persist test telemetry steps for run ${testRunId}:`, stepsError.message);
        }
    }

    if (scraperId && selectors && selectors.length > 0) {
        const selectorRows = selectors.map((selector) => ({
            test_run_id: testRunId,
            scraper_id: scraperId,
            sku: selector.sku ?? '',
            selector_name: selector.selector_name,
            selector_value: selector.selector_value,
            status: selector.status,
            error_message: selector.error_message ?? null,
            duration_ms: selector.duration_ms ?? null,
        }));

        const { error: selectorError } = await supabase
            .from('scraper_selector_results')
            .insert(selectorRows);

        if (selectorError) {
            console.warn(`[Callback] Failed to persist selector telemetry for run ${testRunId}:`, selectorError.message);
        }
    }

    if (scraperId && extractions && extractions.length > 0) {
        const extractionRows = extractions.map((extraction) => ({
            test_run_id: testRunId,
            scraper_id: scraperId,
            sku: extraction.sku ?? '',
            field_name: extraction.field_name,
            field_value: extraction.field_value ?? null,
            status: extraction.status,
            error_message: extraction.error_message ?? null,
            duration_ms: extraction.duration_ms ?? null,
        }));

        const { error: extractionError } = await supabase
            .from('scraper_extraction_results')
            .insert(extractionRows);

        if (extractionError) {
            console.warn(`[Callback] Failed to persist extraction telemetry for run ${testRunId}:`, extractionError.message);
        }
    }
}

async function persistJobLogs(
    supabase: SupabaseClient,
    jobId: string,
    logs: Array<{ level: string; message: string; timestamp?: string; details?: Record<string, unknown> }>
): Promise<void> {
    if (!logs.length) {
        return;
    }

    const logRows = logs.map((log) => ({
        job_id: jobId,
        level: (log.level || 'info').toLowerCase(),
        message: log.message,
        details: log.details ?? null,
        created_at: log.timestamp ?? new Date().toISOString(),
    }));

    const { error } = await supabase
        .from('scrape_job_logs')
        .insert(logRows);

    if (error) {
        console.warn(`[Callback] Failed to persist job logs for job ${jobId}:`, error.message);
    }
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
            .in('sku', _skus)
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

        #KK|        }
#NN|
#BB|        // Store crawl4ai metrics if provided
#QM|        if (payload.status === 'completed' && payload.results) {
#XS|            const results = payload.results;
#NM|            if (results.extraction_strategy) {
#NM|                updateData.extraction_strategy = results.extraction_strategy;
#NM|            }
#NM|            if (results.llm_cost !== undefined) {
#NM|                updateData.llm_cost = results.llm_cost;
#NM|            }
#NM|            if (results.total_cost !== undefined) {
#NM|                updateData.total_cost = results.total_cost;
#NM|            }
#NM|            if (results.anti_bot_success_rate !== undefined) {
#NM|                updateData.anti_bot_success_rate = results.anti_bot_success_rate;
#NM|            }
#NM|            if (results.crawl4ai_errors && results.crawl4ai_errors.length > 0) {
#NM|                updateData.crawl4ai_errors = results.crawl4ai_errors;
#NM|            }
#NM|        }
#NN|
#BB|        let jobUpdateQuery = supabase

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

            const transformedResults: Record<string, Record<string, unknown>> = {};
            for (const sku of skus) {
                const scrapedDataContainer = resultsData[sku];

                if (scrapedDataContainer && typeof scrapedDataContainer === 'object') {
                    const normalizedSources = normalizeProductSources(scrapedDataContainer);
                    if (Object.keys(normalizedSources).length > 0) {
                        transformedResults[sku] = normalizedSources;
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
                
                // For test jobs, still update the test run status even if duplicate
                // This ensures test runs don't stay stuck in 'pending'
                if (isTestJob && testRunId) {
                    console.log(`[Callback] Test job duplicate - ensuring test run ${testRunId} is updated`);
                    // Test run update will be handled below after this block
                } else if (!isTestJob) {
                    // For production jobs, truly skip on duplicate
                    return NextResponse.json({
                        success: true,
                        idempotent: true,
                        message: 'Callback already processed',
                    });
                }
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

            // Only update test runs that exist and are still pending
            if (testRunId) {
                // First check if test run exists and is pending
                const { data: existingRun, error: checkError } = await supabase
                    .from('scraper_test_runs')
                    .select('id, status, scraper_id')
                    .eq('id', testRunId)
                    .single();

                if (checkError) {
                    console.warn(`[Callback] Test run ${testRunId} not found or error checking:`, checkError.message);
                } else if (existingRun?.status === 'pending') {
                    // Update test run with error handling
                    const { error: testRunError } = await supabase
                        .from('scraper_test_runs')
                        .update({
                            status: testStatus,
                            results,
                            completed_at: new Date().toISOString(),
                        })
                        .eq('id', testRunId);
                    if (testRunError) {
                        console.error(`[Callback] Failed to update test run ${testRunId}:`, testRunError.message);
                    } else {
                        console.log(`[Callback] Successfully updated test run ${testRunId} with status: ${testStatus}`);
                    }

                    // Persist telemetry and logs for test runs
                    const telemetry = payload.results?.telemetry;
                    const logs = payload.results?.logs;

                    if (telemetry || logs) {
                        await persistTestRunTelemetry(supabase, {
                            testRunId,
                            scraperId: existingRun?.scraper_id ?? null,
                            steps: telemetry?.steps,
                            selectors: telemetry?.selectors,
                            extractions: telemetry?.extractions,
                        });

                        if (logs && Array.isArray(logs)) {
                            await persistJobLogs(supabase, payload.job_id, logs);
                        }
                    }
                } else {
                    console.log(`[Callback] Test run ${testRunId} already processed with status: ${existingRun?.status}`);
                }
        }
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
