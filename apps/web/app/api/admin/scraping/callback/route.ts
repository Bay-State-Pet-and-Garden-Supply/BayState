import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import {
    parseScraperCallbackPayload,
    ScraperCallbackPayload,
    isCallbackValidationSuccess,
} from '@/lib/scraper-callback/contract';
import {
    persistProductsIngestionSourcesPartial,
} from '@/lib/scraper-callback/products-ingestion';
import { filterMeaningfulProductSources, hasMeaningfulProductSourceData, normalizeProductSources } from '@/lib/product-sources';
import {
    checkIdempotency,
    recordCallbackProcessedWithRetry,
} from '@/lib/scraper-callback/idempotency';
import {
    finalizeTestJob,
    persistChunkTelemetry,
} from '@/lib/scraper-callback/test-job-utils';
import type { ChunkTelemetry } from '@/lib/scraper-callback/test-job-utils';

function getSupabaseAdmin(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing Supabase configuration');
    }
    return createClient(url, key);
}



type ExtractionStrategy = 'css' | 'xpath' | 'llm';

interface Crawl4AiMetadata {
    extractionStrategies: ExtractionStrategy[];
    costBreakdown: Record<string, unknown> | null;
    antiBotMetrics: Record<string, unknown> | null;
    llmCount: number;
    llmFreeCount: number;
    llmRatio: number | null;
}

