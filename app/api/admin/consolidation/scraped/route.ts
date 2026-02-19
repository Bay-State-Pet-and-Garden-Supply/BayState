import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createClient } from '@/lib/supabase/server';
import { submitBatch } from '@/lib/consolidation/batch-service';

/**
 * POST /api/admin/consolidation/scraped
 * Trigger consolidation for products that have been scraped (pipeline_status = 'scraped')
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
            .select('sku, sources')
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

        // Transform to ProductSource format
        const productSources = products.map((p) => ({
            sku: p.sku,
            sources: (p.sources as Record<string, unknown>) || {},
        }));

        // Submit for consolidation
        const result = await submitBatch(productSources, {
            description: `Manual consolidation for ${productSources.length} scraped products`,
            auto_apply: false, // Manual review required
        });

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || 'Consolidation failed' },
                { status: 500 }
            );
        }

        // Update pipeline status to indicate consolidation is pending
        const { error: updateError } = await supabase
            .from('products_ingestion')
            .update({ pipeline_status: 'consolidating' })
            .in(
                'sku',
                products.map((p) => p.sku)
            );

        if (updateError) {
            console.error('[Consolidation Scraped API] Failed to update status:', updateError);
        }

        return NextResponse.json({
            success: true,
            batch_id: result.batch_id,
            product_count: result.product_count,
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
