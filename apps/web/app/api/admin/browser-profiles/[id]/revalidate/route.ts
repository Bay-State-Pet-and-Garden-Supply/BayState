/**
 * POST /api/admin/browser-profiles/[id]/revalidate
 *
 * Enqueue a revalidation job for an existing browser profile.
 *
 * Flow:
 * 1. Validate admin auth
 * 2. Load browser_profiles row by id
 * 3. Validate profile is not revoked
 * 4. Check no in-flight revalidation exists
 * 5. Insert browser_profile_setup_requests row (request_type='revalidate')
 * 6. Enqueue profile_maintenance_jobs with kind='browser_profile_revalidate'
 * 7. Update setup_request with maintenance_job_id
 * 8. Return 202
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

// =============================================================================
// POST
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const supabase = await createAdminClient();
  const { id: browserProfileId } = await params;

  // 1. Load browser profile
  const { data: profile, error: profileError } = await supabase
    .from('browser_profiles')
    .select('id, brand_id, source_slug, canonical_domain, status, storage_ref, last_validated_at, environment')
    .eq('id', browserProfileId)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Browser profile not found' }, { status: 404 });
  }

  // 2. Validate profile can be revalidated
  if (profile.status === 'revoked') {
    return NextResponse.json(
      { error: 'Revoked browser profiles cannot be revalidated' },
      { status: 400 },
    );
  }

  // 3. Parse request body
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine for revalidation
  }

  const targetPdpSeedIds = Array.isArray(body.target_pdp_seed_ids)
    ? body.target_pdp_seed_ids.filter((s): s is string => typeof s === 'string')
    : [];

  // 4. Check for in-flight revalidation request
  const { data: inFlightRequest } = await supabase
    .from('browser_profile_setup_requests')
    .select('id, status')
    .eq('browser_profile_id', browserProfileId)
    .eq('request_type', 'revalidate')
    .not('status', 'in', '("completed","failed","cancelled")')
    .limit(1)
    .maybeSingle();

  if (inFlightRequest) {
    return NextResponse.json(
      {
        error: 'An in-flight revalidation request already exists for this browser profile',
        existingSetupRequestId: inFlightRequest.id,
        existingStatus: inFlightRequest.status,
      },
      { status: 409 },
    );
  }

  // 5. Build required capabilities
  const requiredCapabilities = [
    'profile_maintenance',
    'profile_maintenance.browser_profile_runtime',
  ];

  // 6. Enqueue profile_maintenance_jobs
  const jobPayload: Record<string, unknown> = {
    browser_profile_id: browserProfileId,
    brand_id: profile.brand_id,
    source_slug: profile.source_slug,
    canonical_domain: profile.canonical_domain,
    storage_ref: profile.storage_ref,
    environment: profile.environment || 'production',
    target_pdp_seed_ids: targetPdpSeedIds,
  };

  const { data: job, error: jobError } = await supabase
    .from('profile_maintenance_jobs')
    .insert({
      kind: 'browser_profile_revalidate',
      status: 'queued',
      brand_id: profile.brand_id,
      source_slug: profile.source_slug,
      canonical_domain: profile.canonical_domain,
      browser_profile_id: browserProfileId,
      payload: jobPayload,
      required_capabilities: requiredCapabilities,
      max_attempts: 3,
      attempt_count: 0,
    })
    .select('id, kind, status, created_at')
    .single();

  if (jobError || !job) {
    console.error('[BrowserProfileRevalidate] Failed to enqueue job:', jobError);
    return NextResponse.json(
      { error: 'Failed to enqueue revalidation job' },
      { status: 500 },
    );
  }

  // 7. Insert browser_profile_setup_requests row
  const { data: setupRequest, error: setupError } = await supabase
    .from('browser_profile_setup_requests')
    .insert({
      browser_profile_id: browserProfileId,
      request_type: 'revalidate',
      status: 'pending',
      maintenance_job_id: job.id,
      target_pdp_seed_ids: targetPdpSeedIds,
    })
    .select('id, browser_profile_id, request_type, status, maintenance_job_id')
    .single();

  if (setupError || !setupRequest) {
    console.error('[BrowserProfileRevalidate] Failed to create setup request:', setupError);
  }

  // 8. Return 202
  return NextResponse.json(
    {
      browserProfile: {
        id: profile.id,
        brand_id: profile.brand_id,
        source_slug: profile.source_slug,
        canonical_domain: profile.canonical_domain,
        status: profile.status,
        storage_ref: profile.storage_ref,
        last_validated_at: profile.last_validated_at,
      },
      setupRequest: setupRequest
        ? {
            id: setupRequest.id,
            browser_profile_id: setupRequest.browser_profile_id,
            request_type: setupRequest.request_type,
            status: setupRequest.status,
            maintenance_job_id: setupRequest.maintenance_job_id,
          }
        : null,
      job: {
        id: job.id,
        kind: job.kind,
        status: job.status,
        created_at: job.created_at,
      },
    },
    { status: 202 },
  );
}
