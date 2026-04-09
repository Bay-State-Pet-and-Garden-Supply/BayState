import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createClient } from '@/lib/supabase/server';
import { isOpenAIConfigured, TwoPhaseConsolidationService, buildDefaultConsistencyRules } from '@/lib/consolidation';
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

        const twoPhaseService = new TwoPhaseConsolidationService();

        const result = await twoPhaseService.consolidate(productsWithSources, {
            batchMetadata: {
                description: description || `Consolidation batch for ${productsWithSources.length} products`,
                auto_apply: auto_apply || false,
            },
            enablePhase2: true,
            phaseSelection: 'both',
            consistencyRules: buildDefaultConsistencyRules(),
        });

        // Generate a batch ID from the first product result or use timestamp
        const batchId = result.products[0]?.sku ? `consolidation-${Date.now()}` : `consolidation-${Date.now()}`;

        if (result.phase === 'phase2' && result.consistencyReport) {
            return NextResponse.json({
                success: true,
                batch_id: batchId,
                provider: 'openai',
                provider_batch_id: batchId,
                product_count: result.products.length,
                skipped_count: skus.length - productsWithSources.length,
                phase: result.phase,
                consistency_report: {
                    enabled: result.consistencyReport.enabled,
                    total_products: result.consistencyReport.totalProducts,
                    flagged_products: result.consistencyReport.flaggedProducts,
                    total_issues: result.consistencyReport.totalIssues,
                },
            });
        }

        return NextResponse.json({
            success: true,
            batch_id: batchId,
            provider: 'openai',
            provider_batch_id: batchId,
            product_count: result.products.length,
            skipped_count: skus.length - productsWithSources.length,
            phase: result.phase,
        });
    } catch (error) {
        console.error('[Consolidation API] Submit error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to submit batch' },
            { status: 500 }
        );
    }
}
