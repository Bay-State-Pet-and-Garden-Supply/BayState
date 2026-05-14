import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import { parseChunkCallbackPayload, ChunkCallbackPayload } from '@/lib/scraper-callback/contract';
import { SUPABASE_SECRET_KEY, SUPABASE_URL } from '@/lib/supabase/config';
import {
    persistProductsIngestionSourcesPartial,
    type ProvenanceContext,
} from '@/lib/scraper-callback/products-ingestion';
import { filterOfficialBrandResultsForPersistence } from '@/lib/scraper-callback/official-brand-validation';
import { evaluateScrapeQuality } from '@/lib/pipeline/scrape-quality';
import { filterMeaningfulProductSources, hasMeaningfulProductSourceData, mergeProductSources, normalizeProductSources } from '@/lib/product-sources';
import {
    checkIdempotency,
    recordCallbackProcessedWithRetry,
} from '@/lib/scraper-callback/idempotency';
import { finalizeTestJob, persistChunkTelemetry } from '@/lib/scraper-callback/test-job-utils';
import type { ChunkTelemetry } from '@/lib/scraper-callback/test-job-utils';
import {
    persistScrapeJobLogs,
    updateScrapeJobLogSummary,
} from '@/lib/scraper-log-persistence';
import {
    buildDiscoveryOfficialBrandCandidateRows,
    buildExtractedOfficialBrandCandidateRows,
    getOfficialBrandPhaseFromJob,
    persistOfficialBrandCandidateRows,
} from '@/lib/official-brand-workflow';
function getSupabaseAdmin(): SupabaseClient {
    const url = SUPABASE_URL;
    const key = SUPABASE_SECRET_KEY;
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
    isTestJob: boolean,
    officialBrandContext?: {
        isOfficialBrandJob: boolean;
        officialDomains?: string[];
        preferredDomains?: string[];
        jobConfig?: Record<string, unknown>;
    }
): Promise<string[]> {
    if (isTestJob) {
        console.log(
            `[Chunk Callback] Test job ${jobId} - skipping products_ingestion persistence to avoid pipeline mutation`
        );
        return [];
    }

    const nowIso = new Date().toISOString();
    const officialBrandFilter = officialBrandContext?.isOfficialBrandJob
        ? filterOfficialBrandResultsForPersistence(aggregatedResults, {
            officialDomains: officialBrandContext.officialDomains,
            preferredDomains: officialBrandContext.preferredDomains,
        })
        : null;
    const resultsToPersist = officialBrandFilter ? officialBrandFilter.acceptedResults : aggregatedResults;

    if (officialBrandFilter && officialBrandFilter.rejectedCount > 0) {
        Object.entries(officialBrandFilter.rejectedBySku).forEach(([sku, reason]) => {
            console.warn(`[Chunk Callback] Official Brand rejected for ${sku}: ${reason}`);
        });
    }

    // Build provenance context for the persistence call
    const provenance: ProvenanceContext = {
        sourceKind: officialBrandContext?.isOfficialBrandJob ? 'fallback_serper_ai' : 'static_scraper',
        scrapeJobId: jobId,
    };

    const { persisted, missing } = await persistProductsIngestionSourcesPartial(
        supabase,
        resultsToPersist,
        isTestJob,
        nowIso,
        provenance
    );

    if (officialBrandFilter) {
        const validationMetadata = {
            accepted_count: persisted.length,
            rejected_count: officialBrandFilter.rejectedCount,
            rejected_by_sku: officialBrandFilter.rejectedBySku,
            updated_at: nowIso,
        };

        const { data: metadataRow } = await supabase
            .from('scrape_jobs')
            .select('metadata')
            .eq('id', jobId)
            .single();

        const priorMetadata = metadataRow?.metadata && typeof metadataRow.metadata === 'object'
            ? (metadataRow.metadata as Record<string, unknown>)
            : {};

        await supabase
            .from('scrape_jobs')
            .update({
                metadata: {
                    ...priorMetadata,
                    official_brand_validation: validationMetadata,
                },
            })
            .eq('id', jobId);

        if (persisted.length > 0) {
            try {
                const extractedRows = buildExtractedOfficialBrandCandidateRows({
                    jobId,
                    resultsBySku: resultsToPersist,
                    config: officialBrandContext?.jobConfig,
                    nowIso,
                });
                await persistOfficialBrandCandidateRows(supabase, extractedRows);
            } catch (candidateError) {
                console.warn(`[Chunk Callback] Failed to mark Official Brand URL candidates as extracted for job ${jobId}:`, candidateError);
            }
        }
    }

    if (missing.length > 0) {
        console.warn(
            `[Chunk Callback] Job ${jobId}: ${missing.length} SKU(s) not found in products_ingestion, skipped: ${missing.join(', ')}`
        );
    }

    console.log(`[Chunk Callback] Updated ${persisted.length} products_ingestion rows for job ${jobId}`);
    return persisted;
}

