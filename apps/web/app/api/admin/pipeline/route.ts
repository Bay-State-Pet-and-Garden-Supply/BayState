import { NextRequest, NextResponse } from 'next/server';
import { bulkUpdateStatus, getProductsByStatus, getSkusByStatus, type PipelineStatus } from '@/lib/pipeline';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const status = (searchParams.get('status') || 'staging') as PipelineStatus;
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '200', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const selectAll = searchParams.get('selectAll') === 'true';
    
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const source = searchParams.get('source') || undefined;
    const minConfidence = searchParams.get('minConfidence') ? parseFloat(searchParams.get('minConfidence')!) : undefined;
    const maxConfidence = searchParams.get('maxConfidence') ? parseFloat(searchParams.get('maxConfidence')!) : undefined;

    if (selectAll) {
        const { skus, count } = await getSkusByStatus(status, {
            search: search || undefined,
            startDate,
            endDate,
            source,
            minConfidence,
            maxConfidence,
        });

        return NextResponse.json({
            skus,
            count,
        });
    }

    const { products, count } = await getProductsByStatus(status, {
        limit,
        offset,
        search: search || undefined,
        startDate,
        endDate,
        source,
        minConfidence,
        maxConfidence,
    });

    return NextResponse.json({ products, count });
}

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

        const result = await bulkUpdateStatus(skus, newStatus);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        return NextResponse.json({ success: true, updatedCount: result.updatedCount, batchId: crypto.randomUUID() });
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
}
