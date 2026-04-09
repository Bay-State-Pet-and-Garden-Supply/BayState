import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const { id } = await context.params;
  const supabase = await createClient();

  const { data: cohort, error } = await supabase
    .from('cohort_batches')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Cohort not found' },
        { status: 404 }
      );
    }
    console.error('[Cohorts API] Error fetching cohort:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ cohort });
}