import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { scrapeProducts, ScrapeOptions } from '@/lib/pipeline-scraping';

export const dynamic = 'force-dynamic';

interface EnrichmentJobRequest {
    skus: string[];
    method: 'scrapers' | 'ai_search' | 'discovery' | 'crawl4ai';
    config?: {
        scrapers?: string[];
        aiSearch?: ScrapeOptions['aiSearchConfig'];
        discovery?: {
            product_name?: string;
            brand?: string;
            max_search_results?: number;
            max_steps?: number;
            confidence_threshold?: number;
            llm_provider?: 'openai' | 'openai_compatible';
            llm_model?: string;
            llm_base_url?: string | null;
            prefer_manufacturer?: boolean;
            fallback_to_static?: boolean;
            max_concurrency?: number;
        };
        crawl4ai?: {
            extraction_strategy?: 'llm' | 'llm_free' | 'auto';
            cache_enabled?: boolean;
            llm_provider?: 'openai' | 'openai_compatible';
            llm_model?: string;
            llm_base_url?: string | null;
            max_retries?: number;
            timeout?: number;
        };
    };
    chunkSize?: number;
    maxWorkers?: number;
}

function normalizeAISearchConfig(request: EnrichmentJobRequest): ScrapeOptions['aiSearchConfig'] | undefined {
    if (!request.config) {
        return undefined;
    }

    if (request.method === 'ai_search' && request.config.aiSearch) {
        return request.config.aiSearch;
    }

    if (request.method === 'discovery' && request.config.discovery) {
        return request.config.discovery;
    }

    if (request.method === 'crawl4ai' && request.config.crawl4ai) {
        return request.config.crawl4ai;
    }

    return undefined;
}

export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) {
        return auth.response;
    }

    try {
        const body = (await request.json()) as EnrichmentJobRequest;

        if (!body.skus || !Array.isArray(body.skus) || body.skus.length === 0) {
            return NextResponse.json({ error: 'skus must be a non-empty array' }, { status: 400 });
        }

        const validMethods = ['scrapers', 'ai_search', 'discovery', 'crawl4ai'];
        if (!body.method || !validMethods.includes(body.method)) {
            return NextResponse.json(
                { error: `method must be one of: ${validMethods.join(', ')}` },
                { status: 400 }
            );
        }

        const normalizedMethod: ScrapeOptions['enrichment_method'] =
            body.method === 'scrapers' ? 'scrapers' : 'ai_search';

        const scrapeOptions: ScrapeOptions = {
            enrichment_method: normalizedMethod,
            chunkSize: body.chunkSize,
            maxWorkers: body.maxWorkers,
        };

        if (body.method === 'scrapers' && body.config?.scrapers) {
            scrapeOptions.scrapers = body.config.scrapers;
        }

        const aiSearchConfig = normalizeAISearchConfig(body);
        if (normalizedMethod === 'ai_search' && aiSearchConfig) {
            scrapeOptions.aiSearchConfig = aiSearchConfig;
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
    } catch (error: unknown) {
        console.error('[Enrichment Jobs API] Request failed:', error);

        if (error instanceof Error && error.message.includes('JSON')) {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }

        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
