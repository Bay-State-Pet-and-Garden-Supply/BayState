import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { isOpenAIConfigured, processBatchQueue } from '@/lib/consolidation';

interface RouteContext {
    params: Promise<{ batchId: string }>;
}

function clampLimit(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return 5;
    return Math.min(25, Math.max(1, Math.trunc(parsed)));
}

/**
 * POST /api/admin/consolidation/[batchId]/process
 * Explicitly process a chunk of pending items for a local DeepSeek queue job.
 */
export async function POST(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const { batchId } = await context.params;

    if (!(await isOpenAIConfigured())) {
        return NextResponse.json({ error: 'No configured LLM provider is available' }, { status: 503 });
    }

    let body: { limit?: unknown } = {};
    try {
        body = await request.json();
    } catch {
        body = {};
    }

    try {
        const result = await processBatchQueue(batchId, { limit: clampLimit(body.limit) });

        if ('success' in result && !result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('[Consolidation Queue API] Process job error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to process queue job' },
            { status: 500 }
        );
    }
}
