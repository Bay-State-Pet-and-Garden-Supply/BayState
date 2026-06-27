/**
 * POST /api/admin/site-extraction-profiles/[profileId]/draft
 *
 * Enqueue a draft_site_extraction_profile job for a profile.
 *
 * Requires:
 * - Admin auth (admin or staff)
 * - Profile exists with status = 'draft'
 * - At least one verified PDP seed exists for the profile's (brand_id, source_slug, canonical_domain)
 * - No in-flight draft job already exists for this profile
 *
 * Returns 202 with the created job and profile info.
 * Does NOT crawl synchronously — the runner handles schema generation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

interface RouteContext {
  params: Promise<{ profileId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  // 1. Admin auth
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const { profileId } = await context.params;
  const supabase = await createAdminClient();

  // 2. Load profile
  const { data: profile, error: profileError } = await supabase
    .from('site_extraction_profiles')
    .select('id, brand_id, source_slug, source_type, canonical_domain, status')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  // 3. Validate profile status
  if (profile.status !== 'draft') {
    return NextResponse.json(
      { error: `Profile status must be 'draft' to create a new draft, but is '${profile.status}'` },
      { status: 400 },
    );
  }

  // 4. Check for verified PDP seeds
  const { data: verifiedSeeds, count: seedCount } = await supabase
    .from('product_detail_page_seeds')
    .select('id, url, normalized_url', { count: 'exact', head: false })
    .eq('brand_id', profile.brand_id)
    .eq('source_slug', profile.source_slug)
    .eq('canonical_domain', profile.canonical_domain)
    .eq('trust_status', 'verified');

  if (!verifiedSeeds || seedCount === 0) {
    return NextResponse.json(
      { error: 'No verified PDP seeds exist for this profile. Verify at least one PDP seed first.' },
      { status: 400 },
    );
  }

  // 5. Check for in-flight draft job (non-terminal)
  const terminalStatuses = ['succeeded', 'failed', 'timed_out', 'cancelled'];
  const { data: existingDraftJob } = await supabase
    .from('profile_maintenance_jobs')
    .select('id, kind, status, created_at')
    .eq('kind', 'draft_site_extraction_profile')
    .eq('profile_id', profileId)
    .not('status', 'in', `(${terminalStatuses.join(',')})`)
    .limit(1)
    .maybeSingle();

  if (existingDraftJob) {
    return NextResponse.json(
      {
        error: 'A draft job is already in progress for this profile',
        existingJob: {
          id: existingDraftJob.id,
          kind: existingDraftJob.kind,
          status: existingDraftJob.status,
          created_at: existingDraftJob.created_at,
        },
      },
      { status: 409 },
    );
  }

  // Check for a succeeded draft that already produced a version
  const { data: succeededDraft } = await supabase
    .from('profile_maintenance_jobs')
    .select('id, status, created_at')
    .eq('kind', 'draft_site_extraction_profile')
    .eq('profile_id', profileId)
    .eq('status', 'succeeded')
    .limit(1)
    .order('created_at', { ascending: false })
    .maybeSingle();

  if (succeededDraft) {
    // Check if a version was already created from this draft
    const { data: existingVersions } = await supabase
      .from('site_extraction_profile_versions')
      .select('id, version_number')
      .eq('profile_id', profileId)
      .limit(1);

    if (existingVersions && existingVersions.length > 0) {
      // Versions already exist — allow re-draft (will increment version_number)
      // This is fine; proceed to enqueue
    }
  }

  // 6. Enqueue draft_site_extraction_profile job
  const jobPayload = {
    profile_id: profileId,
    brand_id: profile.brand_id,
    source_slug: profile.source_slug,
    canonical_domain: profile.canonical_domain,
    verified_seed_ids: verifiedSeeds.map((s) => s.id),
    verified_seed_urls: verifiedSeeds.map((s) => s.url),
  };

  const requiredCapabilities = [
    'profile_maintenance',
    'profile_maintenance.draft_site_extraction_profile',
    'profile_maintenance.model_schema_draft',
    'profile_maintenance.crawl4ai',
  ];

  const { data: job, error: jobError } = await supabase
    .from('profile_maintenance_jobs')
    .insert({
      kind: 'draft_site_extraction_profile',
      status: 'queued',
      brand_id: profile.brand_id,
      source_slug: profile.source_slug,
      canonical_domain: profile.canonical_domain,
      profile_id: profileId,
      payload: jobPayload,
      required_capabilities: requiredCapabilities,
      max_attempts: 3,
      attempt_count: 0,
    })
    .select('id, kind, status, created_at')
    .single();

  if (jobError) {
    console.error('[DraftProfile] Failed to enqueue draft job:', jobError);
    return NextResponse.json({ error: 'Failed to enqueue draft job' }, { status: 500 });
  }

  return NextResponse.json(
    {
      job: {
        id: job.id,
        kind: job.kind,
        status: job.status,
        created_at: job.created_at,
      },
      profileId,
      verifiedSeedCount: seedCount,
    },
    { status: 202 },
  );
}
