/**
 * POST /api/scraper/v1/profile-maintenance/[jobId]/progress
 *
 * Runner progress update endpoint for profile-maintenance jobs.
 *
 * Validates runner auth, loads job, verifies lease, updates progress
 * stored in payload.progress as a nested object.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { validateRunnerAuth } from '@/lib/scraper-auth';

const TERMINAL_STATUSES = ['succeeded', 'failed', 'timed_out', 'cancelled'];

interface ProgressBody {
  lease_token?: string;
  status?: 'running' | 'failed';
  progress?: number;
  phase?: string;
  message?: string;
  details?: Record<string, unknown>;
}

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  // 1. Validate runner authentication
  const apiKey = request.headers.get('X-API-Key');
  const authorization = request.headers.get('Authorization');

  const runner = await validateRunnerAuth({ apiKey, authorization });
  if (!runner) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  try {
    const { jobId } = await context.params;
    const supabase = await createAdminClient();
    const runnerName = runner.runnerName;
    const nowIso = new Date().toISOString();

    // 2. Parse request body
    const body: ProgressBody = await request.json().catch(() => ({}));

    if (!body.lease_token) {
      return NextResponse.json({ error: 'lease_token is required' }, { status: 400 });
    }

    // 3. Load job row (including lease_expires_at for expiry check)
    const { data: job, error: loadError } = await supabase
      .from('profile_maintenance_jobs')
      .select('id, status, lease_token, claimed_by, lease_expires_at, payload')
      .eq('id', jobId)
      .single();

    if (loadError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // 3b. Verify lease is not expired
    if (job.lease_expires_at && new Date(job.lease_expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Lease expired — job must be reclaimed before submitting progress' },
        { status: 409 },
      );
    }

    // 4. Verify runner ownership
    if (job.claimed_by && job.claimed_by !== runnerName) {
      return NextResponse.json({ error: 'Runner does not own current job' }, { status: 409 });
    }

    // 5. Verify lease token
    if (job.lease_token && job.lease_token !== body.lease_token) {
      return NextResponse.json({ error: 'Lease token mismatch' }, { status: 409 });
    }

    // 6. Reject progress on terminal jobs
    if (TERMINAL_STATUSES.includes(job.status)) {
      return NextResponse.json({
        success: true,
        ignored: true,
        reason: 'job already terminal',
      });
    }

    // 7. Update payload.progress with nested progress object
    const currentPayload = (job.payload as Record<string, unknown>) ?? {};
    const existingProgress = (currentPayload.progress as Record<string, unknown>) ?? {};

    const updatedProgress = {
      ...existingProgress,
      percent: body.progress ?? existingProgress.percent ?? null,
      phase: body.phase ?? existingProgress.phase ?? null,
      message: body.message ?? existingProgress.message ?? null,
      details: body.details ?? existingProgress.details ?? null,
      updated_at: nowIso,
    };

    const updatedPayload = {
      ...currentPayload,
      progress: updatedProgress,
    };

    // 8. Determine next status
    const nextStatus = body.status ?? (job.status === 'queued' || job.status === 'claimed' ? 'running' : job.status);

    // 9. Update job row with conditional guards against stale/raced callbacks.
    // Require matching id + lease_token + claimed_by + non-terminal status +
    // unexpired lease.
    const { data: updatedJob, error: updateError } = await supabase
      .from('profile_maintenance_jobs')
      .update({
        status: nextStatus,
        payload: updatedPayload,
        claimed_by: runnerName,
        updated_at: nowIso,
      })
      .eq('id', jobId)
      .eq('lease_token', body.lease_token)
      .eq('claimed_by', runnerName)
      .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)
      .gt('lease_expires_at', nowIso)
      .select('id')
      .maybeSingle();

    if (updateError) {
      console.error('[ProfileMaintenanceProgress] Failed to update job:', updateError);
      return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 });
    }

    if (!updatedJob) {
      console.warn(
        `[ProfileMaintenanceProgress] No row updated for ${jobId} — state changed between load and update (stale/raced callback)`,
      );
      return NextResponse.json(
        { error: 'Job state changed between load and update — stale or expired lease' },
        { status: 409 },
      );
    }

    // 10. Update runner heartbeat
    await supabase
      .from('scraper_runners')
      .update({
        status: 'busy',
        current_job_id: jobId,
        last_seen_at: nowIso,
      })
      .eq('name', runnerName);

    return NextResponse.json({
      success: true,
      status: nextStatus,
    });
  } catch (err) {
    console.error('[ProfileMaintenanceProgress] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