/**
 * @deprecated URL discovery no longer dispatches to the runner.
 * Discovery runs server-side via runOfficialBrandDiscovery().
 * This function is kept for backward compatibility with in-flight
 * jobs created before the migration. Remove once all legacy jobs drain.
 */
async function persistOfficialBrandDiscoveryResults(
    supabase: SupabaseClient,
    jobId: string,
    aggregatedResults: ScrapedDataBySku,
    isTestJob: boolean,
    jobConfig?: Record<string, unknown>,
): Promise<number> {
    if (isTestJob) {
        console.log(
            `[Chunk Callback] Test discovery job ${jobId} - skipping Official Brand URL candidate persistence`
        );
        return 0;
    }

    const nowIso = new Date().toISOString();
    const cohort = jobConfig?.cohort && typeof jobConfig.cohort === 'object' && !Array.isArray(jobConfig.cohort)
        ? jobConfig.cohort as Record<string, unknown>
        : undefined;
    const rows = buildDiscoveryOfficialBrandCandidateRows({
        jobId,
        resultsBySku: aggregatedResults,
        cohort,
        nowIso,
    });
    const persistedCount = await persistOfficialBrandCandidateRows(supabase, rows);
    const skus = Array.from(new Set(Object.keys(aggregatedResults).filter(Boolean)));
    let pipelineStatusUpdatedCount = 0;

    if (skus.length > 0) {
        const { data: statusRows, error: statusError } = await supabase
            .from('products_ingestion')
            .update({ pipeline_status: 'url_review', updated_at: nowIso })
            .in('sku', skus)
            .eq('pipeline_status', 'searching')
            .select('sku');

        if (statusError) {
            console.warn(`[Chunk Callback] Failed to move Official Brand discovery SKUs to url_review for job ${jobId}:`, statusError);
        } else {
            pipelineStatusUpdatedCount = statusRows?.length ?? 0;
        }
    }

    const { data: metadataRow } = await supabase
        .from('scrape_jobs')
        .select('metadata')
        .eq('id', jobId)
        .single();

    const priorMetadata = metadataRow?.metadata && typeof metadataRow.metadata === 'object'
        ? (metadataRow.metadata as Record<string, unknown>)
        : {};

    await supabase
        .from('scrape_jobs')
        .update({
            metadata: {
                ...priorMetadata,
                official_brand_discovery: {
                    candidate_count: persistedCount,
                    sku_count: Object.keys(aggregatedResults).length,
                    pipeline_status_updated_count: pipelineStatusUpdatedCount,
                    pipeline_status_from: 'searching',
                    pipeline_status_to: 'url_review',
                    updated_at: nowIso,
                },
            },
        })
        .eq('id', jobId);

    return persistedCount;
}

function toOptionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeSkuList(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return Array.from(
        new Set(
            value
                .map((entry) => toOptionalString(entry))
                .filter((entry): entry is string => Boolean(entry))
        )
    );
}

