import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import { parseChunkCallbackPayload, ChunkCallbackPayload } from '@/lib/scraper-callback/contract';
import {
    persistProductsIngestionSourcesPartial,
} from '@/lib/scraper-callback/products-ingestion';
import { filterMeaningfulProductSources, hasMeaningfulProductSourceData, mergeProductSources, normalizeProductSources } from '@/lib/product-sources';
import {
    checkIdempotency,
    recordCallbackProcessedWithRetry,
} from '@/lib/scraper-callback/idempotency';
import { finalizeTestJob, persistChunkTelemetry } from '@/lib/scraper-callback/test-job-utils';
import type { ChunkTelemetry } from '@/lib/scraper-callback/test-job-utils';
function getSupabaseAdmin(): SupabaseClient {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing Supabase configuration');
    }
    return createClient(url, key);
}

type ScrapedDataBySku = Record<string, Record<string, unknown>>;

export function mergeChunkResults(chunks: Array<{ results: unknown }>): ScrapedDataBySku {
    const aggregated: ScrapedDataBySku = {};

    for (const chunk of chunks) {
        if (!chunk.results || typeof chunk.results !== 'object') continue;
        const chunkResults = chunk.results as Record<string, unknown>;

        for (const [sku, value] of Object.entries(chunkResults)) {
            if (!value || typeof value !== 'object') continue;

            const normalizedSources = normalizeProductSources(value);
            if (Object.keys(normalizedSources).length === 0) continue;

            const filteredSources = filterMeaningfulProductSources(normalizedSources);
            if (!hasMeaningfulProductSourceData(filteredSources)) continue;

            const existing = aggregated[sku] || {};
            aggregated[sku] = mergeProductSources(existing, filteredSources);
        }
    }

    return aggregated;
}

export async function persistChunkResultsToPipeline(
    supabase: SupabaseClient,
    jobId: string,
    aggregatedResults: ScrapedDataBySku,
    isTestJob: boolean
): Promise<string[]> {
    if (isTestJob) {
        console.log(
            `[Chunk Callback] Test job ${jobId} - skipping products_ingestion persistence to avoid pipeline mutation`
        );
        return [];
    }

    const nowIso = new Date().toISOString();
    const { persisted, missing } = await persistProductsIngestionSourcesPartial(
        supabase,
        aggregatedResults,
        isTestJob,
        nowIso
    );

    if (missing.length > 0) {
        console.warn(
            `[Chunk Callback] Job ${jobId}: ${missing.length} SKU(s) not found in products_ingestion, skipped: ${missing.join(', ')}`
        );
    }

    console.log(`[Chunk Callback] Updated ${persisted.length} products_ingestion rows for job ${jobId}`);
    return persisted;
}

