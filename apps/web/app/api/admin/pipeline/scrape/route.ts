import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

/**
 * POST /api/admin/pipeline/scrape
 *
 * Deprecated — manual scraper selection was removed in favor of the
 * automated Source Cascade. Use POST /api/admin/enrichment/jobs instead.
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    return NextResponse.json(
        {
            error: 'This endpoint is deprecated. Manual scraper selection has been replaced by the automated Source Cascade. Use POST /api/admin/enrichment/jobs with { upcs } instead.',
        },
        { status: 410 },
    );
}
