import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');

    if (status !== 'needs-images') {
        return NextResponse.json(
            { error: 'Invalid status parameter. Use status=needs-images' },
            { status: 400 }
        );
    }

    const supabase = await createClient();

    const { data, error } = await supabase
        .from('products_ingestion')
        .select('sku, image_candidates, consolidated, pipeline_status')
        .neq('image_candidates', '{}')
        .neq('image_candidates', '[]')
        .or('consolidated.images.is.null,consolidated.images.eq.{}')
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('Error fetching products needing images:', error);
        return NextResponse.json(
            { error: 'Failed to fetch products' },
            { status: 500 }
        );
    }

    const products = (data || []).map((row: any) => ({
        sku: row.sku,
        image_candidates: row.image_candidates,
        consolidated: row.consolidated,
        pipeline_status: row.pipeline_status,
    }));

    return NextResponse.json({ products });
}

export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const supabase = await createClient();

    try {
        const body = await request.json();
        const { sku, selectedImages } = body;

        if (!sku || typeof sku !== 'string') {
            return NextResponse.json(
                { error: 'Missing or invalid sku' },
                { status: 400 }
            );
        }

        if (!selectedImages || !Array.isArray(selectedImages)) {
            return NextResponse.json(
                { error: 'Missing or invalid selectedImages' },
                { status: 400 }
            );
        }

        if (selectedImages.length === 0) {
            return NextResponse.json(
                { error: 'selectedImages cannot be empty' },
                { status: 400 }
            );
        }

        const { data: products, error: fetchError } = await supabase
            .from('products_ingestion')
            .select('sku, image_candidates, consolidated')
            .eq('sku', sku)
            .single();

        if (fetchError || !products) {
            return NextResponse.json(
                { error: 'Product not found' },
                { status: 404 }
            );
        }

        const imageCandidates = Array.isArray(products.image_candidates)
            ? products.image_candidates
            : [];

        for (const img of selectedImages) {
            if (!imageCandidates.includes(img)) {
                return NextResponse.json(
                    { error: `Invalid image: ${img} is not in image_candidates` },
                    { status: 400 }
                );
            }
        }

        const currentConsolidated = (products.consolidated && typeof products.consolidated === 'object')
            ? (products.consolidated as Record<string, unknown>)
            : {};

        const updatedConsolidated = {
            ...currentConsolidated,
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

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Error parsing request:', err);
        return NextResponse.json(
            { error: 'Invalid request body' },
            { status: 400 }
        );
    }
}
