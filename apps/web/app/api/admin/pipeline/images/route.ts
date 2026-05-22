import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { extractImageCandidatesFromSources } from '@/lib/product-sources';
import {
    buildProductImageStorageFolder,
    replaceInlineImageDataUrls,
} from '@/lib/product-image-storage';

interface ProductImageRow {
    upc: string;
    image_candidates: string[] | null;
    consolidated: Record<string, unknown> | null;
    pipeline_status: string | null;
}

interface ProductImageValidationRow {
    upc: string;
    image_candidates: unknown;
    selected_images: unknown;
    sources: unknown;
    consolidated: unknown;
}

function toImageUrlArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    return value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

function extractSelectedImageUrls(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    return value
        .map((entry) => {
            if (typeof entry === 'string') return entry;
            if (entry && typeof entry === 'object' && 'url' in entry) {
                const url = (entry as { url?: unknown }).url;
                return typeof url === 'string' ? url : null;
            }
            return null;
        })
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');

    if (status !== 'needs-images') {
        return NextResponse.json(
            { error: 'Invalid status parameter. Use status=needs-images' },
            { status: 400 }
        );
    }

    const supabase = await createAdminClient();

    const { data, error } = await supabase
        .from('products_ingestion')
        .select('upc, image_candidates, consolidated, pipeline_status')
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

    const products = ((data || []) as ProductImageRow[]).map((row) => ({
        upc: row.upc,
        image_candidates: row.image_candidates,
        consolidated: row.consolidated,
        pipeline_status: row.pipeline_status,
    }));

    return NextResponse.json({ products });
}

export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const supabase = await createAdminClient();

    try {
        const body = await request.json();
        const { upc, selectedImages } = body;

        if (!upc || typeof upc !== 'string') {
            return NextResponse.json(
                { error: 'Missing or invalid upc' },
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
            .select('upc, image_candidates, selected_images, sources, consolidated')
            .eq('upc', upc)
            .single();

        if (fetchError || !products) {
            return NextResponse.json(
                { error: 'Product not found' },
                { status: 404 }
            );
        }

        const productRow = products as ProductImageValidationRow;
        const consolidated =
            productRow.consolidated && typeof productRow.consolidated === 'object'
                ? (productRow.consolidated as Record<string, unknown>)
                : {};

        const imageCandidates = Array.from(
            new Set([
                ...toImageUrlArray(productRow.image_candidates),
                ...toImageUrlArray(consolidated.images),
                ...extractSelectedImageUrls(productRow.selected_images),
                ...extractImageCandidatesFromSources(productRow.sources, 24),
            ])
        );

        for (const img of selectedImages) {
            if (!imageCandidates.includes(img)) {
                return NextResponse.json(
                    { error: `Invalid image: ${img} is not in image_candidates` },
                    { status: 400 }
                );
            }
        }

        const durableSelectedImages = await replaceInlineImageDataUrls(supabase, selectedImages, {
            folderPath: buildProductImageStorageFolder('pipeline-selected', upc),
            onError: (message, error) => {
                console.error(`[Pipeline Images] ${message}`, error);
            },
        });

        const updatedConsolidated = {
            ...consolidated,
            images: durableSelectedImages.value,
        };

        const { error: updateError } = await supabase
            .from('products_ingestion')
            .update({
                consolidated: updatedConsolidated,
                updated_at: new Date().toISOString(),
            })
            .eq('upc', upc);

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
