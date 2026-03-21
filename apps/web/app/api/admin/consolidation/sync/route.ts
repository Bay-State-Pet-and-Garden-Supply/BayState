import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { getBatchStatus, isOpenAIConfigured } from '@/lib/consolidation';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/admin/consolidation/sync
 * Sync status of all non-terminal batch jobs from OpenAI.
 * Fetches active batches from DB, checks OpenAI, and updates DB.
 */
export async function POST() {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    if (!(await isOpenAIConfigured())) {
        return NextResponse.json(
            { error: 'OpenAI API key not configured' },
            { status: 503 }
        );
    }

    try {
        const supabase = await createClient();

        // Get all non-terminal batches
        const { data: activeBatches, error: fetchError } = await supabase
            .from('batch_jobs')
            .select('id, openai_batch_id, status')
            .not('status', 'in', '(completed,failed,expired,cancelled)')
            .order('created_at', { ascending: false });

        if (fetchError) {
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        if (!activeBatches || activeBatches.length === 0) {
            return NextResponse.json({ synced_count: 0, message: 'No active batches to sync' });
        }

        let syncedCount = 0;
        const errors: string[] = [];

        for (const batch of activeBatches) {
            const batchId = batch.openai_batch_id || batch.id;
            try {
                // getBatchStatus already syncs to Supabase
                const status = await getBatchStatus(batchId);
                if (!('success' in status && !status.success)) {
                    syncedCount++;
                }
            } catch (err) {
                errors.push(`${batchId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
        }

        return NextResponse.json({
            synced_count: syncedCount,
            total_checked: activeBatches.length,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error) {
        console.error('[Consolidation Sync API] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to sync batches' },
            { status: 500 }
        );
    }
}
