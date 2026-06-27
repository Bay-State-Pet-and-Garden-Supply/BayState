/**
 * POST /api/admin/brands/[id]/source-setup/pdp-seeds
 *
 * Create a product_detail_page_seeds candidate and enqueue a verify_pdp_seed
 * profile-maintenance job.
 *
 * Requires that a source setup (official domain) has already been saved.
 * Validates that the PDP URL host matches the canonical domain.
 * Does NOT crawl synchronously.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { normalizeDomain } from '@/lib/approved-sources/source-plan';

// =============================================================================
// URL normalization
// =============================================================================

/**
 * Normalize a URL for duplicate checking:
 * - Lowercase hostname
 * - Strip fragment
 * - Normalize trailing slash
 */
function normalizePdpUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = '';
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.protocol}//${url.hostname.toLowerCase()}${path}${url.search}`;
  } catch {
    return raw.toLowerCase().trim();
  }
}

/**
 * Validate that a PDP URL's host matches or is a subdomain of the canonical domain.
 * Both sides are normalized (strip www, lowercase, etc.) so that
 * www.example.com and example.com are treated as the same canonical domain.
 */
function hostMatchesDomain(hostname: string, canonicalDomain: string): boolean {
  const h = normalizeDomain(hostname);
  const d = normalizeDomain(canonicalDomain);
  // Exact match
  if (h === d) return true;
  // Subdomain match
  if (h.endsWith('.' + d)) return true;
  return false;
}