function normalizeExtractionStrategies(value: unknown): ExtractionStrategy[] {
    const acceptedStrategies: ExtractionStrategy[] = ['css', 'xpath', 'llm'];

    const toStrategy = (candidate: unknown): ExtractionStrategy | null => {
        if (typeof candidate !== 'string') {
            return null;
        }

        const lower = candidate.toLowerCase();
        return acceptedStrategies.includes(lower as ExtractionStrategy) ? (lower as ExtractionStrategy) : null;
    };

    if (typeof value === 'string') {
        const strategy = toStrategy(value);
        return strategy ? [strategy] : [];
    }

    if (Array.isArray(value)) {
        return value
            .map(toStrategy)
            .filter((strategy): strategy is ExtractionStrategy => strategy !== null);
    }

    if (value && typeof value === 'object') {
        return Object.values(value)
            .map(toStrategy)
            .filter((strategy): strategy is ExtractionStrategy => strategy !== null);
    }

    return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractCrawl4AiMetadata(payload: ScraperCallbackPayload): Crawl4AiMetadata {
    const results = payload.results;
    const crawl4ai = isRecord(results?.crawl4ai) ? results.crawl4ai : null;

    const strategySource = crawl4ai?.extraction_strategy ?? results?.extraction_strategy;
    const extractionStrategies = normalizeExtractionStrategies(strategySource);

    const costBreakdownSource = crawl4ai?.cost_breakdown ?? results?.cost_breakdown;
    const antiBotSource = crawl4ai?.anti_bot_metrics ?? results?.anti_bot_metrics;

    const costBreakdown = isRecord(costBreakdownSource) ? costBreakdownSource : null;
    const antiBotMetrics = isRecord(antiBotSource) ? antiBotSource : null;

    const llmCount = extractionStrategies.filter((strategy) => strategy === 'llm').length;
    const llmFreeCount = extractionStrategies.filter((strategy) => strategy !== 'llm').length;
    const totalCount = llmCount + llmFreeCount;

    return {
        extractionStrategies,
        costBreakdown,
        antiBotMetrics,
        llmCount,
        llmFreeCount,
        llmRatio: totalCount > 0 ? llmCount / totalCount : null,
    };
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

        const earlyIdempotencyCheck = await checkIdempotency(
            supabase,
            payload.job_id,
            'admin',
            payload.results?.data
        );

        if (earlyIdempotencyCheck.isDuplicate) {
            return NextResponse.json({
                success: true,
                idempotent: true,
                message: 'Callback already processed',
            });
        }

        const idempotencyKey = earlyIdempotencyCheck.key;

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

        const crawl4aiMetadata = extractCrawl4AiMetadata(payload);
        const { data: existingJobMetadata } = await supabase
            .from('scrape_jobs')
            .select('metadata')
            .eq('id', payload.job_id)
            .single();

        const priorMetadata = (existingJobMetadata?.metadata && typeof existingJobMetadata.metadata === 'object')
            ? (existingJobMetadata.metadata as Record<string, unknown>)
            : {};

        const priorCrawl4Ai = (priorMetadata.crawl4ai && typeof priorMetadata.crawl4ai === 'object')
            ? (priorMetadata.crawl4ai as Record<string, unknown>)
            : {};

        const previousLlmCount = typeof priorCrawl4Ai.llm_count === 'number' ? priorCrawl4Ai.llm_count : 0;
        const previousLlmFreeCount = typeof priorCrawl4Ai.llm_free_count === 'number' ? priorCrawl4Ai.llm_free_count : 0;
        const cumulativeLlmCount = previousLlmCount + crawl4aiMetadata.llmCount;
        const cumulativeLlmFreeCount = previousLlmFreeCount + crawl4aiMetadata.llmFreeCount;
        const cumulativeTotal = cumulativeLlmCount + cumulativeLlmFreeCount;

        const nextCrawl4AiMetadata: Record<string, unknown> = {
            ...priorCrawl4Ai,
            extraction_strategy: crawl4aiMetadata.extractionStrategies,
            llm_count: cumulativeLlmCount,
            llm_free_count: cumulativeLlmFreeCount,
            llm_ratio: cumulativeTotal > 0 ? cumulativeLlmCount / cumulativeTotal : null,
            callback_llm_ratio: crawl4aiMetadata.llmRatio,
            updated_at: nowIso,
        };

        if (crawl4aiMetadata.costBreakdown) {
            nextCrawl4AiMetadata.cost_breakdown = crawl4aiMetadata.costBreakdown;
        }

        if (crawl4aiMetadata.antiBotMetrics) {
            nextCrawl4AiMetadata.anti_bot_metrics = crawl4aiMetadata.antiBotMetrics;
        }

        updateData.metadata = {
            ...priorMetadata,
            crawl4ai: nextCrawl4AiMetadata,
        };

        let jobUpdateQuery = supabase
            .from('scrape_jobs')
            .update(updateData)
            .eq('id', payload.job_id);

        if (existingJob.lease_token) {
            jobUpdateQuery = jobUpdateQuery.eq('lease_token', existingJob.lease_token);
        }

        const { data: updatedJobRow, error: updateError } = await jobUpdateQuery
            .select('id')
            .maybeSingle();

        if (updateError) {
            console.error('[Callback] Failed to update job:', updateError);
            return NextResponse.json(
                { error: 'Failed to update job' },
                { status: 500 }
            );
        }

        if (!updatedJobRow) {
            console.warn(
                `[Callback] No scrape_jobs row updated for ${payload.job_id}; lease likely changed during callback processing`
            );
            return NextResponse.json(
                { error: 'Job lease changed while processing callback' },
                { status: 409 }
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
                    const filteredSources = filterMeaningfulProductSources(normalizedSources);

                    if (Object.keys(filteredSources).length > 0 && hasMeaningfulProductSourceData(filteredSources)) {
                        transformedResults[sku] = filteredSources;
                    } else {
                        console.log(`[Callback] No valid scraped data found for SKU ${sku}; skipping persistence`);
                    }
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

                    const failedAt = new Date().toISOString();
                    const { data: failedJobRow, error: compensateError } = await supabase
                        .from('scrape_jobs')
                        .update({
                            status: 'failed',
                            error_message: error instanceof Error ? error.message : 'Failed to persist callback results',
                            completed_at: failedAt,
                            updated_at: failedAt,
                        })
                        .eq('id', payload.job_id)
                        .select('id')
                        .maybeSingle();

                    if (compensateError || !failedJobRow) {
                        const compensateDetail = compensateError?.message || 'job row missing during compensating failure update';
                        console.error(
                            `[Callback] Failed compensating job update for ${payload.job_id}: ${compensateDetail}`
                        );
                        throw new Error(
                            `Failed to persist callback results and failed compensating update: ${compensateDetail}`
                        );
                    }

                    throw error;
                }

                console.log(`[Callback] Updated ${skus.length} products with scraped data (test_mode: ${isTestJob})`);

                // NOTE: Consolidation is now manually triggered by users
                // Previously: await onScraperComplete(payload.job_id, skus);
            }

            const recordResult = await recordCallbackProcessedWithRetry(
                supabase,
                payload.job_id,
                runnerName,
                idempotencyKey,
                payload.results || {}
            );

            if (!recordResult.success) {
                console.error(`[Callback] Failed to record idempotency marker: ${recordResult.error}`);
                return NextResponse.json(
                    { error: 'Failed to record callback idempotency marker' },
                    { status: 500 }
                );
            }
        }

        console.log(`[Callback] Job ${payload.job_id} updated to ${payload.status} by ${runnerName}`);

        // Finalize test job if this is a test job that has reached a terminal state
        if ((payload.status === 'completed' || payload.status === 'failed') && isTestJob) {
            console.log(`[Callback] Finalizing test job ${payload.job_id}`);

            // Persist telemetry on the job's chunks if available
            const telemetry = payload.results?.telemetry as ChunkTelemetry | undefined;
            if (telemetry) {
                // Find the chunk(s) for this job and persist telemetry
                const { data: chunks } = await supabase
                    .from('scrape_job_chunks')
                    .select('id')
                    .eq('job_id', payload.job_id);

                if (chunks && chunks.length > 0) {
                    // For non-chunked jobs, persist all telemetry on the first chunk
                    await persistChunkTelemetry(supabase, chunks[0].id, telemetry);
                }
            }

            // Persist logs
            const logs = payload.results?.logs;
            if (logs && Array.isArray(logs)) {
                await persistJobLogs(supabase, payload.job_id, logs);
            }

            // Compute final test status and update test_metadata
            await finalizeTestJob(
                supabase,
                payload.job_id,
                payload.status as 'completed' | 'failed',
            );
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
