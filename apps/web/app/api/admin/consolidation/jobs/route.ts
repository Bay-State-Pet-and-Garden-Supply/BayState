import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { listBatchJobs, isOpenAIConfigured } from '@/lib/consolidation';

/**
 * GET /api/admin/consolidation/jobs
 * List recent provider-neutral batch jobs.
 * Excludes product_line_classification (grouping) jobs — those are shown
 * through the grouping API instead.
 */
export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    if (!(await isOpenAIConfigured())) {
        return NextResponse.json(
            { error: 'No configured LLM batch provider is available' },
            { status: 503 }
        );
    }

    try {
        const jobs = await listBatchJobs(50);

        if ('success' in jobs && !jobs.success) {
            return NextResponse.json({ error: jobs.error }, { status: 500 });
        }

        // Filter out grouping (product_line_classification) jobs
        const filtered = (Array.isArray(jobs) ? jobs : []).filter(
            (job) => job.execution_mode !== 'product_line_classification'
        );

        return NextResponse.json({ jobs: filtered.slice(0, 20) });
    } catch (error) {
        console.error('[Consolidation API] List jobs error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to list jobs' },
            { status: 500 }
        );
    }
}
