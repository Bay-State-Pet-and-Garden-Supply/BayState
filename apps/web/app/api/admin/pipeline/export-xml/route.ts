import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';
import { generateShopSiteXml } from '@/lib/shopsite/xml-generator';
import type { ShopSiteExportProduct } from '@/lib/shopsite/xml-generator';

export const runtime = 'nodejs';

const PAGE_SIZE = 200;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ProductRow {
    id: string;
    name: string;
    sku: string | null;
    price: number;
    weight: string | null;
    description: string | null;
    long_description: string | null;
    images: string[] | null;
    product_type: string | null;
    search_keywords: string | null;
    shopsite_pages: string[] | null;
    is_special_order: boolean | null;
    is_taxable: boolean | null;
    brands: { name: string } | null;
    categories: { name: string } | null;
}

export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const brandFilter = request.nextUrl.searchParams.get('brand');
    if (brandFilter && !UUID_REGEX.test(brandFilter)) {
        return NextResponse.json({ error: 'Invalid brand ID format' }, { status: 400 });
    }

    try {
        const supabase = await createAdminClient();
        const products: ShopSiteExportProduct[] = [];
        let page = 0;

        while (true) {
            const from = page * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;

            let query = supabase
                .from('products')
                .select('id, name, sku, price, weight, description, long_description, images, product_type, search_keywords, shopsite_pages, is_special_order, is_taxable, brands(name), categories(name)')
                .not('published_at', 'is', null)
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

            for (const row of data as unknown as ProductRow[]) {
                const brandName = row.brands?.name ?? null;
                const categoryName = row.categories?.name ?? null;

                products.push({
                    sku: row.sku || row.id,
                    name: row.name,
                    price: row.price,
                    weight: row.weight,
                    brand_name: brandName,
                    description: row.description,
                    long_description: row.long_description,
                    images: row.images || [],
                    category: categoryName,
                    product_type: row.product_type,
                    shopsite_pages: row.shopsite_pages,
                    search_keywords: row.search_keywords,
                    is_special_order: row.is_special_order ?? false,
                    is_taxable: row.is_taxable ?? true,
                });
            }

            if (data.length < PAGE_SIZE) break;
            page += 1;
        }

        const xml = generateShopSiteXml(products);

        return new NextResponse(xml, {
            headers: {
                'Content-Type': 'application/xml; charset=utf-8',
                'Content-Disposition': 'attachment; filename="shopsite-products.xml"',
                'Cache-Control': 'no-store',
            },
        });
    } catch (err) {
        console.error('[ExportXML] Error:', err);
        return NextResponse.json(
            { error: 'Failed to generate XML export' },
            { status: 500 },
        );
    }
}
