/**
 * Brand Source Setup API
 *
 * GET  /api/admin/brands/[id]/source-setup  — Return setup summary
 * PUT  /api/admin/brands/[id]/source-setup  — Save/update official domain
 *
 * See handoff/brand-source-setup-api-next-slice-plan.md for full contract.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { isCascadeConfigured } from '@/lib/approved-sources/source-cascade';
import { normalizeDomain, isDisallowed } from '@/lib/approved-sources/source-plan';
import { DISALLOWED_DOMAINS } from '@/lib/approved-sources/types';

// =============================================================================
// Shared helpers
// =============================================================================

/**
 * Basic domain format validation.
 */
function isValidDomain(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return false;

  try {
    const url = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`);
    const hostname = url.hostname;
    // Must have at least one dot and be a valid hostname
    return hostname.includes('.') && hostname.length >= 3;
  } catch {
    return false;
  }
}

/**
 * Validate and prepare the PUT request body.
 * Only accepts official_domain; source_slug and source_type are forced server-side.
 */
function validatePutBody(body: Record<string, unknown>):
  | { valid: true; officialDomain: string }
  | { valid: false; error: string; status: number }
{
  const officialDomain = body.official_domain;
  if (!officialDomain || typeof officialDomain !== 'string') {
    return { valid: false, error: 'official_domain is required', status: 400 };
  }

  if (!isValidDomain(officialDomain)) {
    return { valid: false, error: `Invalid domain format: "${officialDomain}"`, status: 400 };
  }

  return { valid: true, officialDomain: officialDomain.trim() };
}

// =============================================================================
// GET — Return source setup summary
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  const supabase = await createAdminClient();

  // 1. Fetch brand
  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('id, name, slug, official_domains, preferred_domains')
    .eq('id', id)
    .single();

  if (brandError || !brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  const brandSlug = brand.slug as string;
  const officialDomains = (brand.official_domains ?? []) as string[];

  // 2. Fetch site_extraction_profiles for this brand (official_brand source_slug)
  const { data: profiles } = await supabase
    .from('site_extraction_profiles')
    .select('*')
    .eq('brand_id', id)
    .eq('source_slug', brandSlug)
    .eq('source_type', 'official_brand')
    .limit(1)
    .maybeSingle();

  const profile = profiles ?? null;
  const canonicalDomain = profile?.canonical_domain ?? (officialDomains.length > 0 ? officialDomains[0] : null);

  // 3. Fetch PDP seeds for this brand/source/domain
  let pdpSeeds: Array<Record<string, unknown>> = [];
  if (canonicalDomain) {
    const { data: seeds } = await supabase
      .from('product_detail_page_seeds')
      .select('id, url, normalized_url, trust_status, verification_artifact_id, created_at')
      .eq('brand_id', id)
      .eq('source_slug', brandSlug)
      .eq('canonical_domain', canonicalDomain)
      .order('created_at', { ascending: false });

    pdpSeeds = (seeds ?? []) as Array<Record<string, unknown>>;
  }

  // 4. Cascade readiness
  const configured = await isCascadeConfigured(supabase, id);

  // 5. Build response
  return NextResponse.json({
    brand: {
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      official_domains: brand.official_domains,
      preferred_domains: brand.preferred_domains,
    },
    sourceSetup: {
      hasOfficialDomain: officialDomains.length > 0,
      siteExtractionProfile: profile
        ? {
            id: profile.id,
            brand_source_id: profile.brand_source_id,
            source_slug: profile.source_slug,
            source_type: profile.source_type,
            canonical_domain: profile.canonical_domain,
            status: profile.status,
            active_version_id: profile.active_version_id,
            profile_setup_completed_at: profile.profile_setup_completed_at,
          }
        : {
            id: null,
            brand_source_id: null,
            source_slug: brandSlug,
            source_type: 'official_brand',
            canonical_domain: canonicalDomain,
            status: null,
            active_version_id: null,
            profile_setup_completed_at: null,
          },
      pdpSeeds: pdpSeeds.map((s) => ({
        id: s.id,
        url: s.url,
        normalized_url: s.normalized_url,
        trust_status: s.trust_status,
        verification_artifact_id: s.verification_artifact_id,
        created_at: s.created_at,
      })),
      cascadeReadiness: {
        configured,
      },
    },
  });
}

// =============================================================================
// PUT — Save/update official domain and source setup
// =============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  // 1. Parse and validate body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = validatePutBody(body);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const normalizedDomain = normalizeDomain(validation.officialDomain);

  // 2. Reject disallowed marketplace/blog/common non-product domains
  if (isDisallowed(normalizedDomain)) {
    return NextResponse.json(
      {
        error: `Domain "${normalizedDomain}" is not allowed. This domain is in the disallowed list and cannot be used as a brand source.`,
        disallowedDomain: normalizedDomain,
        disallowedList: DISALLOWED_DOMAINS,
      },
      { status: 400 },
    );
  }

  const supabase = await createAdminClient();

  // 3. Fetch brand
  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('id, name, slug, official_domains, preferred_domains')
    .eq('id', id)
    .single();

  if (brandError || !brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  const brandSlug = brand.slug as string;
  const sourceType = 'official_brand';

  // 3. Upsert official_domains on brand
  const currentDomains: string[] = (brand.official_domains ?? []) as string[];
  if (!currentDomains.includes(normalizedDomain)) {
    currentDomains.push(normalizedDomain);
  }

  const { error: brandUpdateError } = await supabase
    .from('brands')
    .update({ official_domains: currentDomains })
    .eq('id', id);

  if (brandUpdateError) {
    console.error('[BrandSourceSetup] Failed to update brand official_domains:', brandUpdateError);
    return NextResponse.json({ error: brandUpdateError.message }, { status: 500 });
  }

  // 4. Upsert official_brand brand_sources row (follow pattern from brands/route.ts)
  const sourceData = {
    brand_id: id,
    source_type: sourceType,
    source_slug: brandSlug,
    display_name: (brand.name as string) ?? brandSlug,
    domains: currentDomains,
    asset_domains: [],
    crawl4ai_adapter_slug: 'crawl4ai_direct',
    requires_auth: false,
    credential_ref: null,
    search_mode: 'domain_search',
    allowed_fields: ['title', 'description', 'images', 'ingredients', 'guaranteed_analysis', 'category'],
    priority: 50,
    enabled: true,
  };

  const { data: brandSource, error: sourceError } = await supabase
    .from('brand_sources')
    .upsert(sourceData, { onConflict: 'brand_id,source_type,source_slug' })
    .select('id')
    .single();

  if (sourceError || !brandSource) {
    console.error('[BrandSourceSetup] Failed to upsert brand_source:', sourceError);
    return NextResponse.json({ error: sourceError?.message ?? 'Failed to upsert brand source' }, { status: 500 });
  }

  const brandSourceId = brandSource.id as string;

  // 5. Upsert site_extraction_profiles row
  const profileData = {
    brand_id: id,
    brand_source_id: brandSourceId,
    source_slug: brandSlug,
    source_type: sourceType,
    canonical_domain: normalizedDomain,
    status: 'draft',
    metadata: {},
  };

  const { error: profileError } = await supabase
    .from('site_extraction_profiles')
    .upsert(profileData, {
      onConflict: 'brand_id,source_slug,canonical_domain',
      ignoreDuplicates: false,
    });

  if (profileError) {
    console.error('[BrandSourceSetup] Failed to upsert site_extraction_profile:', profileError);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // 6. Return updated summary (same shape as GET)
  // Build inline response instead of re-calling GET to avoid duplicating
  // auth checks and DB fetches. This keeps the response shape consistent.
  const configured = await isCascadeConfigured(supabase, id);

  return NextResponse.json({
    brand: {
      id: brand.id,
      name: brand.name,
      slug: brandSlug,
      official_domains: currentDomains,
      preferred_domains: (brand.preferred_domains as string[] | undefined) ?? [],
    },
    sourceSetup: {
      hasOfficialDomain: currentDomains.length > 0,
      siteExtractionProfile: {
        id: null,
        brand_source_id: brandSourceId,
        source_slug: brandSlug,
        source_type: sourceType,
        canonical_domain: normalizedDomain,
        status: 'draft',
        active_version_id: null,
        profile_setup_completed_at: null,
      },
      pdpSeeds: [],
      cascadeReadiness: {
        configured,
      },
    },
  });
}
