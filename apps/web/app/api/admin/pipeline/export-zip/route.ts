import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { loadStorefrontShopSiteExport } from '@/lib/shopsite/export-builder';
import { generateShopSiteXml } from '@/lib/shopsite/xml-generator';
import archiver from 'archiver';
import sharp from 'sharp';
import { PassThrough } from 'node:stream';
import { Readable } from 'node:stream';

export const runtime = 'nodejs';

// Use a max duration if deploying to Vercel (ignored locally)
export const maxDuration = 300; // 5 minutes (max for Vercel Pro)

interface ExportRequestBody {
    upcs?: unknown;
    includeExportedSelection?: unknown;
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

async function buildZipResponse(upcs?: string[], includeExportedSelection = false) {
    const { products } = await loadStorefrontShopSiteExport({
        upcs,
        includeExportedRequestedUpcs: includeExportedSelection,
    });
    if (products.length === 0) {
        return NextResponse.json(
            { error: 'No export-ready storefront products available for ShopSite export' },
            { status: 404 },
        );
    }

    const passThrough = new PassThrough();
    const archive = archiver('zip', { zlib: { level: 5 } });

    archive.on('error', (err) => {
        console.error('[ExportZip] Archive error:', err);
        passThrough.destroy(err);
    });

    archive.pipe(passThrough);

    const stream = Readable.toWeb(passThrough) as ReadableStream;

    void (async () => {
        try {
            archive.append(generateShopSiteXml(products), { name: 'shopsite-products.xml' });

            const seenPaths = new Set<string>();
            for (const product of products) {
                for (let index = 0; index < product.image_sources.length; index += 1) {
                    const sourceUrl = product.image_sources[index];
                    const zipPath = product.images[index];

                    if (!sourceUrl || !zipPath || seenPaths.has(zipPath)) {
                        continue;
                    }

                    seenPaths.add(zipPath);

                    try {
                        const response = await fetch(sourceUrl);
                        if (!response.ok) {
                            console.warn(`[ExportZip] Failed to fetch image ${sourceUrl} (${response.status})`);
                            continue;
                        }

                        const arrayBuffer = await response.arrayBuffer();
                        const buffer = Buffer.from(arrayBuffer);
                        const resizedBuffer = await sharp(buffer)
                            .flatten({ background: '#ffffff' })
                            .resize(1000, 1000, {
                                fit: 'contain',
                                background: { r: 255, g: 255, b: 255, alpha: 1 },
                            })
                            .jpeg({ quality: 90 })
                            .toBuffer();

                        archive.append(resizedBuffer, { name: zipPath });
                    } catch (imageErr) {
                        console.error(`[ExportZip] Error processing image ${sourceUrl}:`, imageErr);
                    }
                }
            }

            await archive.finalize();
        } catch (err) {
            console.error('[ExportZip] Async processing error:', err);
            archive.abort();
        }
    })();

    const dateStr = new Date().toISOString().split('T')[0];

    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="shopsite-export-${dateStr}.zip"`,
            'Cache-Control': 'no-store',
        },
    });
}

export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    try {
        return await buildZipResponse();
    } catch (err) {
        console.error('[ExportZip] Setup error:', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Failed to generate ZIP export' },
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
        return await buildZipResponse(
            upcs.length > 0 ? upcs : undefined,
            body.includeExportedSelection === true,
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate ZIP export';
        const status = message.includes('Expected "upcs"') || message.includes('export queue') ? 400 : 500;
        console.error('[ExportZip] Setup error:', err);
        return NextResponse.json({ error: message }, { status });
    }
}
