import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { SUPABASE_SECRET_KEY, SUPABASE_URL } from '@/lib/supabase/config';
import { NextRequest, NextResponse } from 'next/server';

function getSupabaseAdmin(): SupabaseClient {
  const url = SUPABASE_URL;
  const key = SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }
  return createSupabaseClient(url, key);
}

/**
 * GET /api/admin/scrapers/studio/test/[id]
 *
 * Gets the status and results of a test job.
 * Reads from enrichment_jobs (unified enrichment-first architecture).
 *
 * Response:
 * {
 *   id: string;
 *   status: 'queued' | 'running' | 'completed' | 'failed';
 *   test_status?: 'passed' | 'failed' | 'partial';
 *   config_id: string;
 *   version_id: string;
 *   started_at: string;
 *   completed_at?: string;
 *   duration_ms?: number;
 *   upc_results: [...];
 *   summary: { passed: number; failed: number; total: number };
 *   timeout_at?: string;
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  try {
    const { id } = await params;
    const adminClient = getSupabaseAdmin();

    // Fetch the test job directly from enrichment_jobs
    const { data: job, error: jobError } = await adminClient
      .from('enrichment_jobs')
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
    const now = new Date();
    if ((job.status === 'queued' || job.status === 'running') && job.lease_expires_at) {
      const expiresAt = new Date(job.lease_expires_at);
      if (now > expiresAt) {
          // If the job has expired, we mark it as failed in the response 
          // (though we might want to let a background process handle the DB update)
          job.status = 'failed';
          job.error_message = job.error_message || 'Job timed out';
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
  const config = (job.config as Record<string, unknown>) || {};
  
  // Fetch attempts to build UPC results
  const { data: attempts } = await adminClient
    .from('enrichment_attempts')
    .select('*')
    .eq('job_id', job.id as string)
    .order('created_at', { ascending: true });

  const upcResults = (attempts || []).map(a => ({
    upc: a.upc,
    status: a.status,
    confidence: a.confidence_overall,
    error: a.error_message,
    result: a.result,
    completed_at: a.completed_at
  }));

  const failed = (job.failed_count as number) || 0;
  const completed = (job.completed_count as number) || 0;
  const responseSummary = { 
    passed: Math.max(0, completed - failed), 
    failed, 
    total: (job.total_count as number) || 0 
  };

  // Calculate duration
  let duration_ms: number | undefined;
  if (job.started_at && job.completed_at) {
    duration_ms = new Date(job.completed_at as string).getTime() -
                  new Date(job.started_at as string).getTime();
  }

  // Derive test_status from summary or job status
  let testStatus: string | undefined;
  if (job.status === 'completed') {
    testStatus = responseSummary.failed === 0 ? 'passed' : responseSummary.passed > 0 ? 'partial' : 'failed';
  } else if (job.status === 'failed' || job.status === 'completed_with_errors') {
    testStatus = 'failed';
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    test_status: testStatus,
    config_id: testMetadata.scraper_slug || config.scraper_slug,
    version_id: 'latest', // Scraper configs are now simpler
    started_at: job.started_at || job.created_at,
    completed_at: job.completed_at || null,
    duration_ms,
    upc_results: upcResults,
    summary: responseSummary,
    job_id: job.id,
    job_status: job.status,
    metadata: { ...config, ...testMetadata },
    scraper_id: testMetadata.scraper_slug || config.scraper_slug,
    test_type: testMetadata.test_type || 'studio',
    upcs_tested: job.upcs,
    timeout_at: job.lease_expires_at || null,
    error_message: job.error_message || null,
  });
}
