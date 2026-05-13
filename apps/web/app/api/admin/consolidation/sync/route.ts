import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { getConsolidationConfig } from '@/lib/consolidation/openai-client';
import { processAllQueues } from '@/lib/consolidation';

function clampLimit(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return 5;
    return Math.min(25, Math.max(1, Math.trunc(parsed)));
}

/**
 * POST /api/admin/consolidation/sync
 * Compatibility route name: explicitly processes local DeepSeek queue jobs.
 * This is not a remote provider status sync.
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const runtimeConfig = await getConsolidationConfig();
    if (!runtimeConfig.llm_api_key) {
        return NextResponse.json(
            { error: 'No configured LLM provider is available' },
            { status: 503 }
        );
    }

    let body: { limit?: unknown } = {};
    try {
        body = await request.json();
    } catch {
        body = {};
    }

    try {
        const result = await processAllQueues({ limit: clampLimit(body.limit) });

        return NextResponse.json({
            ...result,
            // Deprecated alias retained for existing callers during UI/API migration.
            synced_count: result.processed_job_count,
            message: result.processed_job_count === 0
                ? 'No active queue jobs to process'
                : `Processed ${result.processed_item_count} queue item${result.processed_item_count === 1 ? '' : 's'}`,
        });
    } catch (error) {
        console.error('[Consolidation Queue API] Process queue error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to process queue' },
            { status: 500 }
        );
    }
}
