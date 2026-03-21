import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

interface ActiveConsolidationJob {
    id: string;
    status: string;
    totalProducts: number;
    processedCount: number;
    successCount: number;
    errorCount: number;
    createdAt: string;
    progress: number;
}

export async function GET() {
    const auth = await requireAdminAuth();
    if (!auth.authorized) {
        return auth.response;
    }

    const supabase = await createClient();
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: jobs, error: jobsError } = await supabase
        .from('batch_jobs')
        .select('id, status, created_at, total_requests, completed_requests, failed_requests')
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

    const response: ActiveConsolidationJob[] = jobs.map((job) => {
        const total = job.total_requests || 0;
        const completed = job.completed_requests || 0;
        const failed = job.failed_requests || 0;
        const processedCount = completed + failed;
        const progress = total > 0 ? Math.round((processedCount / total) * 100) : 0;

        return {
            id: job.id,
            status: job.status,
            totalProducts: total,
            processedCount,
            successCount: completed,
            errorCount: failed,
            createdAt: job.created_at,
            progress,
        };
    });

    return NextResponse.json({ jobs: response });
}
