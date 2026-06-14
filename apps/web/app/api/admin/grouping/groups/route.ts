import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/grouping/groups
 * List Product Groups and Ungrouped products in the grouping stage.
 *
 * Returns:
 *   - groups: Array of { product_line_id, product_line_name, products[], review_required_count }
 *   - ungrouped: Array of products without a product_line_id
 */
export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const supabase = await createAdminClient();

    try {
        // Get grouped products (have a product_line_id) in grouping stage
        const { data: groupedProducts, error: groupedError } = await supabase
            .from('products_ingestion')
            .select(`
                upc,
                pipeline_status,
                product_line_id,
                product_line_confidence,
                product_line_assignment_source,
                product_line_raw_label,
                product_line_rationale,
                product_line_review_required,
                input,
                sources,
                consolidated,
                product_lines:product_line_id (
                    id,
                    canonical_name
                )
            `)
            .eq('pipeline_status', 'grouping')
            .not('product_line_id', 'is', null)
            .order('upc');

        // Get ungrouped products (no product_line_id) in grouping stage.
        // Include review fields so we can derive accepted vs needs-review without extra queries.
        const { data: ungroupedProducts, error: ungroupedError } = await supabase
            .from('products_ingestion')
            .select(`
                upc,
                pipeline_status,
                product_line_confidence,
                product_line_raw_label,
                product_line_rationale,
                product_line_review_required,
                product_line_assignment_source,
                input,
                sources
            `)
            .eq('pipeline_status', 'grouping')
            .is('product_line_id', null)
            .order('upc');

        if (groupedError || ungroupedError) {
            return NextResponse.json(
                { error: groupedError?.message || ungroupedError?.message || 'Failed to fetch groups' },
                { status: 500 }
            );
        }

        // Organize grouped products into Product Groups with derived readiness state.
        // A group is Ready when ALL its products have:
        //   product_line_review_required === false
        //   product_line_assignment_source IS NOT NULL
        const groupMap = new Map<string, {
            product_line_id: string;
            product_line_name: string;
            products: any[];
            review_required_count: number;
            /** Whether this group is Ready (all products have been reviewed and assigned). */
            ready: boolean;
            /** UPCs within this group that still need review. */
            review_required_products: string[];
        }>();

        for (const product of (groupedProducts || [])) {
            const plId = product.product_line_id as string | null;
            if (!plId) continue;

            const plData = (product as any).product_lines as { id: string; canonical_name: string } | null;

            if (!groupMap.has(plId)) {
                groupMap.set(plId, {
                    product_line_id: plId,
                    product_line_name: plData?.canonical_name || 'Unknown Product Line',
                    products: [],
                    review_required_count: 0,
                    ready: true,
                    review_required_products: [],
                });
            }

            const group = groupMap.get(plId)!;
            const cleanProduct = { ...product };
            delete (cleanProduct as any).product_lines;
            group.products.push(cleanProduct);

            const needsReview = product.product_line_review_required === true
                || product.product_line_assignment_source === null
                || product.product_line_assignment_source === undefined;

            if (needsReview) {
                group.review_required_count++;
                group.ready = false;
                group.review_required_products.push(product.upc as string);
            }
        }

        // Compute readiness counts
        let readyGroupCount = 0;
        let needsReviewGroupCount = 0;
        for (const group of groupMap.values()) {
            if (group.ready) readyGroupCount++;
            else needsReviewGroupCount++;
        }

        // Ungrouped products — derive accepted vs needs-review.
        // Accepted: review_required=false AND assignment_source is set.
        const acceptedSingletons: any[] = [];
        const needsReviewUngrouped: any[] = [];
        for (const up of (ungroupedProducts || [])) {
            const accepted = up.product_line_review_required === false
                && up.product_line_assignment_source !== null
                && up.product_line_assignment_source !== undefined;

            if (accepted) {
                acceptedSingletons.push({ ...up, accepted: true });
            } else {
                needsReviewUngrouped.push({ ...up, accepted: false });
            }
        }

        return NextResponse.json({
            groups: Array.from(groupMap.values()).map(g => ({
                ...g,
                ready: g.ready,
                review_required_products: g.review_required_products,
            })),
            ungrouped: [
                ...acceptedSingletons,
                ...needsReviewUngrouped,
            ],
            ready_group_count: readyGroupCount,
            needs_review_group_count: needsReviewGroupCount,
            accepted_singleton_count: acceptedSingletons.length,
            needs_review_singleton_count: needsReviewUngrouped.length,
            total_grouped: (groupedProducts || []).length,
            total_ungrouped: (ungroupedProducts || []).length,
        });
    } catch (error) {
        console.error('[Grouping API] List groups error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to list groups' },
            { status: 500 }
        );
    }
}
