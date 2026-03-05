import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { getBatchStatus, cancelBatch, retrieveResults, isOpenAIConfigured } from '@/lib/consolidation';

interface RouteContext {
    params: Promise<{ batchId: string }>;
}

/**
 * GET /api/admin/consolidation/[batchId]
 * Get the status of a batch job.
 */
export async function GET(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const { batchId } = await context.params;

    if (!isOpenAIConfigured()) {
        return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 503 });
    }

    try {
        const status = await getBatchStatus(batchId);

        if ('success' in status && !status.success) {
            return NextResponse.json({ error: status.error }, { status: 500 });
        }

        // If complete, also fetch results preview
        let resultsPreview;
        if ('is_complete' in status && status.is_complete) {
            const results = await retrieveResults(batchId);
            if (Array.isArray(results)) {
                resultsPreview = {
                    total: results.length,
                    successful: results.filter((r) => !r.error).length,
                    failed: results.filter((r) => r.error).length,
                };
            }
        }

        return NextResponse.json({ status, resultsPreview });
    } catch (error) {
        console.error('[Consolidation API] Get status error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to get status' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/admin/consolidation/[batchId]
 * Cancel a batch job.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const { batchId } = await context.params;

    if (!isOpenAIConfigured()) {
        return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 503 });
    }

    try {
        const result = await cancelBatch(batchId);

        if ('success' in result && !result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({ status: 'cancelled' });
    } catch (error) {
        console.error('[Consolidation API] Cancel error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to cancel batch' },
            { status: 500 }
        );
    }
}
