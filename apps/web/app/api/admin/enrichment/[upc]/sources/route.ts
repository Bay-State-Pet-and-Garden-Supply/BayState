import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';
import { toggleSourcesForProduct } from '@/lib/enrichment/config';

/**
 * POST /api/admin/enrichment/[upc]/sources
 * 
 * Toggle a source on/off for a specific product.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ upc: string }> }
) {
  const { upc } = await params;

  if (!upc) {
    return NextResponse.json({ error: 'UPC is required' }, { status: 400 });
  }

  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const supabase = await createAdminClient();

  try {
    const body = await request.json();
    const { sourceId, enabled } = body;

    if (!sourceId || typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'sourceId (string) and enabled (boolean) are required' },
        { status: 400 }
      );
    }

    const result = await toggleSourcesForProduct(upc, [sourceId], enabled);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Enrichment API] Error toggling source:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
