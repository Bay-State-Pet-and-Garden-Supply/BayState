import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { toggleSourcesForProduct } from '@/lib/enrichment/config';

/**
 * POST /api/admin/enrichment/[sku]/sources
 * 
 * Toggle a source on/off for a specific product.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;

  if (!sku) {
    return NextResponse.json({ error: 'SKU is required' }, { status: 400 });
  }

  const supabase = await createClient();

  // Verify user is admin/staff
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'staff'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { sourceId, enabled } = body;

    if (!sourceId || typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'sourceId (string) and enabled (boolean) are required' },
        { status: 400 }
      );
    }

    const result = await toggleSourcesForProduct(sku, [sourceId], enabled);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Enrichment API] Error toggling source:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
