import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/admin/consolidation/reset
 * Resets the pipeline_status of all products stuck in 'consolidating' back to 'scraped'.
 * This is meant as a recovery mechanism if batches fail silently or products become stranded.
 * It will refuse to run if there are any active (in_progress, validating) batch jobs.
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        const supabase = await createClient();

        // 1. Check for active batch jobs. If there are any, we cannot safely reset all consolidating products.
        const { count, error: countError } = await supabase
            .from('batch_jobs')
            .select('*', { count: 'exact', head: true })
            .in('status', ['in_progress', 'validating']);

        if (countError) {
            console.error('[Consolidation Reset API] Failed to check active batches:', countError);
            return NextResponse.json({ error: 'Failed to verify active batch jobs' }, { status: 500 });
        }

        if (count && count > 0) {
            return NextResponse.json(
                {
                    error: `Safety abort: There are ${count} active consolidation batches. Please cancel them or wait for them to finish before resetting stranded products.`,
                },
                { status: 400 }
            );
        }

        // 2. Select the skus that are currently stuck
        const { data: stuckProducts, error: selectError } = await supabase
            .from('products_ingestion')
            .select('sku')
            .eq('pipeline_status', 'consolidating');

        if (selectError) {
            console.error('[Consolidation Reset API] Failed to select stuck products:', selectError);
            return NextResponse.json({ error: 'Failed to identify stuck products' }, { status: 500 });
        }

        if (!stuckProducts || stuckProducts.length === 0) {
            return NextResponse.json({ success: true, reset_count: 0 });
        }

        const skusToReset = stuckProducts.map((p) => p.sku);

        // 3. Reset the status
        const { error: resetError } = await supabase
            .from('products_ingestion')
            .update({
                pipeline_status: 'scraped',
                updated_at: new Date().toISOString(),
            })
            .in('sku', skusToReset);

        if (resetError) {
            console.error('[Consolidation Reset API] Failed to reset product statuses:', resetError);
            return NextResponse.json({ error: 'Failed to update products' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            reset_count: skusToReset.length,
        });
    } catch (error) {
        console.error('[Consolidation Reset API] Reset error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to reset stranded products' },
            { status: 500 }
        );
    }
}
