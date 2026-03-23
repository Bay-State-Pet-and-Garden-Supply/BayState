import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const PAGE_SIZE = 200;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ProductImageRow {
    id: string;
    name: string;
    images: string[] | null;
    brands: { name: string; slug: string | null } | null;
}

/**
 * Returns a JSON manifest of product images organized by brand.
 * Clients can use this to download images in bulk.
 *
 * Response format:
 * {
 *   brands: {
 *     "brand-slug": {
 *       brand_name: "Brand Name",
 *       images: [{ product_name, filename, url, index }]
 *     }
 *   },
 *   total_images: number,
 *   total_products: number
 * }
 */
export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const brandFilter = request.nextUrl.searchParams.get('brand');
    if (brandFilter && !UUID_REGEX.test(brandFilter)) {
        return NextResponse.json({ error: 'Invalid brand ID format' }, { status: 400 });
    }

    try {
        const supabase = await createAdminClient();

        const brandMap: Record<string, {
            brand_name: string;
            images: Array<{
                product_name: string;
                filename: string;
                url: string;
                index: number;
            }>;
        }> = {};

        let totalImages = 0;
        let totalProducts = 0;
        let page = 0;

        while (true) {
            const from = page * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            let query = supabase
                .from('products')
                .select('id, name, images, brands(name, slug)')
                .not('published_at', 'is', null)
                .not('images', 'is', null)
                .order('name', { ascending: true });

            if (brandFilter) {
                query = query.eq('brand_id', brandFilter);
            }

            const { data, error } = await query.range(from, to);

            if (error) {
                return NextResponse.json(
                    { error: `Failed to fetch products: ${error.message}` },
                    { status: 500 },
                );
            }

            if (!data || data.length === 0) break;

            for (const row of data as unknown as ProductImageRow[]) {
                const images = row.images || [];
                if (images.length === 0) continue;

                const brandSlug = row.brands?.slug || slugify(row.brands?.name || 'uncategorized');
                const brandName = row.brands?.name || 'Uncategorized';

                if (!brandMap[brandSlug]) {
                    brandMap[brandSlug] = { brand_name: brandName, images: [] };
                }

                totalProducts += 1;

                for (let i = 0; i < images.length; i++) {
                    const url = images[i];
                    const ext = extractExtension(url);
                    const productSlug = slugify(row.name);
                    const filename = i === 0
                        ? `${productSlug}.${ext}`
                        : `${productSlug}-${i + 1}.${ext}`;

                    brandMap[brandSlug].images.push({
                        product_name: row.name,
                        filename,
                        url,
                        index: i,
                    });
                    totalImages += 1;
                }
            }

            if (data.length < PAGE_SIZE) break;
            page += 1;
        }

        return NextResponse.json({
            brands: brandMap,
            total_images: totalImages,
            total_products: totalProducts,
        });
    } catch (err) {
        console.error('[ExportImages] Error:', err);
        return NextResponse.json(
            { error: 'Failed to generate image manifest' },
            { status: 500 },
        );
    }
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);
}

function extractExtension(url: string): string {
    try {
        const pathname = new URL(url).pathname;
        const match = pathname.match(/\.(\w{3,4})$/);
        if (match) return match[1].toLowerCase();
    } catch {
        // Not a valid URL, try regex
        const match = url.match(/\.(\w{3,4})(?:\?|$)/);
        if (match) return match[1].toLowerCase();
    }
    return 'jpg';
}
