import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { recohortProducts } from '@/lib/pipeline/cohorts';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/pipeline/bulk/brand
 * Bulk assign a brand to multiple products and split them into pure cohorts.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { skus, brandId } = body as {
      skus: string[];
      brandId: string | null;
    };

    if (!skus || !Array.isArray(skus) || skus.length === 0) {
      return NextResponse.json(
        { error: 'SKUs array is required and must be non-empty' },
        { status: 400 }
      );
    }

    const supabase = await createAdminClient();

    // Trigger re-cohorting (which also handles updating brand_id in products_ingestion)
    await recohortProducts(supabase, skus, brandId);

    return NextResponse.json({
      success: true,
      updatedCount: skus.length,
    });
  } catch (err) {
    console.error('[Bulk Brand API] Error:', err);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
