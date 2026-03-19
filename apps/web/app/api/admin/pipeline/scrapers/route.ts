import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { getLocalScraperConfigs } from '@/lib/admin/scrapers/configs';

/**
 * GET /api/admin/pipeline/scrapers
 * Returns available scrapers from local YAML configs for the scraper selection dialog.
 */
export async function GET() {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        const configs = await getLocalScraperConfigs();

        const scrapers = configs
            .filter((c) => c.status === 'active')
            .map((c) => ({
                slug: c.slug ?? c.id ?? '',
                display_name: c.display_name ?? c.name ?? c.slug ?? '',
                domain: c.domain ?? null,
                base_url: c.base_url ?? '',
                scraper_type: c.scraper_type ?? 'static',
                status: c.status ?? 'active',
            }));

        return NextResponse.json({ scrapers });
    } catch (error) {
        console.error('[Pipeline Scrapers] Failed to load scraper configs:', error);
        return NextResponse.json({ error: 'Failed to load scrapers' }, { status: 500 });
    }
}