export async function POST(request: NextRequest) {
    console.log('[Chunk Callback] POST request received');
    try {
        // Validate authentication
        const runner = await validateRunnerAuth({
            apiKey: request.headers.get('X-API-Key'),
            authorization: request.headers.get('Authorization'),
        });

        if (!runner) {
            console.error('[Chunk Callback] Authentication failed');
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        console.log(`[Chunk Callback] Authenticated runner: ${runner.runnerName}`);

        const text = await request.text();
        console.log(`[Chunk Callback] Payload length: ${text.length}`);
        
        const payloadResult = parseChunkCallbackPayload(text);

        if (!payloadResult.success) {
            console.error('[Chunk Callback] Payload parsing failed:', payloadResult.error.message);
            return NextResponse.json(
                { error: payloadResult.error.message },
                { status: 400 }
            );
        }

        const payload: ChunkCallbackPayload = payloadResult.payload;
        const { chunk_id, status, results, error_message } = payload;
        console.log(`[Chunk Callback] Processing chunk ${chunk_id}, status: ${status}`);

        const supabase = getSupabaseAdmin();

        // Get chunk details first
        const { data: chunk, error: chunkError } = await supabase
            .from('scrape_job_chunks')
            .select('*, scrape_jobs(id, status)')
            .eq('id', chunk_id)
            .single();

        if (chunkError || !chunk) {
            console.error('[Chunk Callback] Chunk not found:', chunk_id);
            return NextResponse.json(
                { error: 'Chunk not found' },
                { status: 404 }
            );
        }

        const jobId = chunk.job_id;
        const { data: updatedJobRecord } = await supabase
            .from('scrape_jobs')
            .select('test_mode')
            .eq('id', jobId)
            .single();

        const isTestJob = updatedJobRecord?.test_mode === true;

        const chunkIdempotency = await checkIdempotency(
            supabase,
            `${jobId}:${chunk_id}`,
            'chunk',
            results?.data
        );

        if (chunkIdempotency.isDuplicate) {
            return NextResponse.json({
                success: true,
                idempotent: true,
                chunk_id,
                status,
            });
        }

        let effectiveChunkStatus = status;
        let persistenceErrorMessage: string | null = null;

        if (status === 'completed' && results?.data) {
            const chunkResultsBySku = mergeChunkResults([{ results: results.data }]);
            if (Object.keys(chunkResultsBySku).length > 0) {
                try {
                    await persistChunkResultsToPipeline(supabase, jobId, chunkResultsBySku, isTestJob);
                    console.log(`[Chunk Callback] Persisted ${Object.keys(chunkResultsBySku).length} SKUs from chunk ${chunk.chunk_index}`);
                } catch (persistError) {
                    effectiveChunkStatus = 'failed';
                    persistenceErrorMessage = persistError instanceof Error ? persistError.message : 'Failed to persist chunk results';
                    console.error(`[Chunk Callback] Failed to persist chunk results for job ${jobId}:`, persistError);
                }
            }
        }

        // Update chunk status and results
        const updateData: Record<string, unknown> = {
            status: effectiveChunkStatus,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        if (results) {
            updateData.results = results.data || {};
            updateData.skus_processed = results.skus_processed || 0;
            updateData.skus_successful = results.skus_successful || 0;
            updateData.skus_failed = results.skus_failed || 0;
        }

        if (error_message || persistenceErrorMessage) {
            updateData.error_message = persistenceErrorMessage || error_message;
        }

        const { error: updateError } = await supabase
            .from('scrape_job_chunks')
            .update(updateData)
            .eq('id', chunk_id);

        if (updateError) {
            console.error('[Chunk Callback] Update failed:', updateError);
            return NextResponse.json(
                { error: 'Failed to update chunk' },
                { status: 500 }
            );
        }

        console.log(`[Chunk Callback] Chunk ${chunk.chunk_index} for job ${chunk.job_id} marked as ${effectiveChunkStatus}`);

        // Check if all chunks for this job are complete
        const { data: allChunksForJob, error: statsError } = await supabase
            .from('scrape_job_chunks')
            .select('status, skus_processed, skus_successful, skus_failed, results')
            .eq('job_id', jobId);

        if (statsError) {
            console.error(`[Chunk Callback] Failed to load chunk rollup state for job ${jobId}:`, statsError);
            return NextResponse.json(
                { error: 'Failed to compute chunk rollup' },
                { status: 500 }
            );
        }

        if (allChunksForJob) {
            const totalChunks = allChunksForJob.length;
            const completedChunks = allChunksForJob.filter((c) => c.status === 'completed').length;
            const failedChunks = allChunksForJob.filter((c) => c.status === 'failed').length;
            const pendingOrRunning = allChunksForJob.filter((c) => c.status === 'pending' || c.status === 'running').length;

            console.log(
                `[Chunk Callback] Job ${jobId} progress: ${completedChunks + failedChunks}/${totalChunks} chunks done (${pendingOrRunning} in progress)`
            );

            if (pendingOrRunning === 0) {
                const jobStatus = failedChunks > 0 ? 'failed' : 'completed';

                const aggregatedResults = {
                    chunks_total: totalChunks,
                    chunks_completed: completedChunks,
                    chunks_failed: failedChunks,
                    skus_processed: allChunksForJob?.reduce((sum, c) => sum + (c.skus_processed || 0), 0) || 0,
                    skus_successful: allChunksForJob?.reduce((sum, c) => sum + (c.skus_successful || 0), 0) || 0,
                    skus_failed: allChunksForJob?.reduce((sum, c) => sum + (c.skus_failed || 0), 0) || 0,
                };

                const { data: updatedJob, error: jobUpdateError } = await supabase
                    .from('scrape_jobs')
                    .update({
                        status: jobStatus,
                        completed_at: new Date().toISOString(),
                    })
                    .eq('id', jobId)
                    .in('status', ['pending', 'running'])
                    .select('id, test_mode, metadata')
                    .maybeSingle();

                if (jobUpdateError) {
                    console.error(`[Chunk Callback] Failed to update job ${jobId}:`, jobUpdateError);
                    return NextResponse.json(
                        { error: 'Failed to finalize job status from chunks' },
                        { status: 500 }
                    );
                }

                if (!updatedJob) {
                    console.log(`[Chunk Callback] Job ${jobId} was already finalized by another callback`);
                }

                if (jobStatus === 'completed' && !isTestJob) {
                    console.log(
                        `[Chunk Callback] Job ${jobId} completed. Consolidation remains manual and must be user-triggered.`
                    );
                }

                // Finalize test job if this is a test job
                if (isTestJob) {
                    console.log(`[Chunk Callback] Finalizing test job ${jobId}`);

                    // Persist telemetry from the last chunk if available
                    if (results?.telemetry) {
                        await persistChunkTelemetry(supabase, chunk_id, results.telemetry as ChunkTelemetry);
                    }

                    // Compute final test status and update test_metadata
                    await finalizeTestJob(
                        supabase,
                        jobId,
                        jobStatus as 'completed' | 'failed',
                    );
                }

                console.log(`[Chunk Callback] Job ${jobId} completed with status: ${jobStatus}`, aggregatedResults);
            }
        }

        const recordResult = await recordCallbackProcessedWithRetry(
            supabase,
            jobId,
            runner.runnerName,
            chunkIdempotency.key,
            results?.data || {}
        );

        if (!recordResult.success) {
            console.error(`[Chunk Callback] Failed to record idempotency marker: ${recordResult.error}`);
        }

        // Update runner status to online (not busy)
        const runnerName = runner.runnerName;
        const { error: runnerUpdateError } = await supabase
            .from('scraper_runners')
            .update({
                status: 'online',
                last_seen_at: new Date().toISOString(),
            })
            .eq('name', runnerName);

        if (runnerUpdateError) {
            console.warn(`[Chunk Callback] Failed to mark runner ${runnerName} as online: ${runnerUpdateError.message}`);
        }

        if (!recordResult.success) {
            return NextResponse.json(
                { error: 'Failed to record callback idempotency marker' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            chunk_id,
            status: effectiveChunkStatus,
        });
    } catch (error) {
        console.error('[Chunk Callback] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
