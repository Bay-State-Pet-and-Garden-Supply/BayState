/**
 * Browser Profile update helpers for profile-maintenance result processing.
 *
 * Provides functions that the result endpoint calls to update browser_profiles
 * rows after browser_profile_setup and browser_profile_revalidate jobs complete.
 *
 * These updates are intentionally non-fatal: if a browser_profiles row update fails,
 * the caller is expected to log a warning and still return success for the job.
 *
 * See docs/adr/0010-browser-profile-registry-runtime-storage.md
 * See docs/adr/0011-dedicated-profile-maintenance-jobs.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Default profile staleness interval (7 days). */
const DEFAULT_STALE_AFTER_DAYS = 7;

/**
 * Validates that a storage_ref value is opaque (UUID or hash, not a filesystem path).
 * Returns true if the value is a valid opaque key, false otherwise.
 */
function isOpaqueKey(value: string | null | undefined): boolean {
  if (!value) return false;
  // Accept UUID format (hex with hyphens)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Accept hex hash (at least 32 chars, all hex)
  const hashPattern = /^[0-9a-f]{32,}$/i;
  // Reject anything that looks like a filesystem path
  if (value.startsWith('/') || value.startsWith('~') || value.startsWith('.') ||
      value.includes('\\') || value.includes('..')) {
    return false;
  }
  return uuidPattern.test(value) || hashPattern.test(value);
}

// =============================================================================
// Browser Profile Setup result handling
// =============================================================================

/**
 * Expected shape of the result payload for a browser_profile_setup job.
 */
export interface BrowserProfileSetupResult {
  validation_status: 'validated' | 'failed';
  storage_ref?: string;
  runner_name?: string;
  error_message?: string;
  target_pdp_seeds_verified?: string[];
}

/**
 * Called when a browser_profile_setup job succeeds with a validated result.
 *
 * Updates the browser_profiles row with:
 * - status → 'validated'
 * - runner_name → from the job's claimed_by
 * - storage_ref → opaque runner-local key from result
 * - last_validated_at → now
 * - stale_after → now + default interval
 * - last_validation_artifact_id → artifact ID
 *
 * Also marks the linked browser_profile_setup_requests row as completed.
 *
 * Non-fatal: logs warnings on failure, does not throw.
 */
