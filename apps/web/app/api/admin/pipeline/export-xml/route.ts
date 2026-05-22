import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { loadStorefrontShopSiteExport } from '@/lib/shopsite/export-builder';
import { generateShopSiteXml } from '@/lib/shopsite/xml-generator';

export const runtime = 'nodejs';

interface ExportRequestBody {
    upcs?: unknown;
}

function parseUpcSelection(body: ExportRequestBody): string[] {
    if (body.upcs === undefined) {
        return [];
    }

    if (!Array.isArray(body.upcs)) {
        throw new Error('Expected "upcs" to be an array of UPC strings');
    }

    return body.upcs
        .map((upc) => (typeof upc === 'string' ? upc.trim() : ''))
        .filter((upc) => upc.length > 0);
}

async function buildXmlResponse(upcs?: string[]) {
    const { products } = await loadStorefrontShopSiteExport({ upcs });
    if (products.length === 0) {
        return NextResponse.json(
            { error: 'No export-ready storefront products available for ShopSite export' },
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

export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth(request);
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
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json() as ExportRequestBody;
        const upcs = parseUpcSelection(body);
        return await buildXmlResponse(upcs.length > 0 ? upcs : undefined);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate XML export';
        const status = message.includes('Expected "upcs"') || message.includes('export queue') ? 400 : 500;
        console.error('[ExportXML] Error:', err);
        return NextResponse.json({ error: message }, { status });
    }
}
