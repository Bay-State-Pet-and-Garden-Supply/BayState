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

interface TimelineStep {
  id: string;
  step_index: number;
  action_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  extracted_data: Record<string, unknown>;
}

/**
 * GET /api/admin/scrapers/studio/test/[id]/timeline
 * 
 * Gets the step timeline for a test run.
 * Returns steps ordered by step_index with timing and status information.
 * 
 * Response:
 * {
 *   test_run_id: string;
 *   steps: TimelineStep[];
 *   total_steps: number;
 *   completed_steps: number;
 *   failed_steps: number;
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const adminClient = getSupabaseAdmin();

    // Verify test run exists
    const { data: testRun, error: testRunError } = await adminClient
      .from('scraper_test_runs')
      .select('id')
      .eq('id', id)
      .single();

    if (testRunError || !testRun) {
      return NextResponse.json(
        { error: 'Test run not found' },
        { status: 404 }
      );
    }

    // Fetch steps for this test run
    const { data: steps, error: stepsError } = await adminClient
      .from('scraper_test_run_steps')
      .select('*')
      .eq('test_run_id', id)
      .order('step_index', { ascending: true });

    if (stepsError) {
      console.error('[Studio Timeline API] Error fetching steps:', stepsError);
      return NextResponse.json(
        { error: 'Failed to fetch step timeline' },
        { status: 500 }
      );
    }

    const typedSteps: TimelineStep[] = (steps || []).map((step) => ({
      id: step.id,
      step_index: step.step_index,
      action_type: step.action_type,
      status: step.status as TimelineStep['status'],
      started_at: step.started_at,
      completed_at: step.completed_at,
      duration_ms: step.duration_ms,
      error_message: step.error_message,
      extracted_data: step.extracted_data || {},
    }));

    const totalSteps = typedSteps.length;
    const completedSteps = typedSteps.filter((s) => s.status === 'completed').length;
    const failedSteps = typedSteps.filter((s) => s.status === 'failed').length;
    const runningSteps = typedSteps.filter((s) => s.status === 'running').length;

    return NextResponse.json({
      test_run_id: id,
      steps: typedSteps,
      total_steps: totalSteps,
      completed_steps: completedSteps,
      failed_steps: failedSteps,
      running_steps: runningSteps,
      pending_steps: totalSteps - completedSteps - failedSteps - runningSteps,
    });

  } catch (error) {
    console.error('[Studio Timeline API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
