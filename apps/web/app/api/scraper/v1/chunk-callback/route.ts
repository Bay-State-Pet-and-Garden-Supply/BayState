import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import {
    parseChunkCallbackPayload,
    ChunkCallbackPayload,
    ChunkProgressPayload,
} from '@/lib/scraper-callback/contract';
import {
    persistProductsIngestionSourcesPartial,
} from '@/lib/scraper-callback/products-ingestion';
import { filterMeaningfulProductSources, hasMeaningfulProductSourceData, mergeProductSources, normalizeProductSources } from '@/lib/product-sources';
import {
    checkIdempotency,
    recordCallbackProcessed,
} from '@/lib/scraper-callback/idempotency';
import { finalizeTestJob, persistChunkTelemetry } from '@/lib/scraper-callback/test-job-utils';
import type { ChunkTelemetry } from '@/lib/scraper-callback/test-job-utils';
function getSupabaseAdmin(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing Supabase configuration');
    }
    return createClient(url, key);
}

type ScrapedDataBySku = Record<string, Record<string, unknown>>;

function isTerminalChunkStatus(status: ChunkCallbackPayload['status']): status is 'completed' | 'failed' {
    return status === 'completed' || status === 'failed';
}

export function buildProgressResults(progress: ChunkProgressPayload): ScrapedDataBySku {
    return {
        [progress.sku]: {
            [progress.scraper_name]: progress.data,
        },
    };
}

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

export function mergeChunkPayloadResults(existingResults: unknown, incomingResults: unknown): ScrapedDataBySku {
    const chunks: Array<{ results: unknown }> = [];
    if (existingResults) {
        chunks.push({ results: existingResults });
    }
    if (incomingResults) {
        chunks.push({ results: incomingResults });
    }
    return mergeChunkResults(chunks);
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
        const { chunk_id, status, results, error_message, progress } = payload;
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
        const runnerName = payload.runner_name || runner.runnerName;
        const progressResults = progress ? buildProgressResults(progress) : undefined;
        const mergedChunkResults = mergeChunkPayloadResults(
            chunk.results,
            status === 'in_progress' ? progressResults : results?.data
        );

        let idempotencyCheck:
            | Awaited<ReturnType<typeof checkIdempotency>>
            | null = null;
        if (isTerminalChunkStatus(status)) {
            idempotencyCheck = await checkIdempotency(
                supabase,
                jobId,
                'chunk',
                {
                    chunk_id,
                    status,
                    error_message: error_message ?? null,
                    results: mergedChunkResults,
                }
            );

            if (idempotencyCheck.isDuplicate) {
                console.log(
                    `[Chunk Callback] Duplicate terminal callback detected for chunk ${chunk_id}. Skipping side effects.`
                );
                return NextResponse.json({
                    success: true,
                    idempotent: true,
                    chunk_id,
                    status,
                });
            }
        }

        // Update chunk status and results
        const updateData: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };

        if (status === 'in_progress') {
            updateData.status = 'running';
        } else {
            updateData.status = status;
            updateData.completed_at = new Date().toISOString();
        }

        if (Object.keys(mergedChunkResults).length > 0) {
            updateData.results = mergedChunkResults;
        }

        if (results) {
            if (typeof results.skus_processed === 'number') {
                updateData.skus_processed = results.skus_processed;
            }
            if (typeof results.skus_successful === 'number') {
                updateData.skus_successful = results.skus_successful;
            }
            if (typeof results.skus_failed === 'number') {
                updateData.skus_failed = results.skus_failed;
            }
        }

        if (error_message) {
            updateData.error_message = error_message;
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

        console.log(`[Chunk Callback] Chunk ${chunk.chunk_index} for job ${chunk.job_id} marked as ${status}`);

        const pipelineResultsToPersist =
            status === 'in_progress'
                ? mergeChunkPayloadResults(undefined, progressResults)
                : mergedChunkResults;

        if (Object.keys(pipelineResultsToPersist).length > 0) {
            await persistChunkResultsToPipeline(supabase, jobId, pipelineResultsToPersist, isTestJob);
            console.log(
                `[Chunk Callback] Persisted ${Object.keys(pipelineResultsToPersist).length} SKU(s) from chunk ${chunk.chunk_index}`
            );
        }

        if (status === 'in_progress') {
            return NextResponse.json({
                success: true,
                chunk_id,
                status: 'running',
            });
        }

        // Check if all chunks for this job are complete
        const { data: allChunksForJob, error: statsError } = await supabase
            .from('scrape_job_chunks')
            .select('status, skus_processed, skus_successful, skus_failed, results')
            .eq('job_id', jobId);

        if (!statsError && allChunksForJob) {
            const totalChunks = allChunksForJob.length;
            const completedChunks = allChunksForJob.filter((c) => c.status === 'completed').length;
            const failedChunks = allChunksForJob.filter((c) => c.status === 'failed').length;
            const pendingOrRunning = allChunksForJob.filter((c) => c.status === 'pending' || c.status === 'running').length;

            console.log(
                `[Chunk Callback] Job ${jobId} progress: ${completedChunks + failedChunks}/${totalChunks} chunks done (${pendingOrRunning} in progress)`
            );

            if (pendingOrRunning === 0) {
                const jobStatus = failedChunks > 0 && completedChunks === 0 ? 'failed' : 'completed';

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
                    .select('id, test_mode, metadata')
                    .single();

                if (jobUpdateError) {
                    console.error(`[Chunk Callback] Failed to update job ${jobId}:`, jobUpdateError);
                }

                if (jobStatus === 'completed' && updatedJob && !isTestJob) {
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

        // Update runner status to online (not busy)
        await supabase
            .from('scraper_runners')
            .update({
                status: 'online',
                last_seen_at: new Date().toISOString(),
            })
            .eq('name', runnerName);

        if (idempotencyCheck) {
            const recordResult = await recordCallbackProcessed(
                supabase,
                jobId,
                runnerName,
                idempotencyCheck.key,
                {
                    callback_type: 'chunk',
                    chunk_id,
                    status,
                    error_message: error_message ?? null,
                    results: payload.results ?? null,
                }
            );

            if (!recordResult.success) {
                console.warn(
                    `[Chunk Callback] Failed to record idempotency marker for chunk ${chunk_id}: ${recordResult.error}`
                );
            }
        }

        return NextResponse.json({
            success: true,
            chunk_id,
            status,
        });
    } catch (error) {
        console.error('[Chunk Callback] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
