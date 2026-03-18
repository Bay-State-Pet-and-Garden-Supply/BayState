import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
    toLegacyPipelineStatus,
    toNewPipelineStatus,
    validateStatusTransition,
    type NewPipelineStatus,
} from '@/lib/pipeline';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import * as z from 'zod';

const transitionStatuses = ['registered', 'enriched', 'finalized'] as const;

const transitionSchema = z.object({
    sku: z.string().min(1, 'SKU is required'),
    fromStatus: z.enum(transitionStatuses, { error: 'Invalid fromStatus. Must be registered, enriched, or finalized' }),
    toStatus: z.enum(transitionStatuses, { error: 'Invalid toStatus. Must be registered, enriched, or finalized' }),
});

type TransitionBody = z.infer<typeof transitionSchema>;

export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json();
        const parsed = transitionSchema.parse(body) as TransitionBody;
        const { sku, fromStatus, toStatus } = parsed;

        const supabase = await createClient();

        // Fetch the product to verify current status
        const { data: product, error: fetchError } = await supabase
            .from('products_ingestion')
            .select('sku, pipeline_status, pipeline_status_new')
            .eq('sku', sku)
            .single();

        if (fetchError || !product) {
            return NextResponse.json(
                { error: 'Product not found' },
                { status: 404 }
            );
        }

        const currentStatus =
            (product.pipeline_status_new as NewPipelineStatus | null)
            ?? toNewPipelineStatus(product.pipeline_status);

        // Verify current status matches fromStatus (409 if mismatch)
        if (currentStatus !== fromStatus) {
            return NextResponse.json(
                {
                    error: `Status mismatch. Current status is '${currentStatus || 'null'}', but expected '${fromStatus}'`,
                },
                { status: 409 }
            );
        }

        // Validate the transition (400 if invalid)
        if (!validateStatusTransition(fromStatus, toStatus)) {
            return NextResponse.json(
                {
                    error: `Invalid transition from '${fromStatus}' to '${toStatus}'`,
                },
                { status: 400 }
            );
        }

        // Update the product status
        const { data: updatedProduct, error: updateError } = await supabase
            .from('products_ingestion')
            .update({
                pipeline_status: toLegacyPipelineStatus(toStatus),
                pipeline_status_new: toStatus,
                updated_at: new Date().toISOString(),
            })
            .eq('sku', sku)
            .select()
            .single();

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
                from_state: fromStatus,
                to_state: toStatus,
                actor_id: auth.user.id,
                actor_type: 'user',
                metadata: {
                    sku,
                    timestamp: new Date().toISOString(),
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

        return NextResponse.json({ success: true, product: updatedProduct });
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
