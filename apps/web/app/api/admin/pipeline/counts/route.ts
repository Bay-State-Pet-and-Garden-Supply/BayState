import { NextRequest, NextResponse } from 'next/server';
import { getStatusCounts } from '@/lib/pipeline';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    try {
        const counts = await getStatusCounts();
        return NextResponse.json({ counts });
    } catch (err) {
        console.error('Exception in status counts route:', err);
        return NextResponse.json({ 
            error: err instanceof Error ? err.message : 'Internal Server Error' 
        }, { status: 500 });
    }
}
