import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { scrapeProducts } from '@/lib/pipeline-scraping';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * POST /api/admin/pipeline/scrape
 * Creates static scraper jobs for the given SKUs.
 *
 * Static scraping always runs first. Fallback (SERPER/AI) extraction
 * is handled separately via the fallback review/approval flow.
 *
 * Body: {
 *   skus: string[]        — product SKUs to scrape
 *   scrapers: string[]    — scraper slugs to use (empty = all)
 *   testMode?: boolean
 * }
 *
 * Legacy fields (enrichment_method, official_brand_phase, urls_by_sku,
 * cohort_id, deep_research) are rejected with a 400 error.
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json();
        const { skus, scrapers, testMode } = body as {
            skus: string[];
            scrapers: string[];
            testMode?: boolean;
        };

        if (!skus || !Array.isArray(skus) || skus.length === 0) {
            return NextResponse.json({ error: 'SKUs array is required' }, { status: 400 });
        }

        // Reject legacy enrichment method fields
        const legacyFields = ['enrichment_method', 'official_brand_phase', 'urls_by_sku', 'cohort_id', 'deep_research'] as const;
        for (const field of legacyFields) {
            if (field in body) {
                return NextResponse.json(
                    { error: `Legacy field '${field}' is no longer supported. Static scraping is always the first step. Use the fallback review/approval flow for SERPER/AI extraction.` },
                    { status: 400 }
                );
            }
        }

        if (!scrapers || !Array.isArray(scrapers)) {
            return NextResponse.json({ error: 'Scrapers array is required' }, { status: 400 });
        }

        // Validate scraper credentials before starting standard scraping
        const requiredCredentialSlugs = new Set<string>();
        const scraperToCredSlug: Record<string, string> = {
            phillips_crawl4ai: 'phillips',
            orgill_crawl4ai: 'orgill',
            pet_food_experts_crawl4ai: 'petfoodex',
        };

        for (const scraper of scrapers) {
            const slug = scraperToCredSlug[scraper];
            if (slug) {
                requiredCredentialSlugs.add(slug);
            }
        }

        if (requiredCredentialSlugs.size > 0) {
            const slugs = Array.from(requiredCredentialSlugs);
            const supabase = await createAdminClient();
            const { data: dbCreds, error: dbCredsError } = await supabase
                .from('scraper_credentials')
                .select('scraper_slug, credential_type')
                .in('scraper_slug', slugs);

            if (dbCredsError) {
                return NextResponse.json(
                    { error: `Database error checking credentials: ${dbCredsError.message}` },
                    { status: 500 }
                );
            }

            const missingMap: Record<string, string[]> = {};
            for (const slug of slugs) {
                const matchingCreds = (dbCreds || []).filter(
                    (c: { scraper_slug: string }) => c.scraper_slug === slug
                );
                
                const hasLogin = matchingCreds.some(
                    (c: { credential_type: string }) => c.credential_type === 'login'
                );
                const hasPassword = matchingCreds.some(
                    (c: { credential_type: string }) => c.credential_type === 'password'
                );
                
                const missingTypes: string[] = [];
                if (!hasLogin) missingTypes.push('Username');
                if (!hasPassword) missingTypes.push('Password');
                
                if (missingTypes.length > 0) {
                    missingMap[slug] = missingTypes;
                }
            }

            if (Object.keys(missingMap).length > 0) {
                const friendlyNames: Record<string, string> = {
                    phillips: 'Phillips Pet',
                    orgill: 'Orgill',
                    petfoodex: 'Pet Food Experts',
                };
                
                const errorDetails = Object.entries(missingMap)
                    .map(([slug, missing]) => {
                        const name = friendlyNames[slug] || slug;
                        return `${name} (missing: ${missing.join(' and ')})`;
                    })
                    .join(', ');

                return NextResponse.json(
                    {
                        error: `Scrape cannot be started. Credentials are not configured in Settings for: ${errorDetails}. Please go to Settings to configure them before starting a scrape.`,
                    },
                    { status: 400 }
                );
            }
        }

        const result = await scrapeProducts(skus, {
            scrapers,
            testMode: testMode ?? false,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            jobIds: result.jobIds,
            skuCount: skus.length,
            scraperCount: scrapers?.length ?? 0,
        });
    } catch (error) {
        console.error('[Pipeline Scrape] Request failed:', error);
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}
