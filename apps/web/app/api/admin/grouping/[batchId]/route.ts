import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { getBatchStatus, processBatchQueue } from '@/lib/consolidation/batch-service';
import { finalizeClassificationBatch } from '@/lib/consolidation/grouping-service';
import { createAdminClient } from '@/lib/supabase/server';
import type { BatchStatus } from '@/lib/consolidation/types';

/**
 * GET /api/admin/grouping/[batchId]
 * Poll classification batch status and advance the queue.
 *
 * Processes a bounded chunk of pending items, returns aggregate status
 * with per-item statuses. When all items complete, auto-finalizes once
 * (guarded by a finalized_at metadata timestamp to survive reloads).
 *
 * Response shape:
 *   { batch_id, is_complete, is_failed, progress, items: [...], finalize_summary? }
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ batchId: string }> }
) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const { batchId } = await params;

    try {
        // 1. Process a bounded chunk to advance the queue
        const processResult = await processBatchQueue(batchId, { limit: 10 });

        // 2. Fetch current status
        const rawStatus = await getBatchStatus(batchId);

        if ('success' in rawStatus && !rawStatus.success) {
            return NextResponse.json({ error: rawStatus.error }, { status: 404 });
        }

        const status = rawStatus as BatchStatus;

        // 3. Fetch per-item statuses for the UI
        const supabase = await createAdminClient();
        const { data: items } = await supabase
            .from('batch_job_items')
            .select('upc, status, error_message')
            .eq('batch_job_id', batchId)
            .order('created_at');

        const perItemStatuses = (items || []).map((item) => ({
            upc: item.upc,
            status: item.status,
            error_message: item.error_message,
        }));

        // 4. Check if finalization is needed (all items complete, not yet finalized)
        const metadata = (status as any).metadata || {};
        const finalizedAt = metadata.grouping_finalized_at;
        const allDone = status.is_complete || status.is_failed;
        let finalizeSummary = undefined;

        if (allDone && !finalizedAt) {
            // Read brand_id from the batch's own metadata
            const batchBrandId = (metadata as Record<string, unknown>).brand_id as string | null | undefined;
            const brandId = batchBrandId ?? null;

            try {
                const finalizeResult = await finalizeClassificationBatch(batchId, brandId);

                // Mark finalized in metadata (idempotency guard for reloads)
                await supabase
                    .from('batch_jobs')
                    .update({
                        metadata: {
                            ...((status as any).metadata || {}),
                            grouping_finalized_at: new Date().toISOString(),
                            grouping_finalize_summary: finalizeResult,
                        },
                    })
                    .eq('id', batchId);

                finalizeSummary = finalizeResult;
            } catch (finalizeErr) {
                console.error('[Grouping API] Auto-finalize error:', finalizeErr);
            }
        } else if (allDone && finalizedAt) {
            // Already finalized — load the summary from metadata
            finalizeSummary = (metadata as Record<string, unknown>).grouping_finalize_summary;
        }

        return NextResponse.json({
            batch_id: batchId,
            is_complete: status.is_complete,
            is_failed: status.is_failed,
            is_processing: status.is_processing,
            progress_percent: status.progress_percent,
            total_requests: status.total_requests,
            completed_requests: status.completed_requests,
            failed_requests: status.failed_requests,
            items: perItemStatuses,
            finalized: !!finalizedAt || allDone,
            finalize_summary: finalizeSummary,
        });
    } catch (error) {
        console.error('[Grouping API] Batch status error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to get batch status' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/admin/grouping/[batchId]
 * Finalize a completed classification batch.
 * Runs fuzzy dedup, upserts product_lines, updates products_ingestion metadata,
 * and sets pipeline_status to 'grouping'.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ batchId: string }> }
) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const { batchId } = await params;

    try {
        const body = await request.json().catch(() => ({}));
        const brandId: string | null = body.brand_id ?? null;

        const result = await finalizeClassificationBatch(batchId, brandId);

        return NextResponse.json(result);
    } catch (error) {
        console.error('[Grouping API] Finalize error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to finalize classification' },
            { status: 500 }
        );
    }
}
