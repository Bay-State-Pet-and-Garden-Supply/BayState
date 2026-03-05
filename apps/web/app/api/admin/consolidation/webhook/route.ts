import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applyResults } from '@/lib/consolidation';

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

/**
 * POST /api/admin/consolidation/webhook
 * Webhook handler for OpenAI Batch API completion notifications.
 *
 * Note: OpenAI doesn't currently support webhooks for batch completion,
 * but this endpoint is ready for when they do, or for manual polling triggers.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { batch_id, status } = body;

        if (!batch_id) {
            return NextResponse.json({ error: 'batch_id is required' }, { status: 400 });
        }

        const supabase = await createClient();
        const openAiLookup = await supabase
            .from('batch_jobs')
            .select('id, auto_apply')
            .eq('openai_batch_id', batch_id)
            .limit(1)
            .maybeSingle();

        let batchJob = openAiLookup.data;
        if (!batchJob && isUuid(batch_id)) {
            const legacyLookup = await supabase
                .from('batch_jobs')
                .select('id, auto_apply')
                .eq('id', batch_id)
                .limit(1)
                .maybeSingle();
            batchJob = legacyLookup.data;
        }

        if (batchJob) {
            await supabase
                .from('batch_jobs')
                .update({
                    webhook_received_at: new Date().toISOString(),
                    webhook_payload: body,
                })
                .eq('id', batchJob.id);
        }

        if (status === 'completed' && batchJob?.auto_apply) {
            console.log(`[Consolidation Webhook] Auto-applying results for batch ${batch_id}`);
            const result = await applyResults(batch_id);

            if ('success' in result && !result.success) {
                console.error(`[Consolidation Webhook] Auto-apply failed:`, result.error);
            } else if ('success_count' in result) {
                console.log(
                    `[Consolidation Webhook] Auto-applied: ${result.success_count}/${result.total} successful`
                );
            }
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error('[Consolidation Webhook] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Webhook processing failed' },
            { status: 500 }
        );
    }
}
