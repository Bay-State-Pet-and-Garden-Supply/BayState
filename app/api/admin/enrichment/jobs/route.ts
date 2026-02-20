import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { scrapeProducts, ScrapeOptions } from '@/lib/pipeline-scraping';

export const dynamic = 'force-dynamic';

interface EnrichmentJobRequest {
    skus: string[];
    method: 'scrapers' | 'discovery';
    config?: {
        scrapers?: string[];
        discovery?: {
            product_name?: string;
            brand?: string;
            max_search_results?: number;
            max_steps?: number;
            confidence_threshold?: number;
            llm_model?: 'gpt-4o-mini' | 'gpt-4o';
            prefer_manufacturer?: boolean;
            fallback_to_static?: boolean;
            max_concurrency?: number;
        };
    };
    chunkSize?: number;
    maxWorkers?: number;
}

export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) {
        return auth.response;
    }

    try {
        const body = await request.json() as EnrichmentJobRequest;

        if (!body.skus || !Array.isArray(body.skus) || body.skus.length === 0) {
            return NextResponse.json(
                { error: 'skus must be a non-empty array' },
                { status: 400 }
            );
        }

        if (!body.method || (body.method !== 'scrapers' && body.method !== 'discovery')) {
            return NextResponse.json(
                { error: 'method must be either "scrapers" or "discovery"' },
                { status: 400 }
            );
        }

        const scrapeOptions: ScrapeOptions = {
            enrichment_method: body.method,
            chunkSize: body.chunkSize,
            maxWorkers: body.maxWorkers,
        };

        if (body.method === 'scrapers' && body.config?.scrapers) {
            scrapeOptions.scrapers = body.config.scrapers;
        }

        if (body.method === 'discovery' && body.config?.discovery) {
            scrapeOptions.discoveryConfig = body.config.discovery;
        }

        const result = await scrapeProducts(body.skus, scrapeOptions);

        if (!result.success || !result.jobIds || result.jobIds.length === 0) {
            return NextResponse.json(
                { error: result.error || 'Failed to create enrichment job' },
                { status: 500 }
            );
        }

        const jobId = result.jobIds[0];
        const chunkSize = body.chunkSize ?? 50;
        const chunkCount = Math.ceil(body.skus.length / chunkSize);

        return NextResponse.json({
            jobId,
            chunkCount,
            statusUrl: `/admin/scrapers/runs/${jobId}`,
        });
    } catch (error) {
        console.error('[Enrichment Jobs API] Error:', error);
        
        if (error instanceof SyntaxError) {
            return NextResponse.json(
                { error: 'Invalid JSON in request body' },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
