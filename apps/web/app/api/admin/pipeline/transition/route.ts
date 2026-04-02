import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { validateTransition } from '@/lib/pipeline/core';
import {
    PERSISTED_PIPELINE_STATUSES,
    type PersistedPipelineStatus,
} from '@/lib/pipeline/types';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import * as z from 'zod';

const transitionSchema = z.object({
    sku: z.string().min(1, 'SKU is required'),
    toStatus: z.enum(PERSISTED_PIPELINE_STATUSES, {
        error: `Invalid toStatus. Must be one of: ${PERSISTED_PIPELINE_STATUSES.join(', ')}`,
    }),
});

type TransitionBody = z.infer<typeof transitionSchema>;

export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json();
        const parsed = transitionSchema.parse(body) as TransitionBody;
        const { sku, toStatus } = parsed;

        const supabase = await createAdminClient();

        // Fetch the product to get current status
        const { data: product, error: fetchError } = await supabase
            .from('products_ingestion')
            .select('sku, pipeline_status')
            .eq('sku', sku)
            .single();

        if (fetchError || !product) {
            return NextResponse.json(
                { error: 'Product not found' },
                { status: 404 }
            );
        }

        const currentStatus = product.pipeline_status as PersistedPipelineStatus;

        // Validate the transition (400 if invalid)
        if (!validateTransition(currentStatus, toStatus)) {
            const allowedTargets = [currentStatus, ...PERSISTED_PIPELINE_STATUSES]
                .filter((status, index, all) => all.indexOf(status) === index)
                .filter((status) => validateTransition(currentStatus, status));

            return NextResponse.json(
                {
                    error: `Invalid transition to '${toStatus}'. Allowed target states: ${allowedTargets
                        .map((status) => `'${status}'`)
                        .join(', ')}`,
                },
                { status: 400 }
            );
        }

        const updatedAt = new Date().toISOString();

        // Update the product status
        const { error: updateError } = await supabase
            .from('products_ingestion')
            .update({
                pipeline_status: toStatus,
                updated_at: updatedAt,
            })
            .eq('sku', sku);

        if (updateError) {
            console.error('Error updating product status:', updateError);
            return NextResponse.json(
                { error: 'Failed to update product status' },
                { status: 500 }
            );
        }

        // Log to pipeline_audit_log
        try {
            const auditPayload = {
                job_type: 'status_transition',
                job_id: crypto.randomUUID(),
                from_state: currentStatus,
                to_state: toStatus,
                actor_id: auth.user.id,
                actor_type: 'user',
                metadata: {
                    sku,
                    timestamp: updatedAt,
                },
            };

            const { error: auditError } = await supabase
                .from('pipeline_audit_log')
                .insert([auditPayload]);

            if (auditError) {
                console.error('Warning: Failed to log transition to audit_log:', auditError);
            }
        } catch (auditErr) {
            console.error('Error logging to audit_log:', auditErr);
        }

        return NextResponse.json({ success: true, updatedAt });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: error.issues[0]?.message || 'Invalid request body' },
                { status: 400 }
            );
        }

        console.error('Error in pipeline transition:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
