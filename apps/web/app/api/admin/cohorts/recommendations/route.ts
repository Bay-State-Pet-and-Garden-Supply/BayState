import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getScraperRecommendations } from '@/lib/pipeline/scraper-recommendations';

/**
 * GET /api/admin/cohorts/recommendations?brand=KONG
 * GET /api/admin/cohorts/recommendations?cohort_id=<uuid>
 *
 * Returns ranked scraper recommendations for a brand.
 * Can resolve the brand from a cohort ID or accept a brand name directly.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const brandParam = searchParams.get('brand');
  const cohortIdParam = searchParams.get('cohort_id');

  let brandName: string | null = brandParam?.trim() || null;

  // Resolve brand from cohort if no direct brand param
  if (!brandName && cohortIdParam) {
    const supabase = await createClient();
    const { data: cohort } = await supabase
      .from('cohort_batches')
      .select('brand_name, brand_id, brands(name)')
      .eq('id', cohortIdParam)
      .single();

    if (cohort) {
      brandName = cohort.brand_name || null;

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

  const recommendations = await getScraperRecommendations(brandName);

  return NextResponse.json({
    brand: brandName,
    recommendations,
    summary: {
      total: recommendations.length,
      preselected: recommendations.filter((r) => r.preselected).length,
      high_confidence: recommendations.filter((r) => r.confidence === 'high').length,
      medium_confidence: recommendations.filter((r) => r.confidence === 'medium').length,
      untested: recommendations.filter((r) => r.confidence === 'untested').length,
    },
  });
}
