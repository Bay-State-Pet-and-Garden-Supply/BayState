import { NextRequest, NextResponse } from 'next/server';
import { bulkUpdateStatus, type PipelineStatus } from '@/lib/pipeline';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json();
        const { skus, newStatus } = body as { skus: string[]; newStatus: PipelineStatus };

        if (!skus || !Array.isArray(skus) || skus.length === 0) {
            return NextResponse.json({ error: 'SKUs array is required' }, { status: 400 });
        }

        if (!newStatus) {
            return NextResponse.json({ error: 'New status is required' }, { status: 400 });
        }

        const result = await bulkUpdateStatus(skus, newStatus, auth.user.id);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({ success: true, updatedCount: result.updatedCount });
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}