async function markOfficialBrandExtractionCandidatesFailed(
    supabase: SupabaseClient,
    jobId: string,
    skus: string[],
    errorMessage: string,
    nowIso: string,
): Promise<void> {
    const targetSkus = Array.from(new Set(skus.filter(Boolean)));
    if (targetSkus.length === 0) {
        return;
    }

    const { error } = await supabase
        .from('official_brand_url_candidates')
        .update({
            selection_status: 'failed',
            extraction_job_id: jobId,
            error_message: errorMessage,
            updated_at: nowIso,
        })
        .eq('extraction_job_id', jobId)
        .in('sku', targetSkus)
        .in('selection_status', ['selected', 'failed']);

    if (error) {
        console.warn(`[Chunk Callback] Failed to mark Official Brand candidates as failed for job ${jobId}:`, error);
    }
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
            .select('test_mode, type, config, metadata')
            .eq('id', jobId)
            .single();

        const isTestJob = updatedJobRecord?.test_mode === true;
        const metadataRecord = updatedJobRecord?.metadata && typeof updatedJobRecord.metadata === 'object'
            ? (updatedJobRecord.metadata as Record<string, unknown>)
            : {};
        const configRecord = updatedJobRecord?.config && typeof updatedJobRecord.config === 'object'
            ? (updatedJobRecord.config as Record<string, unknown>)
            : {};
        const cohortRecord = configRecord.cohort && typeof configRecord.cohort === 'object'
            ? (configRecord.cohort as Record<string, unknown>)
            : {};
        const officialBrandPhase = getOfficialBrandPhaseFromJob({
            type: updatedJobRecord?.type,
            metadata: metadataRecord,
            config: configRecord,
        });
        const isOfficialBrandJob = Boolean(officialBrandPhase) || metadataRecord.requested_job_type === 'official_brand' || Boolean(configRecord.cohort);

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
                    // DEPRECATED: URL discovery no longer dispatches to the runner.
                    // This branch only handles in-flight jobs that were created before
                    // the server-side migration. New discovery jobs run server-side via
                    // POST /api/admin/pipeline/official-brand/discover.
                    if (officialBrandPhase === 'url_discovery') {
                        const persistedCandidates = await persistOfficialBrandDiscoveryResults(
                            supabase,
                            jobId,
                            chunkResultsBySku,
                            isTestJob,
                            configRecord,
                        );
                        console.log(`[Chunk Callback] [DEPRECATED] Persisted ${persistedCandidates} Official Brand URL candidates from chunk ${chunk.chunk_index}`);
                    } else {
                        await persistChunkResultsToPipeline(supabase, jobId, chunkResultsBySku, isTestJob, {
                            isOfficialBrandJob,
                            officialDomains: Array.isArray(cohortRecord.officialDomains) ? (cohortRecord.officialDomains as string[]) : undefined,
                            preferredDomains: Array.isArray(cohortRecord.preferredDomains) ? (cohortRecord.preferredDomains as string[]) : undefined,
                            jobConfig: configRecord,
                        });
                        console.log(`[Chunk Callback] Persisted ${Object.keys(chunkResultsBySku).length} SKUs from chunk ${chunk.chunk_index}`);
                    }
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
            updateData.planned_work_units = results.work_units_total ?? chunk.planned_work_units ?? 0;
            updateData.work_units_processed = results.work_units_processed || 0;
        }

        if (error_message || persistenceErrorMessage) {
            updateData.error_message = persistenceErrorMessage || error_message;
        }

        if (effectiveChunkStatus === 'failed' && officialBrandPhase === 'extraction' && !isTestJob) {
            await markOfficialBrandExtractionCandidatesFailed(
                supabase,
                jobId,
                normalizeSkuList(chunk.skus),
                persistenceErrorMessage || error_message || 'Official Brand extraction failed',
                new Date().toISOString(),
            );
        }

        const callbackLogs = Array.isArray(results?.logs)
            ? results.logs.filter(
                (entry) =>
                    Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
            )
            : [];

        if (callbackLogs.length > 0) {
            try {
                const latestLog = await persistScrapeJobLogs(
                    supabase,
                    jobId,
                    callbackLogs,
                    { fallbackRunnerName: runner.runnerName }
                );
                await updateScrapeJobLogSummary(supabase, jobId, latestLog);
            } catch (logError) {
                console.warn(`[Chunk Callback] Failed to persist callback logs for job ${jobId}:`, logError);
            }
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
            .select('status, skus, skus_processed, skus_successful, skus_failed, planned_work_units, work_units_processed, results')
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
                const uniqueJobSkus = Array.from(
                    new Set(
                        (allChunksForJob || []).flatMap((chunkRow) =>
                            Array.isArray(chunkRow.skus)
                                ? chunkRow.skus.filter(
                                      (sku): sku is string =>
                                          typeof sku === 'string' && sku.trim().length > 0
                                  )
                                : []
                        )
                    )
                );

                const aggregatedResults = {
                    chunks_total: totalChunks,
                    chunks_completed: completedChunks,
                    chunks_failed: failedChunks,
                    skus_processed: allChunksForJob?.reduce((sum, c) => sum + (c.skus_processed || 0), 0) || 0,
                    skus_successful: allChunksForJob?.reduce((sum, c) => sum + (c.skus_successful || 0), 0) || 0,
                    skus_failed: allChunksForJob?.reduce((sum, c) => sum + (c.skus_failed || 0), 0) || 0,
                    skus_total: uniqueJobSkus.length,
                    work_units_processed: allChunksForJob?.reduce(
                        (sum, c) => sum + (typeof c.work_units_processed === 'number' ? c.work_units_processed : 0),
                        0
                    ) || 0,
                    work_units_total: allChunksForJob?.reduce(
                        (sum, c) => sum + (typeof c.planned_work_units === 'number' ? c.planned_work_units : 0),
                        0
                    ) || 0,
                };

                const completedAt = new Date().toISOString();
                const terminalMessage = jobStatus === 'completed'
                    ? 'Chunk processing completed'
                    : (persistenceErrorMessage || error_message || `${failedChunks} chunk(s) failed`);
                const terminalProgressPercent = aggregatedResults.work_units_total > 0
                    ? Math.round((aggregatedResults.work_units_processed / aggregatedResults.work_units_total) * 100)
                    : (jobStatus === 'completed' ? 100 : 0);

                const { data: updatedJob, error: jobUpdateError } = await supabase
                    .from('scrape_jobs')
                    .update({
                        status: jobStatus,
                        completed_at: completedAt,
                        updated_at: completedAt,
                        heartbeat_at: completedAt,
                        progress_percent: jobStatus === 'completed' ? 100 : terminalProgressPercent,
                        progress_message: terminalMessage,
                        progress_phase: jobStatus,
                        progress_updated_at: completedAt,
                        progress_details: {
                            chunks_total: aggregatedResults.chunks_total,
                            chunks_completed: aggregatedResults.chunks_completed,
                            chunks_failed: aggregatedResults.chunks_failed,
                            skus_total_unique: aggregatedResults.skus_total,
                            work_units_total: aggregatedResults.work_units_total,
                        },
                        current_sku: null,
                        items_processed: aggregatedResults.work_units_processed,
                        items_total: aggregatedResults.work_units_total,
                        last_event_at: completedAt,
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

                if (jobStatus === 'failed' && !isTestJob) {
                    const failedSkus = Array.from(
                        new Set(
                            (allChunksForJob || []).flatMap((chunkRow) =>
                                Array.isArray(chunkRow.skus)
                                    ? chunkRow.skus.filter(
                                          (sku): sku is string =>
                                              typeof sku === 'string' && sku.trim().length > 0
                                      )
                                    : []
                            )
                        )
                    );

                    if (failedSkus.length > 0) {
                        if (officialBrandPhase === 'extraction') {
                            await markOfficialBrandExtractionCandidatesFailed(
                                supabase,
                                jobId,
                                failedSkus,
                                terminalMessage,
                                completedAt,
                            );
                        }

                        const failedStatusUpdate = officialBrandPhase === 'extraction'
                            ? {
                                pipeline_status: 'url_review',
                                updated_at: completedAt,
                            }
                            : {
                                pipeline_status: 'needs_fallback_review',
                                error_message: terminalMessage,
                                scrape_quality: {
                                    result: 'needs_fallback_review',
                                    missingFields: ['scraper_run_failed'],
                                    sourceScores: {} as Record<string, number>,
                                    reason: terminalMessage || 'Scraping job failed',
                                    hasMatchedSku: false,
                                    matchedSourceKeys: [],
                                },
                                updated_at: completedAt,
                            };
                        const failedStatusFrom = officialBrandPhase === 'extraction' ? 'extracting' : 'scraping';

                        const { error: pipelineStatusError } = await supabase
                            .from('products_ingestion')
                            .update(failedStatusUpdate)
                            .in('sku', failedSkus)
                            .eq('pipeline_status', failedStatusFrom);

                        if (pipelineStatusError) {
                            console.error(
                                `[Chunk Callback] Failed to update failed products for job ${jobId}:`,
                                pipelineStatusError
                            );
                        }
                    }
                }

                // Quality-aware routing for completed static jobs:
                // Evaluate each SKU's scrape results and route to scraped/Results or needs_fallback_review.
                // For fallback extraction jobs, keep the legacy stuck-SKU reversion.
                if (!isTestJob && (jobStatus === 'completed' || jobStatus === 'failed')) {
                    const jobSkus = Array.from(
                        new Set(
                            (allChunksForJob || []).flatMap((chunkRow) =>
                                Array.isArray(chunkRow.skus)
                                    ? chunkRow.skus.filter(
                                          (sku): sku is string =>
                                              typeof sku === 'string' && sku.trim().length > 0
                                      )
                                    : []
                            )
                        )
                    );

                    if (jobSkus.length > 0) {
                        if (officialBrandPhase === 'extraction') {
                            // Fallback extraction job — keep legacy stuck-SKU behavior
                            const stuckStatusFrom = 'extracting';
                            const stuckStatusTo = jobStatus === 'completed' ? 'scraped' : 'url_review';
                            const { error: resetStatusError } = await supabase
                                .from('products_ingestion')
                                .update({
                                    pipeline_status: stuckStatusTo,
                                    updated_at: new Date().toISOString(),
                                })
                                .in('sku', jobSkus)
                                .eq('pipeline_status', stuckStatusFrom);

                            if (resetStatusError) {
                                console.error(`[Chunk Callback] Failed to reset stuck extraction SKUs to ${stuckStatusTo}:`, resetStatusError);
                            }
                        } else if (jobStatus === 'completed') {
                            // Standard static job — evaluate quality per-SKU
                            const nowIso = new Date().toISOString();
                            const { data: products } = await supabase
                                .from('products_ingestion')
                                .select('sku, input, sources, pipeline_status')
                                .in('sku', jobSkus);

                            if (products && products.length > 0) {
                                for (const product of products) {
                                    const input = (product.input as Record<string, unknown>) || null;
                                    const sources = (product.sources as Record<string, unknown>) || {};
                                    const currentStatus = product.pipeline_status;

                                    const qualityVerdict = evaluateScrapeQuality(
                                        product.sku,
                                        input,
                                        sources,
                                    );

                                    const targetStatus = qualityVerdict.result === 'pass' ? 'scraped' : 'needs_fallback_review';

                                    await supabase
                                        .from('products_ingestion')
                                        .update({
                                            pipeline_status: targetStatus,
                                            scrape_quality: qualityVerdict as unknown as Record<string, unknown>,
                                            updated_at: nowIso,
                                        })
                                        .eq('sku', product.sku)
                                        .in('pipeline_status', [currentStatus, 'scraping']);

                                    console.log(
                                        `[Chunk Callback] Job ${jobId}: SKU ${product.sku} quality=${qualityVerdict.result} (from ${currentStatus} → ${targetStatus})`
                                    );
                                }
                            }

                            // Revert any SKUs still stuck in 'scraping' (no callback results at all)
                            const { error: resetStuckError } = await supabase
                                .from('products_ingestion')
                                .update({
                                    pipeline_status: 'needs_fallback_review',
                                    scrape_quality: {
                                        result: 'needs_fallback_review',
                                        missingFields: ['any source'],
                                        sourceScores: {},
                                        reason: 'No scraping results received for this SKU',
                                        hasMatchedSku: false,
                                        matchedSourceKeys: [],
                                    },
                                    updated_at: nowIso,
                                })
                                .in('sku', jobSkus)
                                .eq('pipeline_status', 'scraping');

                            if (resetStuckError) {
                                console.error(`[Chunk Callback] Failed to reset stuck scraping SKUs to needs_fallback_review:`, resetStuckError);
                            }
                        } else {
                            // Failed standard job — reset stuck scraping SKUs to needs_fallback_review
                            const nowIso = new Date().toISOString();
                            const { error: resetStuckError } = await supabase
                                .from('products_ingestion')
                                .update({
                                    pipeline_status: 'needs_fallback_review',
                                    error_message: terminalMessage,
                                    scrape_quality: {
                                        result: 'needs_fallback_review',
                                        missingFields: ['any source'],
                                        sourceScores: {},
                                        reason: 'Scraping job failed',
                                        hasMatchedSku: false,
                                        matchedSourceKeys: [],
                                    },
                                    updated_at: nowIso,
                                })
                                .in('sku', jobSkus)
                                .eq('pipeline_status', 'scraping');

                            if (resetStuckError) {
                                console.error(`[Chunk Callback] Failed to reset failed scraping SKUs:`, resetStuckError);
                            }
                        }
                    }
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
