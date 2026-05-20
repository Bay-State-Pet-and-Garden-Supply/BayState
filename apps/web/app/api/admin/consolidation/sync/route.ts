import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { processAllQueues } from '@/lib/consolidation';

function clampLimit(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return 5;
    return Math.min(25, Math.max(1, Math.trunc(parsed)));
}

/**
 * POST /api/admin/consolidation/sync
 * Processes local DeepSeek queue jobs and Gemini batch prep/poll steps.
 * This is not a remote provider status sync for OpenAI — it's the local queue processor.
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    // Note: Do NOT gate on getConsolidationConfig() here.
    // processAllQueues() resolves provider credentials internally
    // (Gemini via getAIScrapingProviderSecret, DeepSeek/OpenAI via
    // getConsolidationConfig), so existing Gemini jobs continue
    // syncing even if admin changes the consolidation defaults.

    let body: { limit?: unknown } = {};
    try {
        body = await request.json();
    } catch {
        body = {};
    }

    try {
        const result = await processAllQueues({ limit: clampLimit(body.limit) });

        const messageParts: string[] = [];
        if (result.processed_job_count > 0 || result.processed_item_count > 0) {
            messageParts.push(`Processed ${result.processed_item_count} direct-chat item${result.processed_item_count === 1 ? '' : 's'}`);
        }
        if (result.completed_item_count > 0) {
            messageParts.push(`${result.completed_item_count} Gemini batch result${result.completed_item_count === 1 ? '' : 's'} synced`);
        }
        if (result.errors.length > 0) {
            messageParts.push(`${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`);
        }

        return NextResponse.json({
            ...result,
            synced_count: result.processed_job_count,
            message: messageParts.length > 0
                ? messageParts.join('; ')
                : 'No active queue jobs or Gemini batches to process',
        });
    } catch (error) {
        console.error('[Consolidation Queue API] Process queue error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to process queue' },
            { status: 500 }
        );
    }
}
