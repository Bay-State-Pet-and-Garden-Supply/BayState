import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.authorized) return auth.response;

  const { id } = await context.params;
  const supabase = await createClient();

  const { data: cohort, error: fetchError } = await supabase
    .from('cohort_batches')
    .select('id, status')
    .eq('id', id)
    .single();

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Cohort not found' },
        { status: 404 }
      );
    }
    console.error('[Cohorts API] Error fetching cohort:', fetchError);
    return NextResponse.json(
      { error: fetchError.message },
      { status: 500 }
    );
  }

  const { error: updateError } = await supabase
    .from('cohort_batches')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (updateError) {
    console.error('[Cohorts API] Error updating cohort status:', updateError);
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }


  return NextResponse.json({
    success: true,
    message: 'Cohort processing started',
    cohortId: id,
    status: 'processing',
  });
}