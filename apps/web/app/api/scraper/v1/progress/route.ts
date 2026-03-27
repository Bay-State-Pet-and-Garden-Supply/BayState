import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { validateRunnerAuth } from '@/lib/scraper-auth';
import { normalizeScrapeProgressUpdate } from '@/lib/scraper-logs';

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase configuration');
  }
  return createClient(url, key);
}

interface ProgressIngestRequest {
  job_id?: string;
  lease_token?: string;
  status?: string;
  progress?: number;
  message?: string;
  phase?: string;
  details?: Record<string, unknown>;
  current_sku?: string;
  items_processed?: number;
  items_total?: number;
  timestamp?: string;
  runner_id?: string;
  runner_name?: string;
}

export async function POST(request: NextRequest) {
  try {
    const runner = await validateRunnerAuth({
      apiKey: request.headers.get('X-API-Key'),
      authorization: request.headers.get('Authorization'),
    });

    if (!runner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as ProgressIngestRequest;
    if (!body.job_id) {
      return NextResponse.json({ error: 'Missing required field: job_id' }, { status: 400 });
    }

    const progress = normalizeScrapeProgressUpdate({
      ...body,
      job_id: body.job_id,
      runner_name: body.runner_name ?? runner.runnerName,
    });

    const supabase = getSupabaseAdmin();
    const { data: job, error: jobError } = await supabase
      .from('scrape_jobs')
      .select('id, status, lease_token, runner_name, started_at')
      .eq('id', progress.job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.runner_name && job.runner_name !== runner.runnerName) {
      return NextResponse.json({ error: 'Runner does not own current job' }, { status: 409 });
    }

    if (job.lease_token && body.lease_token !== job.lease_token) {
      return NextResponse.json({ error: 'Lease token mismatch' }, { status: 409 });
    }

    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      return NextResponse.json({
        success: true,
        ignored: true,
        reason: 'job already terminal',
      });
    }

    const nowIso = new Date().toISOString();
    const progressTimestamp = progress.timestamp || nowIso;
    const leaseExpiresAt = job.lease_token
      ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
      : null;

    const nextStatus =
      job.status === 'pending' || job.status === 'claimed' ? 'running' : job.status;

    const updateData: Record<string, unknown> = {
      status: nextStatus,
      runner_name: runner.runnerName,
      started_at: job.started_at ?? nowIso,
      updated_at: nowIso,
      heartbeat_at: nowIso,
      progress_percent: progress.progress,
      progress_message: progress.message ?? null,
      progress_phase: progress.phase ?? null,
      progress_details: progress.details ?? null,
      progress_updated_at: progressTimestamp,
      current_sku: progress.current_sku ?? null,
      items_processed: progress.items_processed ?? null,
      items_total: progress.items_total ?? null,
      last_event_at: progressTimestamp,
    };

    if (leaseExpiresAt) {
      updateData.lease_expires_at = leaseExpiresAt;
    }

    const { error: updateError } = await supabase
      .from('scrape_jobs')
      .update(updateData)
      .eq('id', progress.job_id);

    if (updateError) {
      console.error('[Progress API] Failed to update job runtime state:', updateError);
      return NextResponse.json({ error: 'Failed to persist progress' }, { status: 500 });
    }

    const { error: runnerError } = await supabase
      .from('scraper_runners')
      .update({
        status: 'busy',
        current_job_id: progress.job_id,
        last_seen_at: nowIso,
      })
      .eq('name', runner.runnerName);

    if (runnerError) {
      console.warn('[Progress API] Failed to update runner heartbeat state:', runnerError.message);
    }

    return NextResponse.json({
      success: true,
      status: nextStatus,
      heartbeat_at: nowIso,
      lease_expires_at: leaseExpiresAt,
    });
  } catch (error) {
    console.error('[Progress API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
