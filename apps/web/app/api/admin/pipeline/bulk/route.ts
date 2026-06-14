import { NextRequest, NextResponse } from 'next/server';
import { bulkUpdateStatus } from '@/lib/pipeline';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { PERSISTED_PIPELINE_STATUSES, isPersistedStatus } from '@/lib/pipeline/types';
import { createAdminClient } from '@/lib/supabase/server';
import { bulkPublishToStorefront } from '@/lib/pipeline/publish';

const CANONICAL_PERSISTED_STATUS_LIST = PERSISTED_PIPELINE_STATUSES.map(
    status => `'${status}'`
).join(', ');

/**
 * POST /api/admin/pipeline/bulk
 * Bulk transition products to a new status
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json();
        const { toStatus, cohort_id, fromStatus, resetResults = false } = body as {
            upcs?: string[];
            toStatus: string;
            cohort_id?: string;
            fromStatus?: string;
            resetResults?: boolean;
        };
        let { upcs } = body as {
            upcs?: string[];
            toStatus: string;
            cohort_id?: string;
            fromStatus?: string;
            resetResults?: boolean;
        };

        // If cohort_id is provided, resolve UPCs from the database
        if (cohort_id && fromStatus) {
            const supabase = await createAdminClient();
            const { data: rows, error: queryError } = await supabase
                .from('products_ingestion')
                .select('upc')
                .eq('cohort_id', cohort_id)
                .eq('pipeline_status', fromStatus);

            if (queryError) {
                return NextResponse.json(
                    { error: `Failed to load cohort UPCs: ${queryError.message}` },
                    { status: 500 }
                );
            }

            upcs = (rows ?? []).map((r: { upc?: string }) => r.upc).filter(Boolean) as string[];
        }

        // Validate upcs array
        if (!upcs || !Array.isArray(upcs) || upcs.length === 0) {
            return NextResponse.json(
                { error: 'UPCs array is required and must be non-empty' },
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

        if (toStatus === 'published') {
            return NextResponse.json(
                {
                    error: 'Published is no longer a workflow state. Use reviewing/publishing instead.',
                },
                { status: 400 }
            );
        }

        if (!isPersistedStatus(toStatus)) {
            return NextResponse.json(
                { error: `Invalid status '${toStatus}'. Allowed persisted statuses: ${CANONICAL_PERSISTED_STATUS_LIST}` },
                { status: 400 }
            );
        }

        if (toStatus === 'publishing') {
            const publishResult = await bulkPublishToStorefront(upcs, auth.user.id);
            if (!publishResult.success && publishResult.successCount === 0) {
                return NextResponse.json(
                    { 
                        error: 'Failed to publish products to storefront', 
                        details: publishResult.errors 
                    },
                    { status: 500 }
                );
            }
            
            return NextResponse.json({
                success: true,
                updatedCount: publishResult.successCount,
                errors: publishResult.errors.length > 0 ? publishResult.errors : undefined,
            });
        }

        const result = await bulkUpdateStatus(upcs, toStatus, auth.user.id, resetResults);

        if (!result.success) {
            if (result.error && result.error.includes('Invalid status transition')) {
                const invalidMatch = result.error.match(/UPC\(s\): (.+)$/);
                const invalidUpcs = invalidMatch ? invalidMatch[1].split(', ') : [];
                return NextResponse.json({ error: 'Invalid transitions', invalidUpcs }, { status: 400 });
            }
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        // Create enrichment_job for the Extracting tab to display
        if (toStatus === 'extracting') {
            try {
                const adminClient = await createAdminClient();
                const jobId = `cascade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                await adminClient.from('enrichment_jobs').insert({
                    id: jobId,
                    mode: 'distributor_only',
                    model: 'source-cascade',
                    status: 'pending',
                    upcs: upcs,
                    total_count: upcs.length,
                    completed_count: 0,
                    failed_count: 0,
                    config: { source_kind: 'static_scraper', auto: true },
                    test_metadata: {},
                    test_mode: false,
                    token_usage: {},
                });
            } catch (err) {
                console.warn('[Pipeline Bulk] enrichment_job create failed:', err);
            }
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
