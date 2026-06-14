import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { applyResults, isOpenAIConfigured } from '@/lib/consolidation';
import { finalizeClassificationBatch } from '@/lib/consolidation/grouping-service';
import { findBatchJobRow } from '@/lib/consolidation/batch-service';

interface RouteContext {
    params: Promise<{ batchId: string }>;
}

/**
 * POST /api/admin/consolidation/[batchId]/apply
 * Apply the results of a completed provider batch job to products.
 * For classification batches, finalize (run dedup, create product lines, move to grouping).
 */
export async function POST(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const { batchId } = await context.params;

    if (!(await isOpenAIConfigured())) {
        return NextResponse.json({ error: 'No configured LLM batch provider is available' }, { status: 503 });
    }

    try {
        // Check if this is a classification batch — finalize instead of apply
        const { row } = await findBatchJobRow(batchId);
        if (row?.execution_mode === 'product_line_classification') {
            const result = await finalizeClassificationBatch(batchId);
            return NextResponse.json(result);
        }

        const result = await applyResults(batchId);

        if ('success' in result && !result.success) {
            console.error('[Consolidation API] Apply failed:', result.error);
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('[Consolidation API] Apply error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to apply results' },
            { status: 500 }
        );
    }
}
