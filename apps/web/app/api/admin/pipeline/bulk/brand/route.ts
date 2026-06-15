import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/pipeline/bulk/brand
 * Bulk assign a brand to multiple products.
 *
 * Brand assignment is intentionally a pure data update: it does not move
 * products between pipeline statuses. Imported includes awaiting_brand rows, and
 * extraction preflight enforces direct brand_id before a product can advance.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();
    const { upcs, brandId } = body as {
      upcs?: string[];
      brandId?: string | null;
    };

    if (!Array.isArray(upcs) || upcs.length === 0) {
      return NextResponse.json(
        { error: 'UPCs array is required and must be non-empty' },
        { status: 400 },
      );
    }

    const uniqueUpcs = Array.from(new Set(upcs.map((upc) => upc.trim()).filter(Boolean)));
    if (uniqueUpcs.length === 0) {
      return NextResponse.json(
        { error: 'UPCs array must contain at least one non-empty UPC' },
        { status: 400 },
      );
    }

    const supabase = await createAdminClient();

    if (brandId) {
      const { data: brand, error: brandError } = await supabase
        .from('brands')
        .select('id')
        .eq('id', brandId)
        .single();

      if (brandError || !brand) {
        return NextResponse.json(
          { error: 'Selected brand was not found' },
          { status: 400 },
        );
      }
    }

    const { data: updatedRows, error } = await supabase
      .from('products_ingestion')
      .update({ brand_id: brandId ?? null })
      .in('upc', uniqueUpcs)
      .select('upc');

    if (error) {
      console.error('[Bulk Brand API] Failed to update product brands:', error);
      return NextResponse.json(
        { error: 'Failed to update product brands' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      updatedCount: updatedRows?.length ?? uniqueUpcs.length,
    });
  } catch (err) {
    console.error('[Bulk Brand API] Error:', err);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }
}
