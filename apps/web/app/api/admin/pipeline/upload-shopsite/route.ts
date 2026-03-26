import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { ShopSiteClient } from '@/lib/admin/migration/shopsite-client';
import { getStoredShopSiteConfig } from '@/lib/admin/shopsite-settings';
import { loadPublishedShopSiteExport } from '@/lib/shopsite/export-builder';
import { buildShopSiteNewProductTag, generateShopSiteXml } from '@/lib/shopsite/xml-generator';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface UploadRequestBody {
    skus?: unknown;
}

function parseSkuSelection(body: UploadRequestBody): string[] {
    if (body.skus === undefined) {
        return [];
    }

    if (!Array.isArray(body.skus)) {
        throw new Error('Expected "skus" to be an array of SKU strings');
    }

    return body.skus
        .map((sku) => (typeof sku === 'string' ? sku.trim() : ''))
        .filter((sku) => sku.length > 0);
}

async function parseRequestBody(request: NextRequest): Promise<UploadRequestBody> {
    const rawBody = await request.text();
    if (!rawBody) {
        return {};
    }

    return JSON.parse(rawBody) as UploadRequestBody;
}

export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        const body = await parseRequestBody(request);
        const skus = parseSkuSelection(body);
        const { products } = await loadPublishedShopSiteExport({
            skus: skus.length > 0 ? skus : undefined,
        });

        if (products.length === 0) {
            return NextResponse.json(
                { error: 'No published products available for ShopSite upload' },
                { status: 404 },
            );
        }

        const config = await getStoredShopSiteConfig();
        if (!config) {
            return NextResponse.json(
                { error: 'ShopSite settings are incomplete. Please configure the store URL, merchant ID, and password in Admin Settings.' },
                { status: 400 },
            );
        }

        const marker = buildShopSiteNewProductTag();
        const xml = generateShopSiteXml(products, { newProductTag: marker });
        const client = new ShopSiteClient(config);

        await client.uploadProductsXml(xml, {
            uniqueName: 'SKU',
            publish: {
                htmlpages: true,
                index: true,
            },
        });

        return NextResponse.json({
            success: true,
            uploadedCount: products.length,
            marker,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to upload products to ShopSite';
        const status = message.includes('Expected "skus"') || message.includes('not published') ? 400 : 500;
        console.error('[UploadShopSite] Error:', err);
        return NextResponse.json({ error: message }, { status });
    }
}
