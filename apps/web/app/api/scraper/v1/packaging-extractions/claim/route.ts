/**
 * POST /api/scraper/v1/packaging-extractions/claim
 *
 * Runner claim endpoint for packaging extraction jobs.
 *
 * The scraper runner polls this endpoint to claim the next queued
 * packaging extraction. Only runners with packaging_vision capability
 * enabled may claim these jobs.
 *
 * Flow:
 * 1. Validate runner auth via API key
 * 2. Check runner is enabled and has packaging_vision capability
 * 3. Atomically claim a queued product_packaging_extractions row
 * 4. Set lease and return image URLs and prompt metadata
 *
 * Claim rules:
 * - Only runners with packaging_vision.enabled = true
 * - Skip stale terminal rows
 * - Lease: 10 minutes, renewable via heartbeat
 * - Expired leases become claimable again until max_attempts
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, type SupabaseClient } from '@/lib/supabase/server';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import crypto from 'crypto';

interface PackagingVisionCapability {
  enabled: boolean;
  model?: string;
  max_images?: number;
  max_concurrency?: number;
}

interface ClaimRequestBody {
  runner_name?: string;
  max_attempts?: number;
  capabilities?: {
    packaging_vision?: PackagingVisionCapability;
  };
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
    const packagingVision = capabilities?.packaging_vision as PackagingVisionCapability | undefined;

    // Accept capabilities from the request body if runner metadata doesn't have them
    if ((!packagingVision?.enabled) && claimBody.capabilities?.packaging_vision?.enabled) {
      packagingVision = claimBody.capabilities.packaging_vision;
      // Persist to runner metadata for future claims
      const updatedCaps = { ...(capabilities || {}), packaging_vision: packagingVision };
      await supabase
        .from('scraper_runners')
        .update({ metadata: { ...metadata, capabilities: updatedCaps } })
        .eq('name', runnerName);
    }

    if (!packagingVision?.enabled) {
      return NextResponse.json(
        { job: null, reason: 'Runner does not advertise packaging_vision capability' },
        { status: 200 },
      );
    }

    // 3. Atomically claim a queued row then fall back to expired leases.
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    const leaseToken = crypto.randomUUID();

    // Phase 1: Try an RPC call (preferred — atomic, single round-trip)
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'claim_next_packaging_extraction',
      {
        p_runner_name: runnerName,
        p_lease_token: leaseToken,
        p_lease_expires_at: leaseExpiresAt.toISOString(),
      },
    );

    // If RPC succeeded and returned an id, we're done
    if (!rpcError && rpcResult) {
      return await buildClaimResponse(supabase, runnerName, rpcResult as string, now);
    }

    // RPC failed or doesn't exist yet — use fallback queries
    if (rpcError) {
      console.warn('[PackagingClaim] RPC not available, using fallback:', rpcError.message);
    }

    // Phase 2: Try to claim a queued row via conditional UPDATE
    const claimedId = await claimQueuedWithUpdate(supabase, runnerName, leaseToken, leaseExpiresAt);

    if (claimedId) {
      return await buildClaimResponse(supabase, runnerName, claimedId, now);
    }

    // Phase 3: Try an expired-lease row
    const expiredId = await claimExpiredWithUpdate(supabase, runnerName, leaseToken, leaseExpiresAt);

    if (expiredId) {
      return await buildClaimResponse(supabase, runnerName, expiredId, now);
    }

    return NextResponse.json({ job: null }, { status: 200 });
  } catch (err) {
    console.error('[PackagingClaim] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Claim a queued row by first finding one, then doing a conditional UPDATE.
 * Returns the row id or null.
 */
