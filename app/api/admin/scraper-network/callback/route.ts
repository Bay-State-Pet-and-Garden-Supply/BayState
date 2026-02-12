import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

interface CallbackPayload {
  job_id: string;
  status: 'success' | 'partial' | 'failed' | 'timeout';
  results: Array<{
    sku: string;
    status: 'success' | 'no_results' | 'error' | 'timeout';
    data?: Record<string, unknown>;
    error_message?: string;
    duration_ms?: number;
  }>;
  error_message?: string;
  duration_ms?: number;
  runner_id?: string;
  // Step events for test-lab visibility
  steps?: Array<{
    step_index: number;
    action_type: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    started_at?: string;
    completed_at?: string;
    duration_ms?: number;
    error_message?: string;
    extracted_data?: Record<string, unknown>;
  }>;
  // Detailed results for Supabase Realtime
  selectors?: Array<{
    sku: string;
    selector_name: string;
    selector_value: string;
    status: 'FOUND' | 'MISSING' | 'ERROR' | 'SKIPPED';
    error_message?: string;
    duration_ms?: number;
  }>;
  login?: {
    sku: string;
    username_field_status?: string;
    password_field_status?: string;
    submit_button_status?: string;
    success_indicator_status?: string;
    overall_status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'ERROR';
    error_message?: string;
    duration_ms?: number;
  }[];
  extractions?: Array<{
    sku: string;
    field_name: string;
    field_value?: string;
    status: 'SUCCESS' | 'EMPTY' | 'ERROR' | 'NOT_FOUND';
    error_message?: string;
    duration_ms?: number;
  }>;
}

