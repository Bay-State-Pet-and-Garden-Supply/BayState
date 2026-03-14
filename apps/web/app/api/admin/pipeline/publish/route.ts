import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

/**
 * Publish a product from the ingestion pipeline to the storefront products table.
 * 
 * This is a secondary publishing option that copies finalized products to the
 * storefront catalog.
 * 
 * Body: { sku: string }
 * 
 * Returns:
 * - 200: Success with message
 * - 400: Invalid request (missing sku)
 * - 401: Unauthorized
 * - 404: Product not found in ingestion table
 * - 409: Product not in valid status for publishing
 * - 500: Server error
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const supabase = await createClient();

    try {
        const body = await request.json();
        const { sku } = body;

        if (!sku || typeof sku !== 'string') {
            return NextResponse.json(
                { error: 'Missing or invalid sku' },
                { status: 400 }
            );
        }

        // Fetch the product from ingestion table
        const { data: ingestionProduct, error: fetchError } = await supabase
            .from('products_ingestion')
            .select('sku, input, consolidated, pipeline_status')
            .eq('sku', sku)
            .single();

        if (fetchError || !ingestionProduct) {
            return NextResponse.json(
                { error: 'Product not found in pipeline' },
                { status: 404 }
            );
        }

        const publishableStatuses = new Set(['finalized', 'approved']);
        if (!publishableStatuses.has(ingestionProduct.pipeline_status)) {
            return NextResponse.json(
                { error: `Product must be in 'finalized' status to publish. Current status: ${ingestionProduct.pipeline_status}` },
                { status: 409 }
            );
        }

        // Get consolidated data
        const consolidated = ingestionProduct.consolidated || {};
        const input = ingestionProduct.input || {};

        // Extract the data to publish
        const name = consolidated.name || input.name || '';
        if (!name) {
            return NextResponse.json(
                { error: 'Product has no name to publish' },
                { status: 400 }
            );
        }

        // Generate slug from name
        const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') +
            '-' +
            sku.toLowerCase().replace(/[^a-z0-9]/g, '');

        // Prepare images array
        let images: string[] = [];
        if (consolidated.images && Array.isArray(consolidated.images)) {
            images = consolidated.images.filter((img: unknown): img is string => typeof img === 'string' && img.trim() !== '');
        } else if (consolidated.selected_images && Array.isArray(consolidated.selected_images)) {
            // Also check selected_images
            images = consolidated.selected_images
                .map((img: { url?: string }) => img.url)
                .filter((url: unknown): url is string => typeof url === 'string' && url.trim() !== '');
        }

        // Prepare product data for products table
        const productData = {
            name,
            slug,
            description: consolidated.description || '',
            price: consolidated.price ?? input.price ?? 0,
            brand_id: consolidated.brand_id || null,
            stock_status: consolidated.stock_status || 'in_stock',
            images: images.length > 0 ? images : [],
            is_featured: consolidated.is_featured || false,
            is_special_order: false,
            weight: null,
            search_keywords: null,
            category_id: null,
            compare_at_price: null,
            cost_price: null,
            quantity: 0,
            low_stock_threshold: 5,
            is_taxable: true,
            tax_code: null,
            barcode: null,
            meta_title: null,
            meta_description: null,
            dimensions: null,
            origin_country: null,
            vendor: null,
            published_at: new Date().toISOString(),
            avg_rating: null,
            review_count: 0,
        };

        // Check if product already exists in products table
        const { data: existingProduct } = await supabase
            .from('products')
            .select('id')
            .eq('slug', slug)
            .single();

        let result;

        if (existingProduct) {
            // Update existing product
            const { error: updateError } = await supabase
                .from('products')
                .update(productData)
                .eq('id', existingProduct.id);

            if (updateError) {
                console.error('Error updating product:', updateError);
                return NextResponse.json(
                    { error: 'Failed to update product in storefront' },
                    { status: 500 }
                );
            }

            result = { action: 'updated', productId: existingProduct.id };
        } else {
            // Insert new product
            const { data: insertedProduct, error: insertError } = await supabase
                .from('products')
                .insert(productData)
                .select('id')
                .single();

            if (insertError) {
                console.error('Error inserting product:', insertError);
                return NextResponse.json(
                    { error: 'Failed to create product in storefront' },
                    { status: 500 }
                );
            }

            result = { action: 'created', productId: insertedProduct?.id };
        }

        // Note: We don't update the pipeline status to 'published' as per task requirements
        // The task specifically says "Do NOT change status to 'published'"

        return NextResponse.json({
            success: true,
            ...result,
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
