/**
 * POST /api/scraper/v1/profile-maintenance/[jobId]/result
 *
 * Runner callback endpoint for profile-maintenance job results.
 *
 * The scraper runner posts the job result here after completing a
 * profile-maintenance job (e.g. verify_pdp_seed).
 *
 * Flow:
 * 1. Validate runner auth
 * 2. Load job row, verify lease token ownership
 * 3. Validate status transition (only terminal statuses accepted)
 * 4. Store result / error payload
 * 5. Optionally create a profile_maintenance_artifacts row
 * 6. Update target rows based on job kind (e.g. PDP seed for verify_pdp_seed)
 * 7. Update runner status back to idle
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import type { ProfileMaintenanceTerminalStatus } from '@/lib/profile-maintenance/types';
import { updateSeedFromVerification } from '@/lib/profile-maintenance/seed-update';
import { updateVersionFromDraft, updateValidationRunFromValidation } from '@/lib/profile-maintenance/version-update';
import {
  updateBrowserProfileFromSetup,
  updateBrowserProfileFromRevalidation,
} from '@/lib/profile-maintenance/browser-profile-update';

const VALID_TERMINAL_STATUSES: ProfileMaintenanceTerminalStatus[] = ['succeeded', 'failed', 'timed_out'];
const TERMINAL_STATUSES = ['succeeded', 'failed', 'timed_out', 'cancelled'];

interface ResultBody {
  status: ProfileMaintenanceTerminalStatus;
  lease_token?: string;
  result?: Record<string, unknown>;
  error_code?: string;
  error_message?: string;
  artifact?: {
    kind: string;
    schema_version: string;
    payload: Record<string, unknown>;
    evidence_refs?: Record<string, unknown>;
    content_hash?: string;
    content_size_bytes?: number;
    content_type?: string;
    runner_environment?: string;
    runner_build_id?: string;
  };
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
    const now = new Date();
    const nowIso = now.toISOString();

    // 2. Parse and validate request body
    const body: ResultBody = await request.json();

    if (!body.status || !(VALID_TERMINAL_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json(
        {
          error: `Invalid status '${body.status}'. Must be one of: ${VALID_TERMINAL_STATUSES.join(', ')}`,
        },
        { status: 400 },
      );
    }

    // 3. Load job row
    const { data: job, error: loadError } = await supabase
      .from('profile_maintenance_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (loadError || !job) {
      console.error('[ProfileMaintenanceResult] Job not found:', jobId);
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // 4. Prevent double-processing (terminal statuses)
    if (TERMINAL_STATUSES.includes(job.status)) {
      console.warn(
        `[ProfileMaintenanceResult] Job ${jobId} already terminal (status=${job.status}), skipping`,
      );
      return NextResponse.json({ success: true, status: 'already_completed' });
    }

    // 5. Verify lease ownership
    if (job.lease_token) {
      if (!body.lease_token) {
        return NextResponse.json(
          { error: 'Lease token required — job was claimed with a lease' },
          { status: 409 },
        );
      }
      if (job.lease_token !== body.lease_token) {
        console.warn(
          `[ProfileMaintenanceResult] Lease mismatch for ${jobId}: got ${body.lease_token}, expected ${job.lease_token}`,
        );
        return NextResponse.json(
          { error: 'Lease token mismatch — stale or replayed callback' },
          { status: 409 },
        );
      }
    }

    // 5b. Verify lease is not expired
    if (job.lease_expires_at && new Date(job.lease_expires_at) < now) {
      console.warn(
        `[ProfileMaintenanceResult] Lease expired for ${jobId}: expired at ${job.lease_expires_at}`,
      );
      return NextResponse.json(
        { error: 'Lease expired — job must be reclaimed' },
        { status: 409 },
      );
    }

    // 6. Verify runner ownership
    if (job.claimed_by && job.claimed_by !== runnerName) {
      return NextResponse.json(
        { error: `Job claimed by ${job.claimed_by}, not ${runnerName}` },
        { status: 409 },
      );
    }

    // 7. Validate status-specific requirements
    if (body.status === 'succeeded' && body.error_code) {
      return NextResponse.json(
        { error: 'error_code must not be set when status is succeeded' },
        { status: 400 },
      );
    }

    // 8. Build update payload
    const updatePayload: Record<string, unknown> = {
      status: body.status,
      completed_at: nowIso,
      updated_at: nowIso,
    };

    if (body.result !== undefined) updatePayload.result = body.result;
    if (body.error_code !== undefined) updatePayload.error_code = body.error_code;
    if (body.error_message !== undefined) updatePayload.error_message = body.error_message;

    // 9. Update the job row with conditional guards against stale/raced callbacks.
    // Require matching id + lease_token + claimed_by + non-terminal status +
    // unexpired lease to prevent stale callbacks from modifying a job that has
    // been reclaimed or already completed.
    const { data: updatedJob, error: updateError } = await supabase
      .from('profile_maintenance_jobs')
      .update(updatePayload)
      .eq('id', jobId)
      .eq('lease_token', body.lease_token ?? job.lease_token)
      .eq('claimed_by', runnerName)
      .not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)
      .gt('lease_expires_at', nowIso)
      .select('id')
      .maybeSingle();

    if (updateError) {
      console.error('[ProfileMaintenanceResult] Failed to update job:', updateError);
      return NextResponse.json({ error: 'Failed to save job result' }, { status: 500 });
    }

    if (!updatedJob) {
      console.warn(
        `[ProfileMaintenanceResult] No row updated for ${jobId} — state changed between load and update (stale/raced callback)`,
      );
      return NextResponse.json(
        { error: 'Job state changed between load and update — stale or replayed callback' },
        { status: 409 },
      );
    }

    // 10. Optionally create an artifact row
    // Enforce artifact.kind matches job.kind; skip insertion if mismatched.
    if (body.artifact) {
      if (body.artifact.kind && body.artifact.kind !== job.kind) {
        console.warn(
          `[ProfileMaintenanceResult] Artifact kind "${body.artifact.kind}" does not match job kind "${job.kind}", skipping artifact creation for job ${jobId}`,
        );
      } else {
        try {
          const artifactPayload: Record<string, unknown> = {
            artifact_version: 'v1',
            kind: body.artifact.kind || job.kind,
            job_id: jobId,
            attempt_number: job.attempt_count,
            brand_id: job.brand_id,
            source_slug: job.source_slug,
            canonical_domain: job.canonical_domain,
            profile_id: job.profile_id,
            profile_version_id: job.profile_version_id,
            browser_profile_id: job.browser_profile_id,
            runner_name: runnerName,
            runner_environment: body.artifact.runner_environment ?? 'production',
            runner_build_id: body.artifact.runner_build_id ?? null,
            status: 'created',
            schema_version: body.artifact.schema_version,
            payload: body.artifact.payload ?? {},
            evidence_refs: body.artifact.evidence_refs ?? {},
            content_hash: body.artifact.content_hash ?? null,
            content_size_bytes: body.artifact.content_size_bytes ?? null,
            content_type: body.artifact.content_type ?? null,
          };

          let artifactId: string | null = null;

          const { data: artifactData, error: artifactError } = await supabase
            .from('profile_maintenance_artifacts')
            .insert(artifactPayload)
            .select('id')
            .maybeSingle();

          if (artifactError) {
            console.warn(
              '[ProfileMaintenanceResult] Failed to create artifact (non-fatal):',
              artifactError.message,
            );
          } else if (artifactData?.id) {
            artifactId = artifactData.id;
          }

          // 11. Update target rows based on job kind (non-fatal)
          if (body.status === 'succeeded') {
            switch (job.kind) {
              case 'verify_pdp_seed':
                await updateSeedFromVerification(
                  supabase,
                  jobId,
                  {
                    ...((job.payload as Record<string, unknown> | null) ?? {}),
                    brand_id: job.brand_id,
                    source_slug: job.source_slug,
                    canonical_domain: job.canonical_domain,
                  },
                  body.result ?? {},
                  artifactId,
                );
                break;
              case 'draft_site_extraction_profile':
                await updateVersionFromDraft(
                  supabase,
                  jobId,
                  (job.payload as Record<string, unknown> | null) ?? {},
                  body.result ?? {},
                  artifactId,
                );
                break;
              case 'validate_profile_version':
                await updateValidationRunFromValidation(
                  supabase,
                  jobId,
                  (job.payload as Record<string, unknown> | null) ?? {},
                  body.result ?? {},
                  artifactId,
                );
                break;
              case 'browser_profile_setup':
                await updateBrowserProfileFromSetup(
                  supabase,
                  jobId,
                  (job.payload as Record<string, unknown> | null) ?? {},
                  body.result ?? {},
                  artifactId,
                  job.claimed_by,
                );
                break;
              case 'browser_profile_revalidate':
                await updateBrowserProfileFromRevalidation(
                  supabase,
                  jobId,
                  (job.payload as Record<string, unknown> | null) ?? {},
                  body.result ?? {},
                  artifactId,
                );
                break;
            }
          }
        } catch (e) {
          console.warn('[ProfileMaintenanceResult] Error creating artifact (non-fatal):', e);
        }
      }
    }

    // 11. Reset version status on job failure (non-fatal)
    if (body.status !== 'succeeded' && job.kind === 'validate_profile_version') {
      const vp = (job.payload as Record<string, unknown> | null) ?? {};
      const pvid = vp.profile_version_id as string | undefined;
      if (pvid) {
        await supabase.from('site_extraction_profile_versions')
          .update({ status: 'draft', updated_at: nowIso })
          .eq('id', pvid).eq('status', 'validating');
      }
    }

    // 12. Update runner status back to idle
    await supabase
      .from('scraper_runners')
      .update({
        current_job_id: null,
        last_seen_at: nowIso,
      })
      .eq('name', runnerName);

    return NextResponse.json({
      success: true,
      job_id: jobId,
      status: body.status,
    });
  } catch (err) {
    console.error('[ProfileMaintenanceResult] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