async function validateApiKey(request: NextRequest): Promise<{ valid: boolean; runnerId?: string }> {
  const apiKey = request.headers.get('X-API-Key');
  
  if (!apiKey || !apiKey.startsWith('bsr_')) {
    return { valid: false };
  }

  const supabase = await createClient();
  
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  
  const { data: runner, error } = await supabase
    .from('scraper_runners')
    .select('id, status')
    .eq('api_key_hash', keyHash)
    .single();

  if (error || !runner) {
    return { valid: false };
  }

  if (runner.status === 'revoked') {
    return { valid: false };
  }

  return { valid: true, runnerId: runner.id };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'Invalid or missing API key' },
        { status: 401 }
      );
    }

    const supabase = await createClient();
    const body: CallbackPayload = await request.json();

    const { job_id, status, results, error_message, duration_ms } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: 'job_id is required' },
        { status: 400 }
      );
    }

    const { data: testRun, error: fetchError } = await supabase
      .from('scraper_test_runs')
      .select('*')
      .eq('id', job_id)
      .single();

    if (fetchError || !testRun) {
      return NextResponse.json(
        { error: 'Test run not found' },
        { status: 404 }
      );
    }

    let finalStatus: 'passed' | 'failed' | 'partial' = 'failed';
    
    if (status === 'success') {
      const allSuccess = results.every(r => r.status === 'success' || r.status === 'no_results');
      finalStatus = allSuccess ? 'passed' : 'partial';
    } else if (status === 'partial') {
      finalStatus = 'partial';
    }

    const { error: updateError } = await supabase
      .from('scraper_test_runs')
      .update({
        status: finalStatus,
        results,
        error_message,
        duration_ms,
        completed_at: new Date().toISOString(),
        runner_id: auth.runnerId,
      })
      .eq('id', job_id);

    if (updateError) {
      console.error('[Callback] Failed to update test run:', updateError);
      return NextResponse.json(
        { error: 'Failed to update test run' },
        { status: 500 }
      );
    }

    // INSERT individual results to enable Supabase Realtime
    await insertDetailedResults(supabase, job_id, testRun.scraper_id, body);

    await updateScraperHealth(supabase, testRun.scraper_id);

    if (auth.runnerId) {
      await supabase
        .from('scraper_runners')
        .update({
          last_seen_at: new Date().toISOString(),
          status: 'online',
        })
        .eq('id', auth.runnerId);
    }

    return NextResponse.json({
      success: true,
      message: 'Results recorded',
      test_run_id: job_id,
      final_status: finalStatus,
    });

  } catch (error) {
    console.error('[Callback] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function insertDetailedResults(
  supabase: Awaited<ReturnType<typeof createClient>>,
  testRunId: string,
  scraperId: string,
  payload: CallbackPayload
) {
  // Insert step events for test-lab visibility
  if (payload.steps && payload.steps.length > 0) {
    const stepRows = payload.steps.map((s) => ({
      test_run_id: testRunId,
      step_index: s.step_index,
      action_type: s.action_type,
      status: s.status,
      started_at: s.started_at || null,
      completed_at: s.completed_at || null,
      duration_ms: s.duration_ms || null,
      error_message: s.error_message || null,
      extracted_data: s.extracted_data || {},
    }));

    const { error: stepError } = await supabase
      .from('scraper_test_run_steps')
      .upsert(stepRows, { onConflict: 'test_run_id,step_index' });

    if (stepError) {
      console.error('[Callback] Failed to insert step events:', stepError);
    }
  }

  // Insert selector results
  if (payload.selectors && payload.selectors.length > 0) {
    const selectorRows = payload.selectors.map((s) => ({
      test_run_id: testRunId,
      scraper_id: scraperId,
      sku: s.sku,
      selector_name: s.selector_name,
      selector_value: s.selector_value,
      status: s.status,
      error_message: s.error_message,
      duration_ms: s.duration_ms,
    }));

    const { error: selectorError } = await supabase
      .from('scraper_selector_results')
      .insert(selectorRows);

    if (selectorError) {
      console.error('[Callback] Failed to insert selector results:', selectorError);
    }
  }

  // Insert login results
  if (payload.login && payload.login.length > 0) {
    const loginRows = payload.login.map((l) => ({
      test_run_id: testRunId,
      scraper_id: scraperId,
      sku: l.sku,
      username_field_status: l.username_field_status,
      password_field_status: l.password_field_status,
      submit_button_status: l.submit_button_status,
      success_indicator_status: l.success_indicator_status,
      overall_status: l.overall_status,
      error_message: l.error_message,
      duration_ms: l.duration_ms,
    }));

    const { error: loginError } = await supabase
      .from('scraper_login_results')
      .insert(loginRows);

    if (loginError) {
      console.error('[Callback] Failed to insert login results:', loginError);
    }
  }

  // Insert extraction results
  if (payload.extractions && payload.extractions.length > 0) {
    const extractionRows = payload.extractions.map((e) => ({
      test_run_id: testRunId,
      scraper_id: scraperId,
      sku: e.sku,
      field_name: e.field_name,
      field_value: e.field_value,
      status: e.status,
      error_message: e.error_message,
      duration_ms: e.duration_ms,
    }));

    const { error: extractionError } = await supabase
      .from('scraper_extraction_results')
      .insert(extractionRows);

    if (extractionError) {
      console.error('[Callback] Failed to insert extraction results:', extractionError);
    }
  }
}

async function updateScraperHealth(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scraperId: string
) {
  const { data: recentTests } = await supabase
    .from('scraper_test_runs')
    .select('status')
    .eq('scraper_id', scraperId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!recentTests || recentTests.length === 0) return;

  const passedCount = recentTests.filter(t => t.status === 'passed').length;
  const partialCount = recentTests.filter(t => t.status === 'partial').length;
  
  const healthScore = Math.round(
    ((passedCount + partialCount * 0.5) / recentTests.length) * 100
  );

  let healthStatus: 'healthy' | 'degraded' | 'broken' | 'unknown' = 'unknown';
  if (healthScore >= 80) healthStatus = 'healthy';
  else if (healthScore >= 50) healthStatus = 'degraded';
  else if (healthScore > 0) healthStatus = 'broken';

  await supabase
    .from('scrapers')
    .update({
      health_score: healthScore,
      health_status: healthStatus,
      last_test_at: new Date().toISOString(),
    })
    .eq('id', scraperId);
}
