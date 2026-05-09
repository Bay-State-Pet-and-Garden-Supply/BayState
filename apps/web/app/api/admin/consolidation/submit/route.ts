import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createClient } from '@/lib/supabase/server';
import { getBatchStatus, isOpenAIConfigured, processBatchQueue, submitBatch } from '@/lib/consolidation';
import type { ProductSource } from '@/lib/consolidation';
import { buildConsolidationSourcesPayload } from '@/lib/product-sources';

/**
 * POST /api/admin/consolidation/submit
 * Submit a provider-neutral batch of products for LLM consolidation.
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    if (!(await isOpenAIConfigured())) {
        return NextResponse.json(
            { error: 'No configured LLM batch provider is available for consolidation.' },
            { status: 503 }
        );
    }

    try {
        const body = await request.json();
        const { skus, description, auto_apply, productLineContext } = body;

        if (!skus || !Array.isArray(skus) || skus.length === 0) {
            return NextResponse.json({ error: 'skus array is required' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: products, error: fetchError } = await supabase
            .from('products_ingestion')
            .select('sku, input, sources')
            .in('sku', skus);

        if (fetchError) {
            console.error('[Consolidation API] Failed to fetch products:', fetchError);
            return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
        }

        if (!products || products.length === 0) {
            return NextResponse.json({ error: 'No products found for provided SKUs' }, { status: 404 });
        }

        const productsWithSources: ProductSource[] = products
            .filter((p) => p.sources && Object.keys(p.sources).length > 0)
            .map((p) => ({
                sku: p.sku,
                sources: buildConsolidationSourcesPayload(p.sources, p.input),
                productLineContext: productLineContext?.[p.sku] ?? undefined,
            }));

        if (productsWithSources.length === 0) {
            return NextResponse.json(
                {
                    error: 'None of the selected products have source data from scrapers. Run scraping first.',
                },
                { status: 400 }
            );
        }

        const result = await submitBatch(productsWithSources, {
            description: description || `Consolidation job for ${productsWithSources.length} products`,
            auto_apply: auto_apply || false,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        let processedItemCount = 0;
        let completedItemCount = 0;
        let failedItemCount = 0;
        const chunkSize = 5;
        const maxIterations = Math.ceil(productsWithSources.length / chunkSize) + 2;

        for (let iteration = 0; iteration < maxIterations; iteration += 1) {
            const processResult = await processBatchQueue(result.batch_id, { limit: chunkSize });
            if ('success' in processResult && !processResult.success) {
                return NextResponse.json({ error: processResult.error }, { status: 500 });
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

        const status = await getBatchStatus(result.batch_id);

        return NextResponse.json({
            success: true,
            batch_id: result.batch_id,
            provider: result.provider,
            provider_batch_id: result.provider_batch_id,
            product_count: result.product_count,
            skipped_count: skus.length - productsWithSources.length,
            processed_item_count: processedItemCount,
            completed_item_count: completedItemCount,
            failed_item_count: failedItemCount,
            status: 'success' in status ? null : status,
        });
    } catch (error) {
        console.error('[Consolidation API] Submit error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to submit batch' },
            { status: 500 }
        );
    }
}
