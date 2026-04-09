import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createClient } from '@/lib/supabase/server';
import { TwoPhaseConsolidationService, buildDefaultConsistencyRules } from '@/lib/consolidation';
import { buildConsolidationSourcesPayload } from '@/lib/product-sources';

/**
 * POST /api/admin/consolidation/scraped
 * Trigger consolidation for products that are scraped and ready for consolidation.
 * Backward-compatible with legacy records that only have pipeline_status = 'scraped'.
 * Body: { skus?: string[] } - if no SKUs provided, consolidates all scraped products
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json();
        const { skus } = body;

        const supabase = await createClient();

        // Build query - either specific SKUs or all scraped products
        let query = supabase
            .from('products_ingestion')
            .select('sku, sources, input')
            .eq('pipeline_status', 'scraped');

        if (skus && Array.isArray(skus) && skus.length > 0) {
            query = query.in('sku', skus);
        }

        const { data: products, error: fetchError } = await query;

        if (fetchError) {
            console.error('[Consolidation Scraped API] Failed to fetch products:', fetchError);
            return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
        }

        if (!products || products.length === 0) {
            return NextResponse.json(
                { error: 'No scraped products found. Run scraping first.' },
                { status: 404 }
            );
        }

        // Transform to ProductSource format with sibling context from database
        const productSources = products.map((p) => ({
            sku: p.sku,
            sources: buildConsolidationSourcesPayload(p.sources, p.input),
            productLineContext: p.input?.productLineContext ?? undefined,
        }));

        // Submit for two-phase consolidation
        const twoPhaseService = new TwoPhaseConsolidationService();
        const result = await twoPhaseService.consolidate(productSources, {
            batchMetadata: {
                description: `Manual consolidation for ${productSources.length} scraped products`,
                auto_apply: false,
            },
            enablePhase2: true,
            phaseSelection: 'both',
            consistencyRules: buildDefaultConsistencyRules(),
        });

        // Generate batch ID
        const batchId = `consolidation-${Date.now()}`;

        if (result.phase === 'phase2' && result.consistencyReport) {
            return NextResponse.json({
                success: true,
                batch_id: batchId,
                product_count: result.products.length,
                phase: result.phase,
                consistency_report: {
                    enabled: result.consistencyReport.enabled,
                    total_products: result.consistencyReport.totalProducts,
                    flagged_products: result.consistencyReport.flaggedProducts,
                    total_issues: result.consistencyReport.totalIssues,
                },
                message: `${productSources.length} products queued for consolidation with Phase 2 consistency checking`,
            });
        }

        return NextResponse.json({
            success: true,
            batch_id: batchId,
            product_count: result.products.length,
            phase: result.phase,
            message: `${productSources.length} products queued for consolidation`,
        });
    } catch (error) {
        console.error('[Consolidation Scraped API] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to submit consolidation' },
            { status: 500 }
        );
    }
}
