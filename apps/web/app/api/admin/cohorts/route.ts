import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const supabase = await createClient();

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const offset = (page - 1) * limit;
  const status = searchParams.get('status');

  let query = supabase
    .from('cohort_batches')
    .select('*, brands(id, name, slug, logo_url, website_url, official_domains, preferred_domains)', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const {
    data: cohorts,
    error,
    count,
  } = await query.range(offset, offset + limit - 1);

  if (error) {
    console.error('[Cohorts API] Error fetching cohorts:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  const total = count || 0;

  return NextResponse.json({
    cohorts: cohorts || [],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
