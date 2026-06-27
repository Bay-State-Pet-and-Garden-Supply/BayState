/**
 * POST /api/admin/browser-profiles/setup-requests
 *
 * Create a Browser Profile setup request for a brand+source+domain.
 *
 * Flow:
 * 1. Validate admin auth
 * 2. Upsert browser_profiles row (find by scope or create new with status='requested')
 * 3. Insert browser_profile_setup_requests row (request_type='setup', status='pending')
 * 4. Enqueue profile_maintenance_jobs with kind='browser_profile_setup'
 * 5. Update setup_request with maintenance_job_id
 * 6. Return 202 with browserProfile, setupRequest, job
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth, requireAdminOnlyAuth } from '@/lib/admin/api-auth';

// =============================================================================
// POST
// =============================================================================

export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const supabase = await createAdminClient();

  // 1. Parse request body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // 2. Validate required fields
  const brandId = body.brand_id;
  if (!brandId || typeof brandId !== 'string') {
    return NextResponse.json({ error: 'brand_id is required' }, { status: 400 });
  }

  const sourceSlug = body.source_slug;
  if (!sourceSlug || typeof sourceSlug !== 'string') {
    return NextResponse.json({ error: 'source_slug is required' }, { status: 400 });
  }

  const canonicalDomain = body.canonical_domain;
  if (!canonicalDomain || typeof canonicalDomain !== 'string') {
    return NextResponse.json({ error: 'canonical_domain is required' }, { status: 400 });
  }

  const environment = (typeof body.environment === 'string' && body.environment.trim())
    ? body.environment.trim()
    : 'production';

  const required = body.required === true;
  const targetPdpSeedIds = Array.isArray(body.target_pdp_seed_ids)
    ? body.target_pdp_seed_ids.filter((s): s is string => typeof s === 'string')
    : [];
  const runnerPool = typeof body.runner_pool === 'string' ? body.runner_pool.trim() : undefined;
  const runnerName = typeof body.runner_name === 'string' ? body.runner_name.trim() : undefined;

  // 3. If required=true, require admin-only auth (not staff)
  if (required) {
    const adminAuth = await requireAdminOnlyAuth(request);
    if (!adminAuth.authorized) return adminAuth.response;
  }

  // 4. Verify brand exists
  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('id, name, slug')
    .eq('id', brandId)
    .single();

  if (brandError || !brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  // 5. Upsert browser_profiles row (find existing or create new)
  const { data: existingProfile } = await supabase
    .from('browser_profiles')
    .select('id, status, required')
    .eq('brand_id', brandId)
    .eq('source_slug', sourceSlug)
    .eq('canonical_domain', canonicalDomain)
    .eq('environment', environment)
    .maybeSingle();

  let browserProfileId: string;
  let browserProfileStatus: string;

  if (existingProfile) {
    browserProfileId = existingProfile.id;
    browserProfileStatus = existingProfile.status;

    // If required is being set to true for existing profile, update it
    if (required && !existingProfile.required) {
      await supabase
        .from('browser_profiles')
        .update({
          required: true,
          runner_pool: runnerPool ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', browserProfileId);
    }
  } else {
    // Create new browser_profiles row with status='requested'
    const { data: newProfile, error: createError } = await supabase
      .from('browser_profiles')
      .insert({
        brand_id: brandId,
        source_slug: sourceSlug,
        canonical_domain: canonicalDomain,
        environment,
        required,
        runner_pool: runnerPool ?? null,
        status: 'requested',
      })
      .select('id, status, required')
      .single();

    if (createError || !newProfile) {
      console.error('[BrowserProfileSetup] Failed to create browser profile:', createError);
      return NextResponse.json(
        { error: 'Failed to create browser profile' },
        { status: 500 },
      );
    }

    browserProfileId = newProfile.id;
    browserProfileStatus = newProfile.status;
  }

  // 6. Check for in-flight setup request (non-terminal, prevents duplicate)
  const { data: inFlightRequest } = await supabase
    .from('browser_profile_setup_requests')
    .select('id, status')
    .eq('browser_profile_id', browserProfileId)
    .eq('request_type', 'setup')
    .not('status', 'in', '("completed","failed","cancelled")')
    .limit(1)
    .maybeSingle();

  if (inFlightRequest) {
    return NextResponse.json(
      {
        error: 'An in-flight setup request already exists for this browser profile',
        existingSetupRequestId: inFlightRequest.id,
        existingStatus: inFlightRequest.status,
      },
      { status: 409 },
    );
  }

  // 7. Build required capabilities
  const requiredCapabilities = [
    'profile_maintenance',
    'profile_maintenance.browser_profile_setup',
    'profile_maintenance.crawl4ai',
  ];

  // 8. Enqueue profile_maintenance_jobs
  const jobPayload: Record<string, unknown> = {
    browser_profile_id: browserProfileId,
    brand_id: brandId,
    source_slug: sourceSlug,
    canonical_domain: canonicalDomain,
    environment,
    target_pdp_seed_ids: targetPdpSeedIds,
  };

  const { data: job, error: jobError } = await supabase
    .from('profile_maintenance_jobs')
    .insert({
      kind: 'browser_profile_setup',
      status: 'queued',
      brand_id: brandId,
      source_slug: sourceSlug,
      canonical_domain: canonicalDomain,
      browser_profile_id: browserProfileId,
      payload: jobPayload,
      required_capabilities: requiredCapabilities,
      max_attempts: 3,
      attempt_count: 0,
    })
    .select('id, kind, status, created_at')
    .single();

  if (jobError || !job) {
    console.error('[BrowserProfileSetup] Failed to enqueue job:', jobError);
    return NextResponse.json(
      { error: 'Failed to enqueue setup job' },
      { status: 500 },
    );
  }

  // 9. Insert browser_profile_setup_requests row
  const { data: setupRequest, error: setupError } = await supabase
    .from('browser_profile_setup_requests')
    .insert({
      browser_profile_id: browserProfileId,
      request_type: 'setup',
      status: 'pending',
      maintenance_job_id: job.id,
      target_pdp_seed_ids: targetPdpSeedIds,
      assigned_runner: runnerName ?? null,
    })
    .select('id, browser_profile_id, request_type, status, maintenance_job_id')
    .single();

  if (setupError || !setupRequest) {
    console.error('[BrowserProfileSetup] Failed to create setup request:', setupError);
    // Non-fatal: job is already enqueued, profile row exists
  }

  // 10. Return 202
  return NextResponse.json(
    {
      browserProfile: {
        id: browserProfileId,
        brand_id: brandId,
        source_slug: sourceSlug,
        canonical_domain: canonicalDomain,
        status: browserProfileStatus === 'requested' ? 'requested' : browserProfileStatus,
        required,
        environment,
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
