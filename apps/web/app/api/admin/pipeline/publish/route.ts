import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { publishToStorefront } from '@/lib/pipeline/publish';

/**
 * Publish a product from the ingestion pipeline to the storefront products table.
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json();
        const { sku } = body;

        if (!sku || typeof sku !== 'string') {
            return NextResponse.json(
                { error: 'Missing or invalid sku' },
                { status: 400 }
            );
        }

        const result = await publishToStorefront(sku);

        if (!result.success) {
            return NextResponse.json(
                { error: result.error },
                { status: result.error?.includes('not found') ? 404 : 400 }
            );
        }

        return NextResponse.json({
            success: true,
            action: result.action,
            productId: result.productId,
            message: `Product ${result.action === 'created' ? 'created' : 'updated'} in storefront`,
        });
    } catch (err) {
        console.error('Error in publish endpoint:', err);
        return NextResponse.json(
            { error: 'Invalid request body' },
            { status: 400 }
        );
    }
}

/**
 * Check if a product exists in the storefront (GET endpoint helper)
 */
export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const sku = searchParams.get('sku');

    if (!sku) {
        return NextResponse.json(
            { error: 'Missing sku parameter' },
            { status: 400 }
        );
    }

    const supabase = await createClient();

    // Check in ingestion table
    const { data: ingestionProduct } = await supabase
        .from('products_ingestion')
        .select('sku, pipeline_status, consolidated, input')
        .eq('sku', sku)
        .single();

    if (!ingestionProduct) {
        return NextResponse.json(
            { error: 'Product not found in pipeline' },
            { status: 404 }
        );
    }

    // Check in products table by trying to match SKU pattern in slug
    // Generate possible slugs to check
    const consolidated = ingestionProduct.consolidated || {};
    const input = ingestionProduct.input || {};
    const name = consolidated.name || input.name || '';
    const baseSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
        '-' +
        sku.toLowerCase().replace(/[^a-z0-9]/g, '');

    const { data: existingProduct } = await supabase
        .from('products')
        .select('id, name, slug, published_at')
        .eq('slug', baseSlug)
        .single();

    return NextResponse.json({
        sku,
        pipelineStatus: ingestionProduct.pipeline_status,
        inStorefront: !!existingProduct,
        storefrontProductId: existingProduct?.id || null,
    });
}
