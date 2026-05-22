import { NextRequest, NextResponse } from 'next/server';
import { clearEnrichmentResultsAndResetStatus } from '@/lib/pipeline';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json();
        const { upcs } = body as { upcs: string[] };

        if (!upcs || !Array.isArray(upcs) || upcs.length === 0) {
            return NextResponse.json({ error: 'UPCs array is required' }, { status: 400 });
        }

        const result = await clearEnrichmentResultsAndResetStatus(upcs, auth.user.id);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({ success: true, updatedCount: result.updatedCount });
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}
