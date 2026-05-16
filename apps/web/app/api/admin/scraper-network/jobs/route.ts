import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const auth = await requireAdminAuth(request);
        if (!auth.authorized) return auth.response;

        const { searchParams } = new URL(request.url);
        const runnerId = searchParams.get('runner_id');
        const limit = parseInt(searchParams.get('limit') || '25');
        const offset = parseInt(searchParams.get('offset') || '0');
        const status = searchParams.get('status');
        const scraper = searchParams.get('scraper');

        const supabase = await createAdminClient();

        let query = supabase
            .from('enrichment_jobs')
            .select('*', { count: 'exact' });

        if (runnerId) {
            query = query.eq('claimed_by', runnerId);
        }

        if (status && status !== 'all') {
            query = query.eq('status', status);
        }

        if (scraper) {
            // In the new architecture, scrapers is an array or part of config. 
            // Filtering by scraper name might be complex depending on schema.
            // For now, we'll assume it's in the 'scrapers' array if it exists.
            query = query.contains('scrapers', [scraper]);
        }

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            console.error('[Jobs API] Error:', error);
            return NextResponse.json({ jobs: [], total: 0 }, { status: 500 });
        }

        return NextResponse.json({ 
            jobs: data || [],
            total: count || 0
        });
    } catch (error) {
        console.error('[Jobs API] Error:', error);
        return NextResponse.json({ jobs: [], total: 0 }, { status: 500 });
    }
}
