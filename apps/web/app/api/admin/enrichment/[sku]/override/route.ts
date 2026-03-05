import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { setFieldSourceOverride } from '@/lib/enrichment/config';
import { isEnrichableField, isProtectedField } from '@/lib/enrichment/types';

/**
 * POST /api/admin/enrichment/[sku]/override
 * 
 * Set a field-level source override for conflict resolution.
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
    const { field, sourceId } = body;

    if (!field || !sourceId) {
      return NextResponse.json(
        { error: 'field and sourceId are required' },
        { status: 400 }
      );
    }

    // Check if field is protected (price, sku, etc.)
    if (isProtectedField(field)) {
      return NextResponse.json(
        { error: `Cannot override protected field: ${field}. Price and SKU always come from original import.` },
        { status: 400 }
      );
    }

    if (!isEnrichableField(field)) {
      return NextResponse.json(
        { error: `Unknown enrichable field: ${field}` },
        { status: 400 }
      );
    }

    const result = await setFieldSourceOverride(sku, field, sourceId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Enrichment API] Error setting override:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
