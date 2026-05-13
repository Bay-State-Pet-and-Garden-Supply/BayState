import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';
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

  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const supabase = await createAdminClient();

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
