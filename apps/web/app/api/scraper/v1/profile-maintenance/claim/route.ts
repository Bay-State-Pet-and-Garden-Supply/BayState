/**
 * POST /api/scraper/v1/profile-maintenance/claim
 *
 * Runner claim endpoint for profile-maintenance jobs.
 *
 * The scraper runner polls this endpoint to claim the next queued
 * profile-maintenance job. Only runners with profile_maintenance capability
 * may claim these jobs.
 *
 * Claim rules:
 * - Only runners advertising profile_maintenance capability
 * - Required capabilities on the job must be satisfied by runner capabilities
 * - Optional job_kinds filter from request body
 * - Lease: 15 minutes (matching enrichment)
 * - Expired leases become claimable again until max_attempts
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, type SupabaseClient } from '@/lib/supabase/server';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import crypto from 'crypto';
import type { ClaimedProfileMaintenanceJob, ProfileMaintenanceJobKind } from '@/lib/profile-maintenance/types';

const LEASE_DURATION_MINUTES = 15;

interface ProfileMaintenanceCapability {
  enabled: boolean;
  verify_pdp_seed?: boolean;
  crawl4ai?: boolean;
  model_schema_draft?: boolean;
  draft_site_extraction_profile?: boolean;
  validate_profile_version?: boolean;
  browser_profile_setup?: boolean;
  browser_profile_runtime?: boolean;
}

interface ClaimRequestBody {
  runner_name?: string;
  max_attempts?: number;
  capabilities?: {
    profile_maintenance?: ProfileMaintenanceCapability;
  };
  job_kinds?: ProfileMaintenanceJobKind[];
}

export async function POST(request: NextRequest) {
  // 1. Validate runner authentication
  const apiKey = request.headers.get('X-API-Key');
  const authorization = request.headers.get('Authorization');

  const runner = await validateRunnerAuth({ apiKey, authorization });
  if (!runner) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  try {
    const supabase = await createAdminClient();
    const runnerName = runner.runnerName;

    // 2. Load runner metadata to check capabilities and enabled status
    const { data: runnerRow } = await supabase
      .from('scraper_runners')
      .select('enabled, metadata')
      .eq('name', runnerName)
      .single();

    if (!runnerRow) {
      return NextResponse.json({ error: 'Runner not found' }, { status: 404 });
    }

    if (runnerRow.enabled === false) {
      return NextResponse.json({ error: 'Runner is disabled' }, { status: 403 });
    }

    // Parse request body for runner capability advertisement
    const claimBody: ClaimRequestBody = await request.json().catch(() => ({}));

    const metadata = (runnerRow.metadata as Record<string, unknown>) ?? {};
    const capabilities = metadata.capabilities as Record<string, unknown> | undefined;
    const storedCapability = capabilities?.profile_maintenance as ProfileMaintenanceCapability | undefined;

    // Determine effective capability: prefer stored metadata, fallback to request body
    let effectiveCapability: ProfileMaintenanceCapability | undefined = storedCapability;
    if ((!storedCapability?.enabled) && claimBody.capabilities?.profile_maintenance?.enabled) {
      effectiveCapability = claimBody.capabilities.profile_maintenance;
      // Persist to runner metadata for future claims
      const updatedCaps = { ...(capabilities || {}), profile_maintenance: effectiveCapability };
      await supabase
        .from('scraper_runners')
        .update({ metadata: { ...metadata, capabilities: updatedCaps } })
        .eq('name', runnerName);
    }

    if (!effectiveCapability?.enabled) {
      return NextResponse.json(
        { job: null, reason: 'Runner does not advertise profile_maintenance capability' },
        { status: 200 },
      );
    }

    // 3. Build runner capability set for filtering
    const runnerCapKeys: string[] = ['profile_maintenance'];
    if (effectiveCapability.verify_pdp_seed) runnerCapKeys.push('profile_maintenance.verify_pdp_seed');
    if (effectiveCapability.crawl4ai) runnerCapKeys.push('profile_maintenance.crawl4ai');
    if (effectiveCapability.model_schema_draft) runnerCapKeys.push('profile_maintenance.model_schema_draft');
    if (effectiveCapability.draft_site_extraction_profile) runnerCapKeys.push('profile_maintenance.draft_site_extraction_profile');
    if (effectiveCapability.validate_profile_version) runnerCapKeys.push('profile_maintenance.validate_profile_version');
    if (effectiveCapability.browser_profile_setup) runnerCapKeys.push('profile_maintenance.browser_profile_setup');
    if (effectiveCapability.browser_profile_runtime) runnerCapKeys.push('profile_maintenance.browser_profile_runtime');

    const jobKindFilter = claimBody.job_kinds;

    // 4. Atomically claim a queued row then fall back to expired leases.
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MINUTES * 60 * 1000);
    const leaseToken = crypto.randomUUID();

    // Phase 1: Try to claim a queued row via conditional UPDATE
    const claimedId = await claimQueuedWithUpdate(
      supabase, runnerName, leaseToken, leaseExpiresAt,
      runnerCapKeys, jobKindFilter,
    );

    if (claimedId) {
      return await buildClaimResponse(supabase, runnerName, claimedId, now);
    }

    // Phase 2: Try an expired-lease row
    const expiredId = await claimExpiredWithUpdate(
      supabase, runnerName, leaseToken, leaseExpiresAt,
      runnerCapKeys, jobKindFilter,
    );

    if (expiredId) {
      return await buildClaimResponse(supabase, runnerName, expiredId, now);
    }

    return NextResponse.json({ job: null }, { status: 200 });
  } catch (err) {
    console.error('[ProfileMaintenanceClaim] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Check if runner capabilities satisfy the job's required_capabilities.
 */
