import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { submitProductLineClassificationBatch } from '@/lib/consolidation/batch-service';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * POST /api/admin/grouping/submit
 * Submit products for AI-driven product line classification.
 * Creates a classification batch and returns immediately.
 * Status can be polled from /api/admin/grouping/[batchId].
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
            .select('upc, sources, input')
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

        return NextResponse.json({
            success: true,
            batch_id: result.batch_id,
            provider: result.provider,
            product_count: result.product_count,
            message: `${result.product_count} products queued for product line classification`,
        });
    } catch (error) {
        console.error('[Grouping API] Submit error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to submit classification' },
            { status: 500 }
        );
    }
}
