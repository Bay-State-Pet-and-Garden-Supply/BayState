import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

interface ActiveJob {
    id: string;
    skuCount: number;
    scrapers: string[];
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
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
        .from('scrape_jobs')
        .select('id, status, created_at, scrapers, skus')
        .or(`status.in.(pending,running),and(status.in.(completed,failed),created_at.gt.${last24Hours})`)
        .order('created_at', { ascending: false })
        .limit(20);

    if (jobsError) {
        console.error('[Active Runs] Failed to fetch jobs:', jobsError);
        return NextResponse.json({ error: 'Failed to fetch active jobs' }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
        return NextResponse.json({ jobs: [] });
    }

    const jobIds = jobs.map((j) => j.id);

    const { data: chunks, error: chunksError } = await supabase
        .from('scrape_job_chunks')
        .select('job_id, status')
        .in('job_id', jobIds);

    if (chunksError) {
        console.error('[Active Runs] Failed to fetch chunks:', chunksError);
        return NextResponse.json({ error: 'Failed to fetch job progress' }, { status: 500 });
    }

    const chunksByJob = new Map<string, { completed: number; total: number }>();

    for (const chunk of chunks || []) {
        const current = chunksByJob.get(chunk.job_id) || { completed: 0, total: 0 };
        current.total += 1;
        if (chunk.status === 'completed') {
            current.completed += 1;
        }
        chunksByJob.set(chunk.job_id, current);
    }

    const response: ActiveJob[] = jobs.map((job) => {
        const chunkProgress = chunksByJob.get(job.id) || { completed: 0, total: 0 };
        const progress = chunkProgress.total > 0
            ? Math.round((chunkProgress.completed / chunkProgress.total) * 100)
            : 0;

        return {
            id: job.id,
            skuCount: Array.isArray(job.skus) ? job.skus.length : 0,
            scrapers: job.scrapers || [],
            status: job.status,
            createdAt: job.created_at,
            progress,
        };
    });

    return NextResponse.json({ jobs: response });
}
