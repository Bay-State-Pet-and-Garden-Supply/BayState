import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { submitProductLineClassificationBatch, getBatchStatus, processBatchQueue } from '@/lib/consolidation/batch-service';
import { finalizeClassificationBatch } from '@/lib/consolidation/grouping-service';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * POST /api/admin/grouping/submit
 * Submit products for AI-driven product line classification.
 * Creates a classification batch, processes items immediately, and auto-finalizes
 * (run dedup, upsert product_lines, move products to grouping stage).
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json();
        const { upcs } = body;

        if (!upcs || !Array.isArray(upcs) || upcs.length === 0) {
            return NextResponse.json({ error: 'upcs array is required' }, { status: 400 });
        }

        const supabase = await createAdminClient();
        const { data: products, error: fetchError } = await supabase
            .from('products_ingestion')
            .select('upc, sources, input, brand_id')
            .in('upc', upcs);

        if (fetchError) {
            console.error('[Grouping API] Failed to fetch products:', fetchError);
            return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
        }

        if (!products || products.length === 0) {
            return NextResponse.json({ error: 'No products found for provided UPCs' }, { status: 404 });
        }

        const productsWithSources = products.map(p => ({
            upc: p.upc,
            sources: (p.sources || {}) as Record<string, unknown>,
            input: (p.input || {}) as Record<string, unknown> | null,
        }));

        const result = await submitProductLineClassificationBatch(productsWithSources, {
            description: `Product line classification for ${productsWithSources.length} products`,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        // Process classification items immediately (like consolidation does)
        let processedItemCount = 0;
        let completedItemCount = 0;
        let failedItemCount = 0;
        const chunkSize = 10;
        const maxIterations = Math.ceil(productsWithSources.length / chunkSize) + 3;

        for (let iteration = 0; iteration < maxIterations; iteration += 1) {
            const processResult = await processBatchQueue(result.batch_id, { limit: chunkSize });
            if ('success' in processResult && !processResult.success) {
                console.warn('[Grouping API] Processing error:', processResult.error);
                break;
            }

            if ('processed' in processResult) {
                processedItemCount += processResult.processed;
                completedItemCount += processResult.completed;
                failedItemCount += processResult.failed;

                if (processResult.processed === 0 || processResult.status.is_complete || processResult.status.is_failed) {
                    break;
                }
            }
        }

        // Auto-finalize: run dedup, persist product lines, move products to grouping
        let finalizeResult;
        try {
            // Determine brand_id from the first product (all should share the same brand)
            const brandId = products[0]?.brand_id || null;
            finalizeResult = await finalizeClassificationBatch(result.batch_id, brandId);
        } catch (finalizeErr) {
            console.error('[Grouping API] Finalization error:', finalizeErr);
        }

        return NextResponse.json({
            success: true,
            batch_id: result.batch_id,
            product_count: result.product_count,
            processed_count: processedItemCount,
            completed_count: completedItemCount,
            failed_count: failedItemCount,
            assigned_count: finalizeResult?.assignedCount ?? completedItemCount,
            ungrouped_count: finalizeResult?.ungroupedCount ?? 0,
            product_lines_count: finalizeResult?.productLinesCount ?? 0,
            message: `${finalizeResult?.assignedCount ?? completedItemCount} products classified into ${finalizeResult?.productLinesCount ?? 0} product lines`,
        });
    } catch (error) {
        console.error('[Grouping API] Submit error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to submit classification' },
            { status: 500 }
        );
    }
}
