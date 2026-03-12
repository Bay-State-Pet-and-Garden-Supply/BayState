import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }
  return createSupabaseClient(url, key);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: testRunId, stepId } = await params;
    const adminClient = getSupabaseAdmin();

    const { data: step, error: stepError } = await adminClient
      .from('scraper_test_run_steps')
      .select('*, test_run:scraper_test_runs!inner(scraper_id, status)')
      .eq('id', stepId)
      .eq('test_run_id', testRunId)
      .single();

    if (stepError || !step) {
      return NextResponse.json(
        { error: 'Step not found' },
        { status: 404 }
      );
    }

    if (step.status !== 'failed') {
      return NextResponse.json(
        { error: 'Only failed steps can be retried' },
        { status: 400 }
      );
    }

    const { error: updateError } = await adminClient
      .from('scraper_test_run_steps')
      .update({
        status: 'pending',
        started_at: null,
        completed_at: null,
        duration_ms: null,
        error_message: null,
        extracted_data: {},
      })
      .eq('id', stepId);

    if (updateError) {
      console.error('[Studio Step Retry API] Error updating step:', updateError);
      return NextResponse.json(
        { error: 'Failed to reset step for retry' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Step reset for retry',
      step_id: stepId,
      test_run_id: testRunId,
    });

  } catch (error) {
    console.error('[Studio Step Retry API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
