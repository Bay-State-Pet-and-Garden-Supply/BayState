import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createClient } from '@/lib/supabase/server';
import { submitBatch, isOpenAIConfigured } from '@/lib/consolidation';
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
        const { skus, description, auto_apply } = body;

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
            description: description || `Consolidation batch for ${productsWithSources.length} products`,
            auto_apply: auto_apply || false,
        });

        if ('success' in result && !result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            batch_id: result.batch_id,
            provider: result.provider,
            provider_batch_id: result.provider_batch_id,
            product_count: result.product_count,
            skipped_count: skus.length - productsWithSources.length,
        });
    } catch (error) {
        console.error('[Consolidation API] Submit error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to submit batch' },
            { status: 500 }
        );
    }
}
