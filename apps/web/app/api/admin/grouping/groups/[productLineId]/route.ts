import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import {
    reassignProductsToLine,
    mergeProductLines,
    splitProductLine,
    renameProductLine,
} from '@/lib/consolidation/grouping-service';

/**
 * PATCH /api/admin/grouping/groups/[productLineId]
 * Edit a Product Group: reassign products, ungroup, merge, split, or rename.
 *
 * Actions:
 *   - reassign: Move UPCs to this Product Group ({ action: 'reassign', upcs: string[] })
 *   - ungroup: Remove UPCs from this Product Group ({ action: 'ungroup', upcs: string[] })
 *   - merge: Merge another Product Group into this one ({ action: 'merge', target_product_line_id: string })
 *   - split: Split selected UPCs into a new Product Line ({ action: 'split', upcs: string[], new_product_line_name: string })
 *   - rename: Rename this Product Line ({ action: 'rename', new_name: string })
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ productLineId: string }> }
) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const { productLineId } = await params;

    try {
        const body = await request.json();
        const action = body.action as string;

        if (!action) {
            return NextResponse.json({ error: 'action is required (reassign, ungroup, merge, split, rename)' }, { status: 400 });
        }

        switch (action) {
            case 'reassign': {
                const { upcs } = body;
                if (!upcs || !Array.isArray(upcs) || upcs.length === 0) {
                    return NextResponse.json({ error: 'upcs array is required' }, { status: 400 });
                }
                await reassignProductsToLine(upcs, productLineId);
                return NextResponse.json({ success: true, moved_count: upcs.length });
            }

            case 'ungroup': {
                const { upcs } = body;
                if (!upcs || !Array.isArray(upcs) || upcs.length === 0) {
                    return NextResponse.json({ error: 'upcs array is required' }, { status: 400 });
                }
                await reassignProductsToLine(upcs, null);
                return NextResponse.json({ success: true, ungrouped_count: upcs.length });
            }

            case 'merge': {
                const { target_product_line_id } = body;
                if (!target_product_line_id) {
                    return NextResponse.json({ error: 'target_product_line_id is required' }, { status: 400 });
                }
                const result = await mergeProductLines(productLineId, target_product_line_id);
                return NextResponse.json({ success: true, ...result });
            }

            case 'split': {
                const { upcs, new_product_line_name } = body;
                if (!upcs || !Array.isArray(upcs) || upcs.length === 0) {
                    return NextResponse.json({ error: 'upcs array is required' }, { status: 400 });
                }
                if (!new_product_line_name || typeof new_product_line_name !== 'string') {
                    return NextResponse.json({ error: 'new_product_line_name is required' }, { status: 400 });
                }
                const result = await splitProductLine(upcs, new_product_line_name);
                return NextResponse.json({ success: true, ...result });
            }

            case 'rename': {
                const { new_name } = body;
                if (!new_name || typeof new_name !== 'string') {
                    return NextResponse.json({ error: 'new_name is required' }, { status: 400 });
                }
                await renameProductLine(productLineId, new_name);
                return NextResponse.json({ success: true });
            }

            default:
                return NextResponse.json(
                    { error: `Unknown action: ${action}. Supported actions: reassign, ungroup, merge, split, rename` },
                    { status: 400 }
                );
        }
    } catch (error) {
        console.error('[Grouping API] Edit group error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to update product line' },
            { status: 500 }
        );
    }
}
