import { NextRequest, NextResponse } from 'next/server';
import { bulkUpdateStatus } from '@/lib/pipeline';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { publishToStorefront } from '@/lib/pipeline/publish';
import { PERSISTED_PIPELINE_STATUSES, isPersistedStatus } from '@/lib/pipeline/types';

const CANONICAL_PERSISTED_STATUS_LIST = PERSISTED_PIPELINE_STATUSES.map(
    status => `'${status}'`
).join(', ');

/**
 * POST /api/admin/pipeline/bulk
 * Bulk transition products to a new status
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json();
        const { skus, toStatus, resetResults = false } = body as { 
            skus: string[]; 
            toStatus: string;
            resetResults?: boolean;
        };

        // Validate skus array
        if (!skus || !Array.isArray(skus) || skus.length === 0) {
            return NextResponse.json(
                { error: 'SKUs array is required and must be non-empty' },
                { status: 400 }
            );
        }

        // Validate toStatus
        if (!toStatus) {
            return NextResponse.json(
                { error: 'toStatus is required' },
                { status: 400 }
            );
        }

        if (!isPersistedStatus(toStatus)) {
            return NextResponse.json(
                { error: `Invalid status '${toStatus}'. Allowed persisted statuses: ${CANONICAL_PERSISTED_STATUS_LIST}` },
                { status: 400 }
            );
        }

        // Finalized rows can still be pushed to the storefront table separately.
        if (toStatus === 'finalized') {
            const publishResults = await Promise.all(
                skus.map(sku => publishToStorefront(sku))
            );

            const failures = publishResults.filter(r => !r.success);
            if (failures.length > 0 && failures.length === skus.length) {
                return NextResponse.json(
                    { error: 'Failed to publish any products to storefront', details: failures[0].error },
                    { status: 500 }
                );
            }
        }

        const result = await bulkUpdateStatus(skus, toStatus, auth.user.id, resetResults);

        if (!result.success) {
            // Check if error indicates invalid transitions
            if (result.error && result.error.includes('Invalid status transition')) {
                // Extract invalid SKUs from error message
                const invalidMatch = result.error.match(/SKU\(s\): (.+)$/);
                const invalidSkus = invalidMatch ? invalidMatch[1].split(', ') : [];

                return NextResponse.json(
                    {
                        error: 'Invalid transitions',
                        invalidSkus,
                    },
                    { status: 400 }
                );
            }

            // Other errors return 500
            return NextResponse.json(
                { error: result.error },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            updatedCount: result.updatedCount,
        });
    } catch {
        return NextResponse.json(
            { error: 'Invalid request body' },
            { status: 400 }
        );
    }
}
