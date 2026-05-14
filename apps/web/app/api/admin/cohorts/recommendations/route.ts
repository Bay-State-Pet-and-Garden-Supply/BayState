import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';

// Phase 10: scraper-recommendations no longer used. Return empty recommendations.

/**
 * GET /api/admin/cohorts/recommendations?brand=KONG
 * GET /api/admin/cohorts/recommendations?cohort_id=<uuid>
 *
 * Returns ranked scraper recommendations for a brand.
 * Can resolve the brand from a cohort ID or accept a brand name directly.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const { searchParams } = request.nextUrl;
  const brandParam = searchParams.get('brand');
  const cohortIdParam = searchParams.get('cohort_id');

  let brandName: string | null = brandParam?.trim() || null;
  let brandId: string | undefined;

  // Resolve brand from cohort if no direct brand param
  if (!brandName && cohortIdParam) {
    const supabase = await createAdminClient();
    const { data: cohort } = await supabase
      .from('cohort_batches')
      .select('brand_name, brand_id, brands(name)')
      .eq('id', cohortIdParam)
      .single();

    if (cohort) {
      brandName = cohort.brand_name || null;
      brandId = cohort.brand_id || undefined;

      if (!brandName) {
        const brandRecord = Array.isArray(cohort.brands) ? cohort.brands[0] : cohort.brands;
        if (brandRecord && typeof brandRecord === 'object' && 'name' in brandRecord) {
          brandName = (brandRecord as { name: string }).name;
        }
      }
    }
  }

  if (!brandName) {
    return NextResponse.json(
      { error: 'Brand name or cohort_id with an assigned brand is required' },
      { status: 400 }
    );
  }

  // scraper-recommendations no longer used — return empty in AI-only pipeline
  return NextResponse.json({
    brand: brandName,
    recommendations: [],
    summary: {
      total: 0,
      preselected: 0,
      high_confidence: 0,
      medium_confidence: 0,
      untested: 0,
    },
  });
}
