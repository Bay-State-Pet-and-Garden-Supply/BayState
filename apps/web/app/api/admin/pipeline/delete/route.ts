import { NextRequest, NextResponse } from 'next/server';
import { bulkDeleteProducts } from '@/lib/pipeline';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export async function POST(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    try {
        const body = await request.json();
        const { skus } = body as { skus: string[] };

        if (!skus || !Array.isArray(skus) || skus.length === 0) {
            return NextResponse.json(
                { error: 'SKUs array is required and must not be empty' },
                { status: 400 }
            );
        }

        // Get user ID from auth context if available
        const userId = auth.user?.id;

        const result = await bulkDeleteProducts(skus, userId);

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || 'Failed to delete products' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            deletedCount: result.deletedCount,
            batchId: crypto.randomUUID(),
        });
    } catch {
        return NextResponse.json(
            { error: 'Invalid request body' },
            { status: 400 }
        );
    }
}
