import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { scrapeProducts } from '@/lib/pipeline-scraping';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/admin/pipeline/scrape
 * Creates scraper jobs for the given SKUs and transitions them to 'scraped' status.
 *
 * Body: {
 *   skus: string[]              — product SKUs to scrape
 *   scrapers: string[]          — scraper slugs to use (empty = all)
 *   enrichment_method?: string  — 'scrapers' | 'ai_search'
 *   testMode?: boolean
 *   cohort_id?: string          — optional cohort ID to resolve brand for context
 * }
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json();
        const { skus, scrapers, enrichment_method, testMode, cohort_id } = body as {
            skus: string[];
            scrapers: string[];
            enrichment_method?: 'scrapers' | 'ai_search';
            testMode?: boolean;
            cohort_id?: string;
        };

        if (!skus || !Array.isArray(skus) || skus.length === 0) {
            return NextResponse.json({ error: 'SKUs array is required' }, { status: 400 });
        }

        if (!scrapers || !Array.isArray(scrapers)) {
            return NextResponse.json({ error: 'Scrapers array is required' }, { status: 400 });
        }

        // Resolve cohort brand for context enrichment
        let cohortBrand: string | undefined;
        if (cohort_id) {
            const supabase = await createClient();
            const { data: cohort } = await supabase
                .from('cohort_batches')
                .select('brand_name, brand_id, brands(name)')
                .eq('id', cohort_id)
                .single();

            if (cohort) {
                cohortBrand = cohort.brand_name || undefined;
                if (!cohortBrand) {
                    const brandRecord = Array.isArray(cohort.brands) ? cohort.brands[0] : cohort.brands;
                    if (brandRecord && typeof brandRecord === 'object' && 'name' in brandRecord) {
                        cohortBrand = (brandRecord as { name: string }).name;
                    }
                }
            }
        }

        const result = await scrapeProducts(skus, {
            scrapers,
            enrichment_method: enrichment_method ?? 'scrapers',
            testMode: testMode ?? false,
            cohortBrand,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        // Status transition is handled by the scraper callback when results arrive.
        // Products stay in their current status until meaningful data is delivered.

        return NextResponse.json({
            success: true,
            jobIds: result.jobIds,
            skuCount: skus.length,
            scraperCount: scrapers.length,
        });
    } catch (error) {
        console.error('[Pipeline Scrape] Request failed:', error);
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}
