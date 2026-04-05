import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { getGeminiMigrationMonitoring } from '@/lib/consolidation/monitoring';

export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) {
        return auth.response;
    }

    const days = Number.parseInt(request.nextUrl.searchParams.get('days') ?? '30', 10);

    try {
        const data = await getGeminiMigrationMonitoring(
            Number.isFinite(days) && days > 0 ? days : 30
        );
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json(
            {
                error: error instanceof Error
                    ? error.message
                    : 'Failed to load Gemini migration monitoring data',
            },
            { status: 500 }
        );
    }
}
