import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { getBatchStatus, processBatchQueue } from '@/lib/consolidation/batch-service';
import type { BatchStatus } from '@/lib/consolidation/types';

function isBatchStatus(value: unknown): value is BatchStatus {
    return typeof value === 'object' && value !== null && 'is_complete' in value;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ batchId: string }> }
) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    const { batchId } = await params;

    try {
        // Process a small chunk to advance the queue
        await processBatchQueue(batchId, { limit: 5 }).catch(() => {});

        const status = await getBatchStatus(batchId);

        if ('success' in status && !status.success) {
            return NextResponse.json({ error: status.error }, { status: 404 });
        }

        if (!isBatchStatus(status)) {
            return NextResponse.json({ error: 'Unexpected status format' }, { status: 500 });
        }

        // Return group-friendly progress: aggregate status with completion info
        return NextResponse.json({
            batch_id: batchId,
            is_complete: status.is_complete,
            is_failed: status.is_failed,
            is_processing: status.is_processing,
            total_requests: status.total_requests,
            completed_requests: status.completed_requests,
            failed_requests: status.failed_requests,
            progress_percent: status.progress_percent,
            status: status.status,
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to get consolidation progress' },
            { status: 500 }
        );
    }
}
