import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { publishToStorefront } from '@/lib/pipeline/publish';

/**
 * Publish a product from the ingestion pipeline to the storefront products table.
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json();
        const { upc } = body;

        if (!upc || typeof upc !== 'string') {
            return NextResponse.json(
                { error: 'Missing or invalid upc' },
                { status: 400 }
            );
        }

        const result = await publishToStorefront(upc);

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
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const upc = searchParams.get('upc');

    if (!upc) {
        return NextResponse.json(
            { error: 'Missing upc parameter' },
            { status: 400 }
        );
    }

    const supabase = await createAdminClient();

    // Check in ingestion table
    const { data: ingestionProduct } = await supabase
        .from('products_ingestion')
        .select('upc, pipeline_status, consolidated, input')
        .eq('upc', upc)
        .single();

    if (!ingestionProduct) {
        return NextResponse.json(
            { error: 'Product not found in pipeline' },
            { status: 404 }
        );
    }

    const { data: existingProduct } = await supabase
        .from('products')
        .select('id, upc, name, slug, published_at')
        .eq('upc', upc)
        .maybeSingle();

    return NextResponse.json({
        upc,
        pipelineStatus: ingestionProduct.pipeline_status,
        inStorefront: !!existingProduct,
        storefrontProductId: existingProduct?.id || null,
    });
}