function satisfiesCapabilities(
  jobRequiredCaps: string[],
  runnerCapKeys: string[],
): boolean {
  if (!jobRequiredCaps || jobRequiredCaps.length === 0) return true;
  return jobRequiredCaps.every((cap) => runnerCapKeys.includes(cap));
}

/**
 * Find claimable queued rows, respecting capability and kind filters.
 * Uses pagination (offset/limit) to skip past early jobs whose required
 * capabilities the runner cannot satisfy, avoiding head-of-line blocking.
 */
async function findClaimableQueuedRows(
  supabase: SupabaseClient,
  jobKindFilter?: ProfileMaintenanceJobKind[],
  limit: number = 10,
  offset: number = 0,
): Promise<Array<{ id: string; attempt_count: number; max_attempts: number; required_capabilities: string[] }>> {
  let query = supabase
    .from('profile_maintenance_jobs')
    .select('id, attempt_count, max_attempts, required_capabilities')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (jobKindFilter && jobKindFilter.length > 0) {
    query = query.in('kind', jobKindFilter);
  }

  const { data: rows } = await query;
  if (!rows || rows.length === 0) return [];

  // Return the raw page. Capability filtering happens in the pagination
  // loop so an incompatible page does not stop the search prematurely.
  return rows as Array<{ id: string; attempt_count: number; max_attempts: number; required_capabilities: string[] }>;
}

/**
 * Find expired-lease rows that are claimable.
 * Uses pagination (offset/limit) to skip past early jobs whose required
 * capabilities the runner cannot satisfy.
 */
async function findExpiredClaimableRows(
  supabase: SupabaseClient,
  jobKindFilter?: ProfileMaintenanceJobKind[],
  limit: number = 10,
  offset: number = 0,
): Promise<Array<{ id: string; attempt_count: number; max_attempts: number; required_capabilities: string[] }>> {
  const gracePeriod = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  let query = supabase
    .from('profile_maintenance_jobs')
    .select('id, attempt_count, max_attempts, required_capabilities')
    .in('status', ['claimed', 'running'])
    .lt('lease_expires_at', gracePeriod)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (jobKindFilter && jobKindFilter.length > 0) {
    query = query.in('kind', jobKindFilter);
  }

  const { data: rows } = await query;
  if (!rows || rows.length === 0) return [];

  // Return the raw page. Capability filtering happens in the pagination
  // loop so an incompatible page does not stop the search prematurely.
  return rows as Array<{ id: string; attempt_count: number; max_attempts: number; required_capabilities: string[] }>;
}

/**
 * Pagination constants to avoid head-of-line blocking.
 * We page through candidates in batches of PAGE_SIZE until a claimable row
 * is found or MAX_TOTAL candidates have been examined.
 */
const CLAIM_PAGE_SIZE = 10;
const CLAIM_MAX_TOTAL = 100;

/**
 * Claim a queued row by first finding one, then doing a conditional UPDATE.
 * Paginates through candidates to skip incompatible early jobs.
 * Returns the row id or null.
 */
async function claimQueuedWithUpdate(
  supabase: SupabaseClient,
  runnerName: string,
  leaseToken: string,
  leaseExpiresAt: Date,
  runnerCapKeys: string[],
  jobKindFilter?: ProfileMaintenanceJobKind[],
): Promise<string | null> {
  for (let offset = 0; offset < CLAIM_MAX_TOTAL; offset += CLAIM_PAGE_SIZE) {
    const candidates = await findClaimableQueuedRows(
      supabase, jobKindFilter, CLAIM_PAGE_SIZE, offset,
    );
    if (candidates.length === 0) return null;

    const claimableCandidates = candidates.filter((row) => {
      const requiredCaps = (row.required_capabilities as unknown as string[]) ?? [];
      return satisfiesCapabilities(requiredCaps, runnerCapKeys);
    });
    if (claimableCandidates.length === 0) continue;

    const claimed = await tryClaimCandidate(supabase, claimableCandidates, runnerName, leaseToken, leaseExpiresAt, 'queued');
    if (claimed) return claimed;
  }
  return null;
}

