import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { scrapeProducts } from '@/lib/pipeline-scraping';

export const dynamic = 'force-dynamic';

interface EnrichmentJobRequest {
    skus: string[];
    method: 'scrapers' | 'official_brand' | 'crawl4ai';
    config?: {
        scrapers?: string[];
    };
    chunkSize?: number;
    maxWorkers?: number;
    maxRunners?: number;
}

export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) {
        return auth.response;
    }

    try {
        const body = (await request.json()) as EnrichmentJobRequest;

        if (!body.skus || !Array.isArray(body.skus) || body.skus.length === 0) {
            return NextResponse.json({ error: 'skus must be a non-empty array' }, { status: 400 });
        }

        if (body.method !== 'scrapers') {
            return NextResponse.json(
                {
                    error: `'${body.method}' is no longer supported. Static scraping is always the first step. Use the fallback review/approval flow for SERPER/AI extraction.`,
                    supported_methods: ['scrapers'],
                },
                { status: 400 }
            );
        }

        const result = await scrapeProducts(body.skus, {
            scrapers: body.config?.scrapers ?? [],
            chunkSize: body.chunkSize,
            maxWorkers: body.maxWorkers,
            maxRunners: body.maxRunners,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            jobIds: result.jobIds,
            skuCount: body.skus.length,
        });
    } catch (error) {
        console.error('[Enrichment Jobs] Request failed:', error);
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}
