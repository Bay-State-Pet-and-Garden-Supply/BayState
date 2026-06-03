import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { FIXED_DISTRIBUTOR_CATALOG } from '@/lib/approved-sources/distributor-catalog';

/**
 * GET /api/admin/pipeline/scrapers
 * Returns available scrapers from the crawl4ai distributor catalog for the scraper selection dialog.
 */
export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    try {
        const scrapers = FIXED_DISTRIBUTOR_CATALOG.map((entry) => ({
            slug: entry.adapterSlug,
            display_name: entry.displayName,
            domain: entry.domains[0] || null,
            base_url: entry.domains[0] ? `https://${entry.domains[0]}` : '',
            scraper_type: 'crawl4ai',
            status: 'active',
        }));

        return NextResponse.json({ scrapers });
    } catch (error) {
        console.error('[Pipeline Scrapers] Failed to load crawl4ai adapters:', error);
        return NextResponse.json({ error: 'Failed to load scrapers' }, { status: 500 });
    }
}
