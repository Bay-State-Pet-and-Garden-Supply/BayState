import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';
import { getBatchStatus, cancelBatch, retrieveResults, isOpenAIConfigured } from '@/lib/consolidation';

interface RouteContext {
    params: Promise<{ batchId: string }>;
}

/**
 * GET /api/admin/consolidation/[batchId]
 * Read local consolidation queue job status. This endpoint does not process items.
 */
export async function GET(_request: Request, context: RouteContext) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const { batchId } = await context.params;

    if (!(await isOpenAIConfigured())) {
        return NextResponse.json({ error: 'No configured LLM provider is available' }, { status: 503 });
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
 * Cancel a local consolidation queue job.
 */
export async function DELETE(request: Request, context: RouteContext) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const { batchId } = await context.params;
    const url = new URL(request.url);
    const shouldDelete = url.searchParams.get('delete') === 'true';

    if (!(await isOpenAIConfigured())) {
        return NextResponse.json({ error: 'No configured LLM provider is available' }, { status: 503 });
    }

    try {
        if (shouldDelete) {
            const supabase = await createAdminClient();
            const { data: items } = await supabase
                .from('batch_job_items')
                .select('sku')
                .eq('batch_job_id', batchId);

            const skus = Array.from(new Set((items || []).map((item) => item.sku).filter(Boolean)));
            if (skus.length > 0) {
                await supabase
                    .from('products_ingestion')
                    .update({
                        pipeline_status: 'scraped',
                        error_message: null,
                        updated_at: new Date().toISOString(),
                    })
                    .in('sku', skus)
                    .eq('pipeline_status', 'consolidating');
            }

            const { error: deleteError } = await supabase
                .from('batch_jobs')
                .delete()
                .eq('id', batchId);

            if (deleteError) {
                return NextResponse.json({ error: deleteError.message }, { status: 500 });
            }

            return NextResponse.json({ status: 'deleted', reset_count: skus.length });
        }

        const result = await cancelBatch(batchId);

        if ('success' in result && !result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({ status: 'cancelled' });
    } catch (error) {
        console.error('[Consolidation API] Delete/cancel error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to update queue job' },
            { status: 500 }
        );
    }
}
