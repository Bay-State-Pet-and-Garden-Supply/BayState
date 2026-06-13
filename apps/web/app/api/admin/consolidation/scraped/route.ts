import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

/**
 * POST /api/admin/consolidation/scraped
 *
 * @deprecated This legacy endpoint used the TwoPhaseConsolidationService which
 *   has been removed. Use the new grouping stage APIs instead:
 *   - POST /api/admin/grouping/submit — submit products for AI product line classification
 *   - POST /api/admin/consolidation/submit — submit grouped products for consolidation
 *
 *   Pipeline flow is now: processed → grouping (new) → merging (consolidation)
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    return NextResponse.json(
        {
            error: 'This legacy endpoint has been removed. Use the Grouping stage to classify products into product lines before consolidation.',
            migration: 'Navigate to the Processed tab in the Pipeline UI, select products, and click "Group Products" to start the new flow.',
        },
        { status: 410 }
    );
}
