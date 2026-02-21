import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import { submitBatch } from '@/lib/consolidation/batch-service';
import { parseChunkCallbackPayload, ChunkCallbackPayload } from '@/lib/scraper-callback/contract';
import {
    persistProductsIngestionSourcesPartial,
} from '@/lib/scraper-callback/products-ingestion';
import { mergeProductSources, normalizeProductSources } from '@/lib/product-sources';
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

interface ChunkCallbackRequest {
    chunk_id: string;
    job_id?: string;
    status: 'completed' | 'failed';
    runner_name?: string;
    results?: {
        skus_processed?: number;
        skus_successful?: number;
        skus_failed?: number;
        data?: Record<string, unknown>;
    };
    error_message?: string;
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

            const existing = aggregated[sku] || {};
            aggregated[sku] = mergeProductSources(existing, normalizedSources);
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

async function triggerConsolidationForSkus(
    _supabase: SupabaseClient,
    jobId: string,
    _skus: string[]
): Promise<void> {
    if (_skus.length === 0) return;

    const { data: products, error: productsError } = await _supabase
        .from('products_ingestion')
        .select('sku, sources')
        .in('sku', _skus)
        .eq('pipeline_status', 'scraped');

    if (productsError) {
        throw new Error(`Failed to fetch scraped products for consolidation: ${productsError.message}`);
    }

    if (!products || products.length === 0) {
        console.log(`[Chunk Callback] No scraped products to consolidate for job ${jobId}`);
        return;
    }

    const productSources = products.map((p) => ({
        sku: p.sku,
        sources: (p.sources as Record<string, unknown>) || {},
    }));

    const consolidationResult = await submitBatch(productSources, {
        description: `Auto-consolidation for scrape job ${jobId}`,
        auto_apply: true,
        scrape_job_id: jobId,
    });

    if (consolidationResult.success && consolidationResult.batch_id) {
        console.log(`[Chunk Callback] Consolidation batch ${consolidationResult.batch_id} created for job ${jobId}`);
        return;
    }

    if (!consolidationResult.success) {
        console.error(`[Chunk Callback] Consolidation failed for job ${jobId}:`, consolidationResult.error);
    }
}

export async function POST(request: NextRequest) {
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

        const text = await request.text();
        const payloadResult = parseChunkCallbackPayload(text);

        if (!payloadResult.success) {
            return NextResponse.json(
                { error: payloadResult.error.message },
                { status: 400 }
            );
        }

        const payload: ChunkCallbackPayload = payloadResult.payload;
        const { chunk_id, status, results, error_message } = payload;

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

        // Update chunk status and results
        const updateData: Record<string, unknown> = {
            status,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        if (results) {
            updateData.results = results.data || {};
            updateData.skus_processed = results.skus_processed || 0;
            updateData.skus_successful = results.skus_successful || 0;
            updateData.skus_failed = results.skus_failed || 0;
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

        // Check if all chunks for this job are complete
        const jobId = chunk.job_id;
        const { data: chunkStats, error: statsError } = await supabase
            .from('scrape_job_chunks')
            .select('status')
            .eq('job_id', jobId);

        if (!statsError && chunkStats) {
            const totalChunks = chunkStats.length;
            const completedChunks = chunkStats.filter(c => c.status === 'completed').length;
            const failedChunks = chunkStats.filter(c => c.status === 'failed').length;
            const pendingOrRunning = chunkStats.filter(c => c.status === 'pending' || c.status === 'running').length;

            console.log(`[Chunk Callback] Job ${jobId} progress: ${completedChunks + failedChunks}/${totalChunks} chunks done (${pendingOrRunning} in progress)`);

            // If all chunks are complete (success or failure), update job status
            if (pendingOrRunning === 0) {
                const jobStatus = failedChunks > 0 && completedChunks === 0 ? 'failed' : 'completed';

                // Aggregate results from all chunks
                const { data: allChunks } = await supabase
                    .from('scrape_job_chunks')
                    .select('results, skus_processed, skus_successful, skus_failed')
                    .eq('job_id', jobId);

                const aggregatedResults = {
                    chunks_total: totalChunks,
                    chunks_completed: completedChunks,
                    chunks_failed: failedChunks,
                    skus_processed: allChunks?.reduce((sum, c) => sum + (c.skus_processed || 0), 0) || 0,
                    skus_successful: allChunks?.reduce((sum, c) => sum + (c.skus_successful || 0), 0) || 0,
                    skus_failed: allChunks?.reduce((sum, c) => sum + (c.skus_failed || 0), 0) || 0,
                };

                const { data: updatedJob, error: jobUpdateError } = await supabase
                    .from('scrape_jobs')
                    .update({
                        status: jobStatus,
                        completed_at: new Date().toISOString(),
                    })
                    .eq('id', jobId)
                    .select('id, test_mode')
                    .single();

                if (jobUpdateError) {
                    console.error(`[Chunk Callback] Failed to update job ${jobId}:`, jobUpdateError);
                }

                const isTestJob = updatedJob?.test_mode === true;

                if (jobStatus === 'completed' && updatedJob) {
                    const aggregatedResultsBySku = mergeChunkResults(allChunks || []);
                    const aggregatedSkuCount = Object.keys(aggregatedResultsBySku).length;

                    if (aggregatedSkuCount > 0) {
                        const idempotencyCheck = await checkIdempotency(
                            supabase,
                            jobId,
                            'chunk',
                            aggregatedResultsBySku
                        );

                        if (idempotencyCheck.isDuplicate) {
                            console.log(`[Chunk Callback] Duplicate callback detected for job ${jobId}. Skipping side effects.`);
                            return NextResponse.json({
                                success: true,
                                idempotent: true,
                                message: 'Callback already processed',
                            });
                        }

                        try {
                            const persistedSkus = await persistChunkResultsToPipeline(
                                supabase,
                                jobId,
                                aggregatedResultsBySku,
                                isTestJob
                            );

    // NOTE: Consolidation is now manually triggered by users
    // Previously: await triggerConsolidationForSkus(supabase, jobId, persistedSkus);
    // await triggerConsolidationForSkus(supabase, jobId, persistedSkus);
    console.log(`[Chunk Callback] Job ${jobId} completed - consolidation must be triggered manually`);

                            const recordResult = await recordCallbackProcessed(
                                supabase,
                                jobId,
                                runner.runnerName,
                                idempotencyCheck.key,
                                {
                                    skus_processed: aggregatedResults.skus_processed,
                                    skus_successful: aggregatedResults.skus_successful,
                                    skus_failed: aggregatedResults.skus_failed,
                                    data: aggregatedResultsBySku,
                                }
                            );

                            if (!recordResult.success) {
                                console.warn(`[Chunk Callback] Failed to record idempotency marker: ${recordResult.error}`);
                            }
                        } catch (persistError) {
                            console.error(`[Chunk Callback] Failed to persist aggregated results for job ${jobId}:`, persistError);
                        }
                    } else {
                        console.log(`[Chunk Callback] Job ${jobId} completed with no aggregated SKU data to persist`);
                    }
                }

                console.log(`[Chunk Callback] Job ${jobId} completed with status: ${jobStatus}`, aggregatedResults);
            }
        }

        // Update runner status to online (not busy)
        const runnerName = runner.runnerName;
        await supabase
            .from('scraper_runners')
            .update({
                status: 'online',
                last_seen_at: new Date().toISOString(),
            })
            .eq('name', runnerName);

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