async function claimQueuedWithUpdate(
  supabase: SupabaseClient,
  runnerName: string,
  leaseToken: string,
  leaseExpiresAt: Date,
): Promise<string | null> {
  const { data: rows } = await supabase
    .from('product_packaging_extractions')
    .select('id, attempt_count, max_attempts')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(10);

  if (!rows || rows.length === 0) return null;

  // Try each candidate, respecting per-row attempt limits
  for (const candidate of rows) {
    const rowId = candidate.id as string;
    const attemptCount = (candidate.attempt_count as number) ?? 0;
    const maxAttempts = (candidate.max_attempts as number) ?? 2;

    if (attemptCount >= maxAttempts) {
      await supabase
        .from('product_packaging_extractions')
        .update({ status: 'failed', error_message: 'Max attempts exhausted', updated_at: new Date().toISOString() })
        .eq('id', rowId);
      continue;
    }

    const now = new Date().toISOString();

    const { data: updatedRows, error: updateError } = await supabase
      .from('product_packaging_extractions')
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
      .eq('status', 'queued')
      .eq('attempt_count', attemptCount)
      .select();

    if (updateError) {
      console.warn('[PackagingClaim] Queued claim error:', updateError.message);
      continue;
    }

    if (updatedRows && Array.isArray(updatedRows) && updatedRows.length > 0) {
      return rowId;
    }
  }

  return null;
}

/**
 * Claim a row that has an expired lease.
 * Increments attempt_count, honors max_attempts.
 * Returns the row id or null.
 */
async function claimExpiredWithUpdate(
  supabase: SupabaseClient,
  runnerName: string,
  leaseToken: string,
  leaseExpiresAt: Date,
): Promise<string | null> {
  const gracePeriod = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  const { data: rows } = await supabase
    .from('product_packaging_extractions')
    .select('id, attempt_count, max_attempts')
    .in('status', ['claimed', 'running'])
    .lt('lease_expires_at', gracePeriod)
    .order('created_at', { ascending: true })
    .limit(10);

  if (!rows || rows.length === 0) return null;

  for (const candidate of rows) {
    const rowId = candidate.id as string;
    const attemptCount = (candidate.attempt_count as number) ?? 0;
    const maxAttempts = (candidate.max_attempts as number) ?? 2;

    if (attemptCount >= maxAttempts) {
      await supabase
        .from('product_packaging_extractions')
        .update({ status: 'failed', error_message: 'Max attempts exhausted', updated_at: new Date().toISOString() })
        .eq('id', rowId);
      continue;
    }

    const now = new Date().toISOString();

    const { data: updatedRows, error: updateError } = await supabase
      .from('product_packaging_extractions')
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
      .in('status', ['claimed', 'running'])
      .lt('lease_expires_at', gracePeriod)
      .eq('attempt_count', attemptCount)
      .select();

    if (updateError) {
      console.warn('[PackagingClaim] Expired claim error:', updateError.message);
      continue;
    }

    if (updatedRows && Array.isArray(updatedRows) && updatedRows.length > 0) {
      return rowId;
    }
  }

  return null;
}

/**
 * Build and return the claim response for a successfully claimed extraction.
 */
async function buildClaimResponse(
  supabase: SupabaseClient,
  runnerName: string,
  extractionId: string,
  now: Date,
): Promise<NextResponse> {
  // Load the full row
  const { data: extraction } = await supabase
    .from('product_packaging_extractions')
    .select('*')
    .eq('id', extractionId)
    .single();

  if (!extraction) {
    return NextResponse.json({ error: 'Claimed row not found' }, { status: 500 });
  }

  // Update runner status
  await supabase
    .from('scraper_runners')
    .update({
      status: 'busy',
      current_job_id: extraction.id,
      last_seen_at: now.toISOString(),
    })
    .eq('name', runnerName);

  return NextResponse.json({
    job: {
      extraction_id: extraction.id,
      upc: extraction.upc,
      image_urls: extraction.image_urls ?? [],
      prompt_version: extraction.prompt_version,
      schema_version: extraction.schema_version,
      lease_token: extraction.lease_token,
      lease_expires_at: extraction.lease_expires_at,
    },
  });
}
