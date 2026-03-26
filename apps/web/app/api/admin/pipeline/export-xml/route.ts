import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { loadPublishedShopSiteExport } from '@/lib/shopsite/export-builder';
import { generateShopSiteXml } from '@/lib/shopsite/xml-generator';

export const runtime = 'nodejs';

interface ExportRequestBody {
    skus?: unknown;
}

function parseSkuSelection(body: ExportRequestBody): string[] {
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

async function buildXmlResponse(skus?: string[]) {
    const { products } = await loadPublishedShopSiteExport({ skus });
    if (products.length === 0) {
        return NextResponse.json(
            { error: 'No published products available for ShopSite export' },
            { status: 404 },
        );
    }

    const xml = generateShopSiteXml(products);

    return new NextResponse(xml, {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Content-Disposition': 'attachment; filename="shopsite-products.xml"',
            'Cache-Control': 'no-store',
        },
    });
}

export async function GET() {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        return await buildXmlResponse();
    } catch (err) {
        console.error('[ExportXML] Error:', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Failed to generate XML export' },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json() as ExportRequestBody;
        const skus = parseSkuSelection(body);
        return await buildXmlResponse(skus.length > 0 ? skus : undefined);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate XML export';
        const status = message.includes('Expected "skus"') || message.includes('not published') ? 400 : 500;
        console.error('[ExportXML] Error:', err);
        return NextResponse.json({ error: message }, { status });
    }
}
