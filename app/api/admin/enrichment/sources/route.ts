import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAllSources } from '@/lib/enrichment/sources';

/**
 * GET /api/admin/enrichment/sources
 * 
 * Fetches all available enrichment sources (scrapers + B2B feeds).
 * Used by batch enhancement to show source selection without a specific SKU.
 */
export async function GET() {
    const supabase = await createClient();

    // Verify user is admin/staff
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || !['admin', 'staff'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const allSources = await getAllSources();

        // Transform sources for the UI
        const sources = allSources.map((source) => ({
            id: source.id,
            displayName: source.displayName,
            type: source.type,
            status: source.status,
            enabled: source.enabled,
            requiresAuth: source.requiresAuth,
        }));

        return NextResponse.json({
            sources,
        });
    } catch (error) {
        console.error('[Enrichment API] Error fetching sources:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
