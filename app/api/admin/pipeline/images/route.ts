import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const supabase = await createClient();

    const { data, error } = await supabase
        .from('products_ingestion')
        .select('sku, image_candidates, consolidated')
        .not('image_candidates', 'is', null)
        .neq('image_candidates', '[]')
        .eq('pipeline_status', 'scraped');

    if (error) {
        console.error('Error fetching products needing image selection:', error);
        return NextResponse.json(
            { error: 'Failed to fetch products' },
            { status: 500 }
        );
    }

    const productsNeedingImages = (data || []).filter((product) => {
        const consolidated = product.consolidated && typeof product.consolidated === 'object'
            ? (product.consolidated as Record<string, unknown>)
            : {};
        const consolidatedImages = Array.isArray(consolidated.images)
            ? consolidated.images
            : [];
        return consolidatedImages.length === 0;
    });

    return NextResponse.json({ products: productsNeedingImages });
}

export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json();
        const { sku, selectedImages } = body as { sku: string; selectedImages: string[] };

        if (!sku || typeof sku !== 'string') {
            return NextResponse.json(
                { error: 'SKU is required' },
                { status: 400 }
            );
        }

        if (!selectedImages || !Array.isArray(selectedImages) || selectedImages.length === 0) {
            return NextResponse.json(
                { error: 'selectedImages array is required and must not be empty' },
                { status: 400 }
            );
        }

        const supabase = await createClient();

        const { data: product, error: fetchError } = await supabase
            .from('products_ingestion')
            .select('image_candidates, consolidated')
            .eq('sku', sku)
            .single();

        if (fetchError || !product) {
            return NextResponse.json(
                { error: 'Product not found' },
                { status: 400 }
            );
        }

        const imageCandidates = Array.isArray(product.image_candidates)
            ? product.image_candidates
            : [];

        const invalidImages = selectedImages.filter(img => !imageCandidates.includes(img));
        if (invalidImages.length > 0) {
            return NextResponse.json(
                { error: `Selected images not in image candidates: ${invalidImages.join(', ')}` },
                { status: 400 }
            );
        }

        const existingConsolidated = product.consolidated && typeof product.consolidated === 'object'
            ? (product.consolidated as Record<string, unknown>)
            : {};

        const updatedConsolidated = {
            ...existingConsolidated,
            images: selectedImages,
        };

        const { error: updateError } = await supabase
            .from('products_ingestion')
            .update({
                consolidated: updatedConsolidated,
                updated_at: new Date().toISOString(),
            })
            .eq('sku', sku);

        if (updateError) {
            console.error('Error updating product images:', updateError);
            return NextResponse.json(
                { error: 'Failed to save selected images' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, sku, selectedImages });
    } catch {
        return NextResponse.json(
            { error: 'Invalid request body' },
            { status: 400 }
        );
    }
}
