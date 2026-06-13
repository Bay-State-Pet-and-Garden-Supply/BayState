import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { getBatchStatus, processBatchQueue } from '@/lib/consolidation/batch-service';
import { finalizeClassificationBatch } from '@/lib/consolidation/grouping-service';

/**
 * GET /api/admin/grouping/[batchId]
 * Poll classification batch status and advance the queue.
 *
 * POST /api/admin/grouping/[batchId]
 * Finalize a completed classification batch: run dedup, persist product_lines,
 * update products_ingestion metadata, and move products to grouping stage.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ batchId: string }> }
) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const { batchId } = await params;

    try {
        // Process pending items to advance the queue
        await processBatchQueue(batchId, { limit: 10 }).catch(() => {
            // Swallow processing errors — next iteration will surface failures
        });

        const status = await getBatchStatus(batchId);

        if ('success' in status && !status.success) {
            return NextResponse.json({ error: status.error }, { status: 404 });
        }

        return NextResponse.json(status);
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
