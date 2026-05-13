import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';
import { getAllSources } from '@/lib/enrichment/sources';

export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth(request);
    if (!auth.authorized) return auth.response;

    try {
        const allSources = await getAllSources();

        const sources = allSources.map((source) => ({
            id: source.id,
            displayName: source.displayName,
            type: source.type,
            status: source.status,
            enabled: source.enabled,
            requiresAuth: source.requiresAuth,
        }));

        return NextResponse.json({ sources });
    } catch (error) {
        console.error('[Enrichment API] Error fetching sources:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
