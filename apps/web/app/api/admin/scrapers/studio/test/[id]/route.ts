import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/lib/supabase/config';
import { NextRequest, NextResponse } from 'next/server';
import { checkJobTimeout } from '@/lib/scraper-callback/test-job-utils';

function getSupabaseAdmin(): SupabaseClient {
  const url = SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }
  return createSupabaseClient(url, key);
}

/**
 * GET /api/admin/scrapers/studio/test/[id]
 *
 * Gets the status and results of a test job.
 * Reads from scrape_jobs (unified architecture) instead of scraper_test_runs.
 *
 * Response:
 * {
 *   id: string;
 *   status: 'pending' | 'running' | 'completed' | 'failed';
 *   test_status?: 'passed' | 'failed' | 'partial';
 *   config_id: string;
 *   version_id: string;
 *   started_at: string;
 *   completed_at?: string;
 *   duration_ms?: number;
 *   sku_results: [...];
 *   summary: { passed: number; failed: number; total: number };
 *   timeout_at?: string;
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

    // Fetch the test job directly from scrape_jobs
    const { data: job, error: jobError } = await adminClient
      .from('scrape_jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Test job not found' },
        { status: 404 }
      );
    }

    // Check for timeout if still active
    if ((job.status === 'pending' || job.status === 'running') && job.timeout_at) {
      const timedOut = await checkJobTimeout(adminClient, id);
      if (timedOut) {
        // Re-fetch the updated job
        const { data: updatedJob } = await adminClient
          .from('scrape_jobs')
          .select('*')
          .eq('id', id)
          .single();

        if (updatedJob) {
          return buildResponse(updatedJob, adminClient);
        }
      }
    }

    return buildResponse(job, adminClient);

  } catch (error) {
    console.error('[Studio Test Status API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function buildResponse(
  job: Record<string, unknown>,
  adminClient: SupabaseClient,
) {
  const testMetadata = (job.test_metadata as Record<string, unknown>) || {};
  const metadata = (job.metadata as Record<string, unknown>) || {};
  const summary = (testMetadata.summary as Record<string, unknown>) || null;
  const skuResults = (testMetadata.sku_results as Array<Record<string, unknown>>) || [];

  // Calculate summary from test_metadata or chunk data
  const responseSummary = { passed: 0, failed: 0, total: 0 };

  if (summary) {
    responseSummary.passed = (summary.passed_count as number) || 0;
    responseSummary.failed = (summary.failed_count as number) || 0;
    responseSummary.total = (summary.total_skus as number) || 0;
  } else if (job.status === 'completed' || job.status === 'failed') {
    // Fallback: compute from chunk data
    const { data: chunks } = await adminClient
      .from('scrape_job_chunks')
      .select('skus_successful, skus_failed')
      .eq('job_id', job.id as string);

    if (chunks) {
      responseSummary.passed = chunks.reduce((s: number, c: { skus_successful?: number }) => s + (c.skus_successful || 0), 0);
      responseSummary.failed = chunks.reduce((s: number, c: { skus_failed?: number }) => s + (c.skus_failed || 0), 0);
      responseSummary.total = responseSummary.passed + responseSummary.failed;
    }
  }

  // Calculate duration
  let duration_ms: number | undefined;
  if (summary?.duration_ms) {
    duration_ms = summary.duration_ms as number;
  } else if (job.created_at && job.completed_at) {
    duration_ms = new Date(job.completed_at as string).getTime() -
                  new Date(job.created_at as string).getTime();
  }

  // Derive test_status from summary or job status
  let testStatus: string | undefined;
  if (summary?.test_status) {
    testStatus = summary.test_status as string;
  } else if (job.status === 'completed') {
    testStatus = responseSummary.failed === 0 ? 'passed' : responseSummary.passed > 0 ? 'partial' : 'failed';
  } else if (job.status === 'failed') {
    testStatus = 'failed';
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    test_status: testStatus,
    config_id: testMetadata.config_id || metadata.config_id,
    version_id: testMetadata.version_id || metadata.version_id,
    started_at: job.created_at,
    completed_at: job.completed_at || null,
    duration_ms,
    sku_results: skuResults,
    summary: responseSummary,
    job_id: job.id,
    job_status: job.status,
    metadata: { ...metadata, ...testMetadata },
    scraper_id: testMetadata.config_id,
    test_type: testMetadata.test_type || 'studio',
    skus_tested: job.skus,
    timeout_at: job.timeout_at || null,
    error_message: job.error_message || null,
  });
}
