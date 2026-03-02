import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

interface ActiveJob {
    id: string;
    skuCount: number;
    scrapers: string[];
    status: 'pending' | 'running';
    createdAt: string;
    progress: {
        completed: number;
        total: number;
    };
}

export async function GET() {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const supabase = await createClient();

    const { data: jobs, error } = await supabase
        .from('scrape_jobs')
        .select('id, status, scrapers, created_at, skus')
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[Active Runs] Error fetching jobs:', error);
        return NextResponse.json(
            { error: 'Failed to fetch active jobs' },
            { status: 500 }
        );
    }

    const activeJobs: ActiveJob[] = await Promise.all(
        (jobs || []).map(async (job) => {
            const skuCount = job.skus?.length || 0;

            const { data: chunks } = await supabase
                .from('scrape_job_chunks')
                .select('status')
                .eq('job_id', job.id);

            const totalChunks = chunks?.length || 0;
            const completedChunks = chunks?.filter(
                (c) => c.status === 'completed'
            ).length || 0;

            return {
                id: job.id,
                skuCount,
                scrapers: job.scrapers || [],
                status: job.status,
                createdAt: job.created_at,
                progress: {
                    completed: completedChunks,
                    total: totalChunks,
                },
            };
        })
    );

    return NextResponse.json({ jobs: activeJobs });
}
