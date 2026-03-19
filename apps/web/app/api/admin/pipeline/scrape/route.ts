import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { scrapeProducts } from '@/lib/pipeline-scraping';
import { bulkUpdateStatus } from '@/lib/pipeline';

/**
 * POST /api/admin/pipeline/scrape
 * Creates scraper jobs for the given SKUs and transitions them to 'scraped' status.
 *
 * Body: {
 *   skus: string[]              — product SKUs to scrape
 *   scrapers: string[]          — scraper slugs to use (empty = all)
 *   enrichment_method?: string  — 'scrapers' | 'ai_search'
 *   testMode?: boolean
 * }
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json();
        const { skus, scrapers, enrichment_method, testMode } = body as {
            skus: string[];
            scrapers: string[];
            enrichment_method?: 'scrapers' | 'ai_search';
            testMode?: boolean;
        };

        if (!skus || !Array.isArray(skus) || skus.length === 0) {
            return NextResponse.json({ error: 'SKUs array is required' }, { status: 400 });
        }

        if (!scrapers || !Array.isArray(scrapers)) {
            return NextResponse.json({ error: 'Scrapers array is required' }, { status: 400 });
        }

        const result = await scrapeProducts(skus, {
            scrapers,
            enrichment_method: enrichment_method ?? 'scrapers',
            testMode: testMode ?? false,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        // Transition products to 'scraped' status
        const statusResult = await bulkUpdateStatus(skus, 'scraped', auth.user.id);
        if (!statusResult.success) {
            console.warn('[Pipeline Scrape] Jobs created but status transition failed:', statusResult.error);
        }

        return NextResponse.json({
            success: true,
            jobIds: result.jobIds,
            skuCount: skus.length,
            scraperCount: scrapers.length,
            statusUpdated: statusResult.success,
        });
    } catch (error) {
        console.error('[Pipeline Scrape] Request failed:', error);
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}
