/**
 * GET /api/admin/explicit-corrections
 * POST /api/admin/explicit-corrections
 *
 * Explicit correction CRUD — create a correction or list corrections
 * scoped to brand/source/domain with optional filters.
 *
 * See docs/plans/site-extraction-profiles-implementation-plan.md §Phase 10
 * and docs/adr/0008-declarative-field-evidence-rules.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export const dynamic = 'force-dynamic';

// =============================================================================
// POST — Create a correction
// =============================================================================

/**
 * POST /api/admin/explicit-corrections
 *
 * Create a new explicit extraction correction.
 *
 * Body:
 *   brand_id          (uuid, required)
 *   source_slug       (text, required)
 *   canonical_domain  (text, required)
 *   profile_id        (uuid, optional — link to existing profile)
 *   target_field      (text, required — e.g. "product_image", "name")
 *   correction_type   ("accepted"|"rejected", required)
 *   evidence_summary  (jsonb, optional — compact evidence payload)
 *
 * Returns 201 with the created correction row.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate required fields
  const brandId = body.brand_id as string | undefined;
  const sourceSlug = body.source_slug as string | undefined;
  const canonicalDomain = body.canonical_domain as string | undefined;
  const targetField = body.target_field as string | undefined;
  const correctionType = body.correction_type as string | undefined;

  if (!brandId || typeof brandId !== 'string') {
    return NextResponse.json({ error: 'brand_id is required and must be a string' }, { status: 400 });
  }
  if (!sourceSlug || typeof sourceSlug !== 'string') {
    return NextResponse.json({ error: 'source_slug is required and must be a string' }, { status: 400 });
  }
  if (!canonicalDomain || typeof canonicalDomain !== 'string') {
    return NextResponse.json({ error: 'canonical_domain is required and must be a string' }, { status: 400 });
  }
  if (!targetField || typeof targetField !== 'string') {
    return NextResponse.json({ error: 'target_field is required and must be a string' }, { status: 400 });
  }
  if (!correctionType || !['accepted', 'rejected'].includes(correctionType)) {
    return NextResponse.json(
      { error: "correction_type is required and must be 'accepted' or 'rejected'" },
      { status: 400 },
    );
  }

  const profileId = body.profile_id as string | undefined;
  const evidenceSummary = (body.evidence_summary as Record<string, unknown>) ?? {};

  if (evidenceSummary && typeof evidenceSummary !== 'object') {
    return NextResponse.json({ error: 'evidence_summary must be a JSON object if provided' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  const { data: correction, error } = await supabase
    .from('explicit_extraction_corrections')
    .insert({
      brand_id: brandId,
      source_slug: sourceSlug,
      canonical_domain: canonicalDomain,
      ...(profileId ? { profile_id: profileId } : {}),
      target_field: targetField,
      correction_type: correctionType,
      evidence_summary: evidenceSummary,
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) {
    console.error('[ExplicitCorrections] Failed to create correction:', error.message);
    return NextResponse.json({ error: 'Failed to create correction' }, { status: 500 });
  }

  return NextResponse.json(correction, { status: 201 });
}

// =============================================================================
// GET — List corrections
// =============================================================================

/**
 * GET /api/admin/explicit-corrections
 *
 * List explicit extraction corrections. Scoped by brand/source/domain
 * when provided; otherwise returns all corrections.
 *
 * Query parameters (all optional):
 *   brand_id          — filter by brand
 *   source_slug       — filter by source
 *   canonical_domain  — filter by domain
 *   profile_id        — filter by profile
 *   target_field      — filter by field name
 *   correction_type   — filter by type ("accepted"|"rejected")
 *   limit             — max rows (default 100)
 *   offset            — pagination offset (default 0)
 *
 * Returns { corrections: [...], total: number }.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const supabase = await createAdminClient();
  const { searchParams } = new URL(request.url);

  // Build dynamic query
  let query = supabase
    .from('explicit_extraction_corrections')
    .select('*', { count: 'exact' });

  // Optional filters
  const brandId = searchParams.get('brand_id');
  const sourceSlug = searchParams.get('source_slug');
  const canonicalDomain = searchParams.get('canonical_domain');
  const profileId = searchParams.get('profile_id');
  const targetField = searchParams.get('target_field');
  const correctionType = searchParams.get('correction_type');

  if (brandId) query = query.eq('brand_id', brandId);
  if (sourceSlug) query = query.eq('source_slug', sourceSlug);
  if (canonicalDomain) query = query.eq('canonical_domain', canonicalDomain);
  if (profileId) query = query.eq('profile_id', profileId);
  if (targetField) query = query.eq('target_field', targetField);
  if (correctionType) query = query.eq('correction_type', correctionType);

  // Order by newest first
  query = query.order('created_at', { ascending: false });

  // Pagination
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 1), 500);
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10) || 0, 0);
  query = query.range(offset, offset + limit - 1);

  const { data: corrections, error, count } = await query;

  if (error) {
    console.error('[ExplicitCorrections] Failed to list corrections:', error.message);
    return NextResponse.json({ error: 'Failed to list corrections' }, { status: 500 });
  }

  return NextResponse.json({
    corrections: corrections ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}
