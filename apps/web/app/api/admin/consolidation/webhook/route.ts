import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { LLMProvider } from '@/lib/ai-scraping/credentials';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { applyResults, syncPendingParallelRuns } from '@/lib/consolidation';
import { createAdminClient } from '@/lib/supabase/server';

interface ConsolidationNotificationPayload {
    batch_id?: string;
    provider?: LLMProvider;
    status?: string;
    source?: 'manual' | 'internal';
    timestamp?: string;
    auto_apply?: boolean;
    metadata?: Record<string, unknown>;
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function normalizeProvider(value: unknown): LLMProvider | null {
    if (value === 'openai' || value === 'openai_compatible') {
        return value === 'openai_compatible' ? 'openai' : value;
    }

    return null;
}

function parseSignature(headerValue: string | null): string | null {
    if (!headerValue) {
        return null;
    }

    const trimmed = headerValue.trim();
    if (!trimmed) {
        return null;
    }

    return trimmed.startsWith('sha256=') ? trimmed.slice('sha256='.length) : trimmed;
}

function hasValidSignature(bodyText: string, headerValue: string | null): boolean {
    const secret = process.env.CONSOLIDATION_WEBHOOK_SECRET;
    const signature = parseSignature(headerValue);

    if (!secret || !signature) {
        return false;
    }

    const expected = createHmac('sha256', secret).update(bodyText).digest('hex');
    const providedBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    if (providedBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
}

async function authorizeNotification(request: NextRequest, bodyText: string) {
    const signatureHeader =
        request.headers.get('x-consolidation-signature')
        ?? request.headers.get('x-baystate-signature');

    if (hasValidSignature(bodyText, signatureHeader)) {
        return { authorized: true as const, mode: 'signature' as const };
    }

    const adminAuth = await requireAdminAuth();
    if (!adminAuth.authorized) {
        return {
            authorized: false as const,
            response: NextResponse.json(
                {
                    error: 'Unauthorized. Provide an admin session or a valid x-consolidation-signature header.',
                },
                { status: 401 }
            ),
        };
    }

    return { authorized: true as const, mode: 'admin' as const };
}

async function findBatchJob(batchId: string, provider: LLMProvider | null) {
    const supabase = await createAdminClient();
    const select = 'id, provider, auto_apply';

    if (isUuid(batchId)) {
        const { data, error } = await supabase
            .from('batch_jobs')
            .select(select)
            .eq('id', batchId)
            .limit(1)
            .maybeSingle();

        if (error) {
            throw new Error(error.message);
        }

        return data;
    }

    let query = supabase
        .from('batch_jobs')
        .select(select)
        .or(`provider_batch_id.eq.${batchId},openai_batch_id.eq.${batchId}`)
        .limit(1);

    if (provider) {
        query = query.eq('provider', provider);
    }

    const { data, error } = await query.maybeSingle();
    if (error && error.code !== 'PGRST204') {
        throw new Error(error.message);
    }

    return data;
}

/**
 * POST /api/admin/consolidation/webhook
 * Internal/manual notification endpoint for OpenAI consolidation batches.
 *
 * This route accepts either:
 * 1. An authenticated admin request, or
 * 2. An HMAC-signed request using CONSOLIDATION_WEBHOOK_SECRET.
 */
export async function POST(request: NextRequest) {
    try {
        const bodyText = await request.text();
        const authorization = await authorizeNotification(request, bodyText);
        if (!authorization.authorized) {
            return authorization.response;
        }

        let body: ConsolidationNotificationPayload;
        try {
            body = JSON.parse(bodyText) as ConsolidationNotificationPayload;
        } catch {
            return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
        }

        const batchId = typeof body.batch_id === 'string' ? body.batch_id.trim() : '';
        const status = typeof body.status === 'string' ? body.status.trim() : '';
        const provider = normalizeProvider(body.provider);

        if (!batchId) {
            return NextResponse.json({ error: 'batch_id is required' }, { status: 400 });
        }

        const batchJob = await findBatchJob(batchId, provider);
        if (!batchJob) {
            return NextResponse.json({ error: 'Batch job not found' }, { status: 404 });
        }

        const supabase = await createAdminClient();
        await supabase
            .from('batch_jobs')
            .update({
                webhook_received_at: new Date().toISOString(),
                webhook_payload: {
                    ...body,
                    auth_mode: authorization.mode,
                },
            })
            .eq('id', batchJob.id);

        const shouldAutoApply = Boolean(body.auto_apply ?? batchJob.auto_apply);
        if (status === 'completed' && shouldAutoApply) {
            const result = await applyResults(batchId);
            if ('success' in result && !result.success) {
                console.error('[Consolidation Webhook] Auto-apply failed:', result.error);
            }
        }

        if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'expired') {
            await syncPendingParallelRuns(10);
        }

        return NextResponse.json({
            received: true,
            batch_id: batchId,
            provider: provider ?? batchJob.provider ?? 'openai',
            auth_mode: authorization.mode,
        });
    } catch (error) {
        console.error('[Consolidation Webhook] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Webhook processing failed' },
            { status: 500 }
        );
    }
}