// =============================================================================
// POST — Create PDP seed and enqueue verification job
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  // 1. Parse request body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const url = body.url;
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  const rawUrl = url.trim();

  // 2. Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: 'URL must use http or https protocol' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  // 3. Fetch brand
  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('id, name, slug, official_domains')
    .eq('id', id)
    .single();

  if (brandError || !brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  const brandSlug = brand.slug as string;

  // 4. Verify source setup exists (require canonical domain)
  const { data: profile } = await supabase
    .from('site_extraction_profiles')
    .select('id, canonical_domain, source_slug')
    .eq('brand_id', id)
    .eq('source_slug', brandSlug)
    .eq('source_type', 'official_brand')
    .limit(1)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json(
      { error: 'Brand source setup not configured. Save an official domain first.' },
      { status: 400 },
    );
  }

  const canonicalDomain = profile.canonical_domain;
  const hostname = parsedUrl.hostname;

  // 5. Validate host matches canonical domain
  if (!hostMatchesDomain(hostname, canonicalDomain)) {
    return NextResponse.json(
      { error: `URL domain "${hostname}" does not match the brand's canonical domain "${canonicalDomain}"` },
      { status: 400 },
    );
  }

  // 6. Normalize URL
  const normalizedUrl = normalizePdpUrl(rawUrl);

  // ===========================================================================
  // Helper: enqueue a verify_pdp_seed job for a given seed
  // ===========================================================================
  async function enqueueVerifyPdpSeed(seedId: string) {
    const jobPayload = {
      pdp_seed_id: seedId,
      url: rawUrl,
      normalized_url: normalizedUrl,
      brand_id: id,
      source_slug: brandSlug,
      canonical_domain: canonicalDomain,
    };

    const requiredCapabilities = [
      'profile_maintenance',
      'profile_maintenance.verify_pdp_seed',
      'profile_maintenance.crawl4ai',
    ];

    const { data: job, error: jobError } = await supabase
      .from('profile_maintenance_jobs')
      .insert({
        kind: 'verify_pdp_seed',
        status: 'queued',
        brand_id: id,
        source_slug: brandSlug,
        canonical_domain: canonicalDomain,
        payload: jobPayload,
        required_capabilities: requiredCapabilities,
        max_attempts: 3,
        attempt_count: 0,
      })
      .select('id, kind, status, created_at')
      .single();

    if (jobError) {
      console.warn('[PdpSeeds] Failed to enqueue verification job for seed', seedId, ':', jobError.message);
      return null;
    }

    return { id: job.id, kind: job.kind, status: job.status, created_at: job.created_at };
  }

  // ===========================================================================
  // Helper: process a seed (existing or newly created) — ensure a verify job exists
  // ===========================================================================
  async function ensureVerificationJob(seed: {
    id: string; url: string; normalized_url: string;
    trust_status: string; verification_artifact_id?: string | null; created_at: string;
  }): Promise<NextResponse> {
    const terminalStatuses = ['succeeded', 'failed', 'timed_out', 'cancelled'];
    // Check if there's already a non-terminal verify_pdp_seed job for this seed
    const { data: existingJob } = await supabase
      .from('profile_maintenance_jobs')
      .select('id, kind, status, created_at')
      .eq('kind', 'verify_pdp_seed')
      .eq('payload->>pdp_seed_id', seed.id)
      .not('status', 'in', `(${terminalStatuses.join(',')})`)
      .limit(1)
      .maybeSingle();

    let verificationJob: { id: string; kind: string; status: string; created_at: string } | null = existingJob ?? null;

    // If no active job, enqueue a new one
    if (!verificationJob) {
      verificationJob = await enqueueVerifyPdpSeed(seed.id);
    }

    // Build response (always return 200 for existing seeds, 201 for new)
    return NextResponse.json({
      pdpSeed: {
        id: seed.id,
        url: seed.url,
        normalized_url: seed.normalized_url,
        trust_status: seed.trust_status,
        created_at: seed.created_at,
      },
      verificationJob,
    });
  }

  // ===========================================================================
  // Step 7-8: Create or reuse seed (race-safe via unique-violation catch)
  // ===========================================================================

  // Insert the seed row — if a unique violation occurs (race), fetch existing
  const { data: newSeed, error: seedError } = await supabase
    .from('product_detail_page_seeds')
    .insert({
      brand_id: id,
      source_slug: brandSlug,
      canonical_domain: canonicalDomain,
      url: rawUrl,
      normalized_url: normalizedUrl,
      trust_status: 'candidate',
      created_by: auth.user.id,
    })
    .select('id, url, normalized_url, trust_status, verification_artifact_id, created_at')
    .single();

  if (!seedError && newSeed) {
    // Fresh seed created — enqueue verification and return 201
    const verificationJob = await enqueueVerifyPdpSeed(newSeed.id);
    return NextResponse.json(
      {
        pdpSeed: {
          id: newSeed.id,
          url: newSeed.url,
          normalized_url: newSeed.normalized_url,
          trust_status: newSeed.trust_status,
          created_at: newSeed.created_at,
        },
        verificationJob,
      },
      { status: 201 },
    );
  }

  // If unique violation (race with concurrent request), fetch and reuse existing seed
  if (seedError && (seedError as { code?: string }).code === '23505') {
    const { data: existingSeed } = await supabase
      .from('product_detail_page_seeds')
      .select('id, url, normalized_url, trust_status, verification_artifact_id, created_at')
      .eq('brand_id', id)
      .eq('source_slug', brandSlug)
      .eq('canonical_domain', canonicalDomain)
      .eq('normalized_url', normalizedUrl)
      .limit(1)
      .maybeSingle();

    if (existingSeed) {
      if (existingSeed.trust_status === 'verified') {
        return NextResponse.json(
          {
            error: 'PDP seed already exists and is verified',
            existing: {
              id: existingSeed.id,
              url: existingSeed.url,
              normalized_url: existingSeed.normalized_url,
              trust_status: existingSeed.trust_status,
              verification_artifact_id: existingSeed.verification_artifact_id,
              created_at: existingSeed.created_at,
            },
          },
          { status: 409 },
        );
      }

      // Non-verified existing seed from race — ensure a verification job exists
      return ensureVerificationJob(existingSeed);
    }
  }

  // Unexpected error
  console.error('[PdpSeeds] Failed to create PDP seed:', seedError);
  return NextResponse.json(
    { error: seedError?.message ?? 'Failed to create PDP seed' },
    { status: 500 },
  );
}
