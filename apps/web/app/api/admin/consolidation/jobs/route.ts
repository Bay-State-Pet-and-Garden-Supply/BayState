import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { listBatchJobs, isOpenAIConfigured } from '@/lib/consolidation';

/**
 * GET /api/admin/consolidation/jobs
 * List recent batch jobs.
 */
export async function GET() {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    if (!isOpenAIConfigured()) {
        return NextResponse.json(
            { error: 'OpenAI API key not configured' },
            { status: 503 }
        );
    }

    try {
        const jobs = await listBatchJobs(20);

        if ('success' in jobs && !jobs.success) {
            return NextResponse.json({ error: jobs.error }, { status: 500 });
        }

        return NextResponse.json({ jobs });
    } catch (error) {
        console.error('[Consolidation API] List jobs error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to list jobs' },
            { status: 500 }
        );
    }
}