/**
 * Claim a row that has an expired lease.
 * Increments attempt_count, honors max_attempts.
 * Paginates through candidates to skip incompatible early jobs.
 * Returns the row id or null.
 */
async function claimExpiredWithUpdate(
  supabase: SupabaseClient,
  runnerName: string,
  leaseToken: string,
  leaseExpiresAt: Date,
  runnerCapKeys: string[],
  jobKindFilter?: ProfileMaintenanceJobKind[],
): Promise<string | null> {
  for (let offset = 0; offset < CLAIM_MAX_TOTAL; offset += CLAIM_PAGE_SIZE) {
    const candidates = await findExpiredClaimableRows(
      supabase, jobKindFilter, CLAIM_PAGE_SIZE, offset,
    );
    if (candidates.length === 0) return null;

    const claimableCandidates = candidates.filter((row) => {
      const requiredCaps = (row.required_capabilities as unknown as string[]) ?? [];
      return satisfiesCapabilities(requiredCaps, runnerCapKeys);
    });
    if (claimableCandidates.length === 0) continue;

    const claimed = await tryClaimCandidate(supabase, claimableCandidates, runnerName, leaseToken, leaseExpiresAt, ['claimed', 'running']);
    if (claimed) return claimed;
  }
  return null;
}

/**
 * Try to claim a candidate row via conditional UPDATE.
 */
async function tryClaimCandidate(
  supabase: SupabaseClient,
  candidates: Array<{ id: string; attempt_count: number; max_attempts: number }>,
  runnerName: string,
  leaseToken: string,
  leaseExpiresAt: Date,
  expectedStatus: string | string[],
): Promise<string | null> {
  for (const candidate of candidates) {
    const rowId = candidate.id;
    const attemptCount = candidate.attempt_count ?? 0;
    const maxAttempts = candidate.max_attempts ?? 3;

    if (attemptCount >= maxAttempts) {
      let exhaustedQuery = supabase
        .from('profile_maintenance_jobs')
        .update({ status: 'failed', error_message: 'Max attempts exhausted', updated_at: new Date().toISOString() })
        .eq('id', rowId)
        .eq('attempt_count', attemptCount);

      if (typeof expectedStatus === 'string') {
        exhaustedQuery = exhaustedQuery.eq('status', expectedStatus);
      } else {
        exhaustedQuery = exhaustedQuery.in('status', expectedStatus);
      }

      const { error: exhaustedError } = await exhaustedQuery;
      if (exhaustedError) {
        console.warn('[ProfileMaintenanceClaim] Max-attempt status update error:', exhaustedError.message);
      }
      continue;
    }

    const now = new Date().toISOString();

    let query = supabase
      .from('profile_maintenance_jobs')
      .update({
        status: 'claimed',
        claimed_by: runnerName,
        lease_token: leaseToken,
        lease_expires_at: leaseExpiresAt.toISOString(),
        started_at: now,
        updated_at: now,
        attempt_count: attemptCount + 1,
      })
      .eq('id', rowId)
      .eq('attempt_count', attemptCount)
      .select();

    if (typeof expectedStatus === 'string') {
      query = query.eq('status', expectedStatus);
    } else {
      query = query.in('status', expectedStatus);
    }

    const { data: updatedRows, error: updateError } = await query;

    if (updateError) {
      console.warn('[ProfileMaintenanceClaim] Claim error:', updateError.message);
      continue;
    }

    if (updatedRows && Array.isArray(updatedRows) && updatedRows.length > 0) {
      return rowId;
    }
  }

  return null;
}

/**
 * Build and return the claim response for a successfully claimed job.
 */
async function buildClaimResponse(
  supabase: SupabaseClient,
  runnerName: string,
  jobId: string,
  now: Date,
): Promise<NextResponse> {
  // Load the full row
  const { data: job } = await supabase
    .from('profile_maintenance_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (!job) {
    return NextResponse.json({ error: 'Claimed job not found' }, { status: 500 });
  }

  // Update runner status
  await supabase
    .from('scraper_runners')
    .update({
      status: 'busy',
      current_job_id: job.id,
      last_seen_at: now.toISOString(),
    })
    .eq('name', runnerName);

  // Build the response matching ClaimedProfileMaintenanceJob shape
  const claimedJob: ClaimedProfileMaintenanceJob = {
    job_id: job.id,
    kind: job.kind as ClaimedProfileMaintenanceJob['kind'],
    brand_id: job.brand_id ?? undefined,
    source_slug: job.source_slug ?? undefined,
    canonical_domain: job.canonical_domain ?? undefined,
    profile_id: job.profile_id ?? undefined,
    profile_version_id: job.profile_version_id ?? undefined,
    browser_profile_id: job.browser_profile_id ?? undefined,
    payload: (job.payload as Record<string, unknown>) ?? {},
    lease_token: job.lease_token,
    lease_expires_at: job.lease_expires_at,
    attempt_count: job.attempt_count,
    max_attempts: job.max_attempts,
  };

  return NextResponse.json({ job: claimedJob });
}
