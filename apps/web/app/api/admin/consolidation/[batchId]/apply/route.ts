import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { applyResults, isOpenAIConfigured } from '@/lib/consolidation';

interface RouteContext {
    params: Promise<{ batchId: string }>;
}

/**
 * POST /api/admin/consolidation/[batchId]/apply
 * Apply the results of a completed batch job to products.
 */
export async function POST(request: NextRequest, context: RouteContext) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const { batchId } = await context.params;

    if (!isOpenAIConfigured()) {
        return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 503 });
    }

    try {
        const result = await applyResults(batchId);

        if ('success' in result && !result.success) {
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
