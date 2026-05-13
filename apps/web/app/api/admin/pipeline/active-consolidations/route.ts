import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

interface ActiveConsolidationJobItemActivity {
    sku: string;
    status: string;
    error_message?: string | null;
    updated_at?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
    created_at?: string | null;
}

interface ActiveConsolidationJob {
    id: string;
    status: string;
    execution_mode?: string;
    provider?: string | null;
    provider_batch_id?: string | null;
    pendingCount?: number;
    runningCount?: number;
    recentItems?: ActiveConsolidationJobItemActivity[];
    description: string | null;
    totalProducts: number;
    processedCount: number;
    successCount: number;
    errorCount: number;
    createdAt: string;
    progress: number;
    metadata: Record<string, unknown> | null;
}

export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) {
        return auth.response;
    }

    const supabase = await createAdminClient();
    const last24Hours = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: jobs, error: jobsError } = await supabase
        .from('batch_jobs')
        .select('id, provider, provider_batch_id, status, execution_mode, description, created_at, total_requests, completed_requests, failed_requests, metadata')
        .or(`status.not.in.(completed,failed,expired,cancelled),and(status.in.(completed,failed,expired,cancelled),created_at.gt.${last24Hours})`)
        .order('created_at', { ascending: false })
        .limit(15);

    if (jobsError) {
        console.error('[Active Consolidations] Failed to fetch jobs:', jobsError);
        return NextResponse.json({ error: 'Failed to fetch active consolidations' }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
        return NextResponse.json({ jobs: [] });
    }

    const jobIds = jobs.map((job) => job.id);
    const itemsByJob = new Map<string, ActiveConsolidationJobItemActivity[]>();
    const queueCountsByJob = new Map<string, { pending: number; running: number }>();

    try {
        const itemQuery = supabase
            .from('batch_job_items')
            .select('batch_job_id, sku, status, error_message, updated_at, started_at, completed_at, created_at');

        if ('in' in itemQuery && typeof itemQuery.in === 'function') {
            const { data: itemRows } = await itemQuery
                .in('batch_job_id', jobIds)
                .order('updated_at', { ascending: false })
                .limit(75);

            for (const row of itemRows || []) {
                const batchJobId = row.batch_job_id as string;
                const counts = queueCountsByJob.get(batchJobId) || { pending: 0, running: 0 };
                if (row.status === 'pending') counts.pending += 1;
                if (row.status === 'running') counts.running += 1;
                queueCountsByJob.set(batchJobId, counts);

                const list = itemsByJob.get(batchJobId) || [];
                if (list.length < 6) {
                    list.push({
                        sku: row.sku,
                        status: row.status,
                        error_message: row.error_message,
                        updated_at: row.updated_at,
                        started_at: row.started_at,
                        completed_at: row.completed_at,
                        created_at: row.created_at,
                    });
                    itemsByJob.set(batchJobId, list);
                }
            }
        }
    } catch (itemError) {
        console.warn('[Active Consolidations] Failed to fetch queue item activity:', itemError);
    }

    const response: ActiveConsolidationJob[] = jobs.map((job) => {
        const total = job.total_requests || 0;
        const completed = job.completed_requests || 0;
        const failed = job.failed_requests || 0;
        const processedCount = completed + failed;
        const progress = total > 0 ? Math.round((processedCount / total) * 100) : 0;

        const queueCounts = queueCountsByJob.get(job.id);

        return {
            id: job.id,
            status: job.status,
            execution_mode: job.execution_mode || 'direct_chat_chunks',
            ...(job.provider ? { provider: job.provider } : {}),
            ...(job.provider_batch_id ? { provider_batch_id: job.provider_batch_id } : {}),
            ...(queueCounts ? { pendingCount: queueCounts.pending, runningCount: queueCounts.running } : {}),
            ...(itemsByJob.has(job.id) ? { recentItems: itemsByJob.get(job.id) } : {}),
            description: job.description,
            totalProducts: total,
            processedCount,
            successCount: completed,
            errorCount: failed,
            createdAt: job.created_at,
            progress,
            metadata: job.metadata,
        };
    });

    return NextResponse.json({ jobs: response });
}