export async function updateBrowserProfileFromSetup(
  supabase: SupabaseClient,
  jobId: string,
  jobPayload: Record<string, unknown>,
  resultPayload: Record<string, unknown>,
  artifactId: string | null,
  claimedBy?: string | null,
): Promise<void> {
  const browserProfileId = jobPayload?.browser_profile_id as string | undefined;
  if (!browserProfileId) {
    console.warn(
      `[BrowserProfileUpdate] Rejecting setup result for job ${jobId}: no browser_profile_id in job payload`,
    );
    // Mark setup request as failed when we can't identify the target profile
    await _markSetupRequestFromJob(supabase, jobId, 'failed', claimedBy);
    return;
  }

  if (!artifactId) {
    console.warn(
      `[BrowserProfileUpdate] Rejecting browser profile ${browserProfileId} update for job ${jobId}: missing durable artifact id`,
    );
    await _markSetupRequestFromJob(supabase, jobId, 'failed', claimedBy);
    return;
  }

  const result = resultPayload as Partial<BrowserProfileSetupResult>;
  const validationStatus = result.validation_status;

  if (validationStatus === 'failed') {
    // Mark the browser_profiles row as validation_failed
    const { error: profileError } = await supabase
      .from('browser_profiles')
      .update({
        status: 'validation_failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', browserProfileId);

    if (profileError) {
      console.warn(
        `[BrowserProfileUpdate] Failed to mark browser profile ${browserProfileId} as validation_failed for job ${jobId}:`,
        profileError.message,
      );
    }

    // Mark the setup request as failed
    await _markSetupRequestFromJob(supabase, jobId, 'failed', claimedBy);
    return;
  }

  // Validated case — require opaque storage_ref and at least one verified seed URL
  const storageRef = result.storage_ref || null;

  if (!storageRef) {
    console.warn(
      `[BrowserProfileUpdate] Rejecting setup result for job ${jobId}: storage_ref is required for validated status`,
    );
    // Force-fail the profile since validation is incomplete
    await supabase.from('browser_profiles').update({
      status: 'validation_failed',
      updated_at: new Date().toISOString(),
    }).eq('id', browserProfileId);
    await _markSetupRequestFromJob(supabase, jobId, 'failed', claimedBy);
    return;
  }

  if (!isOpaqueKey(storageRef)) {
    console.warn(
      `[BrowserProfileUpdate] Rejecting setup result for job ${jobId}: storage_ref "${storageRef}" is not an opaque key (filesystem paths are not allowed)`,
    );
    await supabase.from('browser_profiles').update({
      status: 'validation_failed',
      updated_at: new Date().toISOString(),
    }).eq('id', browserProfileId);
    await _markSetupRequestFromJob(supabase, jobId, 'failed', claimedBy);
    return;
  }

  // Require at least one verified seed URL as evidence
  const seedsVerified = result.target_pdp_seeds_verified ?? [];
  if (!Array.isArray(seedsVerified) || seedsVerified.length === 0) {
    console.warn(
      `[BrowserProfileUpdate] Rejecting setup result for job ${jobId}: no verified seed URLs in result evidence`,
    );
    await supabase.from('browser_profiles').update({
      status: 'validation_failed',
      updated_at: new Date().toISOString(),
    }).eq('id', browserProfileId);
    await _markSetupRequestFromJob(supabase, jobId, 'failed', claimedBy);
    return;
  }

  const runnerName = result.runner_name || claimedBy || null;
  const now = new Date();
  const staleAfter = new Date(now.getTime() + DEFAULT_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000);

  // Update browser_profiles row
  const { error: profileError } = await supabase
    .from('browser_profiles')
    .update({
      status: 'validated',
      runner_name: runnerName,
      storage_ref: storageRef,
      last_validated_at: now.toISOString(),
      stale_after: staleAfter.toISOString(),
      last_validation_artifact_id: artifactId,
      updated_at: now.toISOString(),
    })
    .eq('id', browserProfileId);

  if (profileError) {
    console.warn(
      `[BrowserProfileUpdate] Failed to update browser profile ${browserProfileId} from setup job ${jobId}:`,
      profileError.message,
    );
    // Still mark setup request as failed since the DB update didn't succeed
    await _markSetupRequestFromJob(supabase, jobId, 'failed', claimedBy);
    return;
  }

  // Mark the setup request as completed
  await _markSetupRequestFromJob(supabase, jobId, 'completed', claimedBy);
}

// =============================================================================
// Browser Profile Revalidation result handling
// =============================================================================

/**
 * Expected shape of the result payload for a browser_profile_revalidate job.
 */
export interface BrowserProfileRevalidateResult {
  validation_status: 'validated' | 'expired' | 'revoked';
  stale_after?: string;
  reason?: string;
}

/**
 * Called when a browser_profile_revalidate job succeeds.
 *
 * Updates the browser_profiles row based on validation_status:
 * - validated → updates last_validated_at, refreshes stale_after, preserves storage_ref
 * - expired → status becomes 'expired', keeps storage_ref for potential revalidation
 * - revoked → status becomes 'revoked', clears storage_ref and runner_name
 *
 * Also marks the linked browser_profile_setup_requests row as completed.
 *
 * Non-fatal: logs warnings on failure, does not throw.
 */
export async function updateBrowserProfileFromRevalidation(
  supabase: SupabaseClient,
  jobId: string,
  jobPayload: Record<string, unknown>,
  resultPayload: Record<string, unknown>,
  artifactId: string | null,
): Promise<void> {
  const browserProfileId = jobPayload?.browser_profile_id as string | undefined;
  if (!browserProfileId) {
    console.warn(
      `[BrowserProfileUpdate] Skipping revalidation result for job ${jobId}: no browser_profile_id in job payload`,
    );
    return;
  }

  if (!artifactId) {
    console.warn(
      `[BrowserProfileUpdate] Skipping browser profile ${browserProfileId} revalidation update for job ${jobId}: missing durable artifact id`,
    );
    return;
  }

  const result = resultPayload as Partial<BrowserProfileRevalidateResult>;
  const validationStatus = result.validation_status;

  if (!validationStatus || !['validated', 'expired', 'revoked'].includes(validationStatus)) {
    console.warn(
      `[BrowserProfileUpdate] Unknown validation_status "${validationStatus}" for job ${jobId}, skipping update`,
    );
    return;
  }

  const now = new Date();
  const nowIso = now.toISOString();

  switch (validationStatus) {
    case 'validated': {
      const staleAfter = result.stale_after
        ? new Date(result.stale_after).toISOString()
        : new Date(now.getTime() + DEFAULT_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase
        .from('browser_profiles')
        .update({
          status: 'validated',
          last_validated_at: nowIso,
          stale_after: staleAfter,
          last_validation_artifact_id: artifactId,
          updated_at: nowIso,
        })
        .eq('id', browserProfileId);

      if (error) {
        console.warn(
          `[BrowserProfileUpdate] Failed to update browser profile ${browserProfileId} after revalidation (validated) for job ${jobId}:`,
          error.message,
        );
      }
      break;
    }

    case 'expired': {
      const { error } = await supabase
        .from('browser_profiles')
        .update({
          status: 'expired',
          last_validation_artifact_id: artifactId,
          updated_at: nowIso,
        })
        .eq('id', browserProfileId);

      if (error) {
        console.warn(
          `[BrowserProfileUpdate] Failed to update browser profile ${browserProfileId} after revalidation (expired) for job ${jobId}:`,
          error.message,
        );
      }
      break;
    }

    case 'revoked': {
      // Revoked profiles lose their storage_ref and runner_name
      const { error } = await supabase
        .from('browser_profiles')
        .update({
          status: 'revoked',
          storage_ref: null,
          runner_name: null,
          last_validation_artifact_id: artifactId,
          updated_at: nowIso,
        })
        .eq('id', browserProfileId);

      if (error) {
        console.warn(
          `[BrowserProfileUpdate] Failed to update browser profile ${browserProfileId} after revalidation (revoked) for job ${jobId}:`,
          error.message,
        );
      }
      break;
    }
  }

  // Mark the setup request as completed
  await _markSetupRequestFromJob(supabase, jobId, 'completed');
}

// =============================================================================
// Fail-closed helper
// =============================================================================

/**
 * Result of checking whether a required Browser Profile is usable.
 */
export interface RequiredBrowserProfileStatus {
  /** Whether the profile exists and can be used. */
  usable: boolean;
  /** The browser profile id if found. */
  browserProfileId?: string;
  /** Current status of the profile. */
  status?: string;
  /** Opaque storage ref for the runner. */
  storageRef?: string;
  /** Reason why the profile is not usable, if applicable. */
  reason?: string;
}

/**
 * Check whether a required Browser Profile is usable for extraction.
 *
 * A required profile is usable when:
 * - A browser_profiles row exists for the scope with required=true
 * - status is 'validated'
 * - stale_after is null OR stale_after > now
 * - storage_ref is not null
 *
 * If no browser_profiles row exists, the profile is not required yet
 * (usable = true, no blocker).
 *
 * Intended to be called by source-plan enrichment integration
 * (not yet wired in this slice).
 *
 * @param supabase  Admin Supabase client
 * @param brandId   Brand ID
 * @param sourceSlug  Source slug
 * @param canonicalDomain  Canonical domain
 * @returns RequiredBrowserProfileStatus
 */
export async function getRequiredBrowserProfileStatus(
  supabase: SupabaseClient,
  brandId: string,
  sourceSlug: string,
  canonicalDomain: string,
): Promise<RequiredBrowserProfileStatus> {
  const { data: profile, error } = await supabase
    .from('browser_profiles')
    .select('id, status, storage_ref, stale_after, required')
    .eq('brand_id', brandId)
    .eq('source_slug', sourceSlug)
    .eq('canonical_domain', canonicalDomain)
    .eq('environment', 'production')
    .maybeSingle();

  if (error) {
    // DB error — fail closed: treat as not usable
    console.warn(
      `[BrowserProfileUpdate] DB error checking required profile for ${brandId}/${sourceSlug}/${canonicalDomain}: ${error.message}`,
    );
    return {
      usable: false,
      reason: `database error checking required browser profile: ${error.message}`,
    };
  }

  if (!profile) {
    // No profile row at all → not required yet
    return { usable: true };
  }

  if (!profile.required) {
    // Profile exists but not required → usable
    return {
      usable: true,
      browserProfileId: profile.id,
      status: profile.status,
      storageRef: profile.storage_ref,
    };
  }

  // Profile is required — check validity
  const isStale = profile.stale_after && new Date(profile.stale_after) <= new Date();
  const isUsable =
    profile.status === 'validated' &&
    !isStale &&
    profile.storage_ref != null;

  if (isUsable) {
    return {
      usable: true,
      browserProfileId: profile.id,
      status: profile.status,
      storageRef: profile.storage_ref,
    };
  }

  // Build a reason for the failure
  let reason: string;
  if (profile.status !== 'validated') {
    reason = `browser_profile status is '${profile.status}', expected 'validated'`;
  } else if (!profile.storage_ref) {
    reason = 'browser_profile has no storage_ref (runner data missing)';
  } else if (isStale) {
    reason = `browser_profile stale after ${profile.stale_after}`;
  } else {
    reason = 'browser_profile is not usable';
  }

  return {
    usable: false,
    browserProfileId: profile.id,
    status: profile.status,
    storageRef: profile.storage_ref,
    reason,
  };
}

/** Result of a required Browser Profile staleness check. */
export interface RequiredProfileCheckResult {
  /** The browser profile id that is stale or missing. */
  browserProfileId?: string;
  /** Scope identifiers for the profile. */
  brandId: string;
  sourceSlug: string;
  canonicalDomain: string;
  /** Current profile status if a row exists. */
  status?: string;
  /** Description of the issue. */
  issue: string;
  /** Severity: 'stale' (validated but past stale_after) | 'missing' (no validated profile) */
  severity: 'stale' | 'missing';
}

/**
 * Check required Browser Profiles for staleness and create attention signals.
 *
 * Scans all browser_profiles rows where required=true and validates that each
 * has status='validated', a non-null storage_ref, and is not past its stale_after.
 *
 * For each profile that fails these checks, emits a structured log warning as
 * an attention signal. Does not block extraction — callers can use the returned
 * array to decide whether to skip extraction for affected brands/sources.
 *
 * This function is designed to be called periodically (e.g., from a cron job,
 * before extraction job creation, or on admin dashboard load). When the caller
 * wants to block extraction, they should call getRequiredBrowserProfileStatus()
 * for each specific brand/source/domain instead.
 *
 * @param supabase  Admin Supabase client
 * @returns Array of check results for profiles that need attention
 */
export async function checkAndSignalStaleBrowserProfiles(
  supabase: SupabaseClient,
): Promise<RequiredProfileCheckResult[]> {
  const signals: RequiredProfileCheckResult[] = [];

  const { data: profiles, error } = await supabase
    .from('browser_profiles')
    .select('id, brand_id, source_slug, canonical_domain, status, storage_ref, stale_after')
    .eq('required', true);

  if (error) {
    console.error(
      '[BrowserProfileUpdate] Failed to query required browser profiles:',
      error.message,
    );
    return signals;
  }

  if (!profiles || profiles.length === 0) {
    return signals;
  }

  for (const profile of profiles) {
    const now = new Date();
    const isStale = profile.stale_after && new Date(profile.stale_after) <= now;
    const isValid = profile.status === 'validated' && !isStale && profile.storage_ref != null;

    if (!isValid) {
      let issue: string;
      let severity: 'stale' | 'missing';

      if (profile.status !== 'validated') {
        issue = `Required browser profile has status '${profile.status}', expected 'validated'`;
        severity = 'missing';
      } else if (!profile.storage_ref) {
        issue = 'Required browser profile has no storage_ref (runner data missing)';
        severity = 'missing';
      } else if (isStale) {
        issue = `Required browser profile is stale (stale_after: ${profile.stale_after})`;
        severity = 'stale';
      } else {
        issue = 'Required browser profile is not usable';
        severity = 'missing';
      }

      console.warn(
        `[BrowserProfileUpdate] ATTENTION: ${issue} for brand=${profile.brand_id}, source=${profile.source_slug}, domain=${profile.canonical_domain}, profile=${profile.id}`,
      );

      signals.push({
        browserProfileId: profile.id,
        brandId: profile.brand_id,
        sourceSlug: profile.source_slug,
        canonicalDomain: profile.canonical_domain,
        status: profile.status,
        issue,
        severity,
      });
    }
  }

  return signals;
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Find and update the browser_profile_setup_requests row linked to a job.
 */
async function _markSetupRequestFromJob(
  supabase: SupabaseClient,
  jobId: string,
  status: 'completed' | 'failed',
  assignedRunner?: string | null,
): Promise<void> {
  // Find the setup request by maintenance_job_id
  const { data: request } = await supabase
    .from('browser_profile_setup_requests')
    .select('id')
    .eq('maintenance_job_id', jobId)
    .maybeSingle();

  if (!request) {
    console.warn(
      `[BrowserProfileUpdate] No browser_profile_setup_requests found for job ${jobId}`,
    );
    return;
  }

  const updateData: Record<string, unknown> = {
    status,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (assignedRunner) {
    updateData.assigned_runner = assignedRunner;
  }

  const { error } = await supabase
    .from('browser_profile_setup_requests')
    .update(updateData)
    .eq('id', request.id);

  if (error) {
    console.warn(
      `[BrowserProfileUpdate] Failed to update browser_profile_setup_requests ${request.id} for job ${jobId}:`,
      error.message,
    );
  }
}
