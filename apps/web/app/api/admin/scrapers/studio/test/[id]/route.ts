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

/**
 * GET /api/admin/scrapers/studio/test/[id]
 * 
 * Gets the status and results of a test run.
 * 
 * Response:
 * {
 *   id: string;
 *   status: 'pending' | 'running' | 'completed' | 'failed';
 *   config_id: string;
 *   version_id: string;
 *   started_at: string;
 *   completed_at?: string;
 *   duration_ms?: number;
 *   sku_results: [...];
 *   summary: { passed: number; failed: number; total: number };
 *   job_id?: string;
 *   metadata?: object;
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

    // Fetch the test run with related data
    const { data: testRun, error: testRunError } = await adminClient
      .from('scraper_test_runs')
      .select('*')
      .eq('id', id)
      .single();

    if (testRunError || !testRun) {
      return NextResponse.json(
        { error: 'Test run not found' },
        { status: 404 }
      );
    }

    // Calculate summary from results
    const summary = { passed: 0, failed: 0, total: 0 };
    if (testRun.results && Array.isArray(testRun.results)) {
      summary.total = testRun.results.length;
      summary.passed = testRun.results.filter((r: { status: string }) => 
        r.status === 'success' || r.status === 'completed'
      ).length;
      summary.failed = testRun.results.filter((r: { status: string }) => 
        r.status === 'failed' || r.status === 'error'
      ).length;
    }

    // Calculate duration if completed
    let duration_ms: number | undefined;
    if (testRun.started_at && testRun.completed_at) {
      duration_ms = new Date(testRun.completed_at).getTime() - 
                    new Date(testRun.started_at).getTime();
    }

    const metadata = (testRun.metadata as Record<string, unknown>) || {};

    // Fetch related job status if job_id exists in metadata
    let jobStatus: string | undefined;
    let jobId = typeof metadata.job_id === 'string' ? metadata.job_id : undefined;

    if (!jobId) {
      const { data: linkedJob } = await adminClient
        .from('scrape_jobs')
        .select('id')
        .contains('metadata', { test_run_id: id })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (linkedJob?.id) {
        jobId = linkedJob.id;
        metadata.job_id = linkedJob.id;
      }
    }

    if (jobId) {
      const { data: job } = await adminClient
        .from('scrape_jobs')
        .select('status')
        .eq('id', jobId)
        .single();
      jobStatus = job?.status;
    }

    return NextResponse.json({
      id: testRun.id,
      status: testRun.status,
      config_id: testRun.metadata?.config_id,
      version_id: testRun.metadata?.version_id,
      started_at: testRun.started_at,
      completed_at: testRun.completed_at,
      duration_ms,
      sku_results: testRun.results || [],
      summary,
      job_id: jobId,
      job_status: jobStatus,
      metadata,
      scraper_id: testRun.scraper_id,
      test_type: testRun.test_type,
      skus_tested: testRun.skus_tested,
    });

  } catch (error) {
    console.error('[Studio Test Status API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
