import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAllSources } from '@/lib/enrichment/sources';
import { getProductEnrichmentSummary } from '@/lib/enrichment/config';
import type { EnrichableField } from '@/lib/enrichment/types';

/**
 * GET /api/admin/enrichment/[sku]
 * 
 * Fetches enrichment data for a specific product including:
 * - Available sources
 * - Enabled sources for this product
 * - Resolved data (Golden Record)
 * - Original price from import
 */
export async function GET(
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
    // Get all available sources
    const allSources = await getAllSources();

    // Get product enrichment summary
    const summary = await getProductEnrichmentSummary(sku);

    if (!summary) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Get original price from input
    const { data: product } = await supabase
      .from('products_ingestion')
      .select('input')
      .eq('sku', sku)
      .single();

    const input = product?.input as Record<string, unknown> | null;
    const originalPrice = (input?.price as number) ?? 0;

    // Determine enabled sources (default: all enabled if no config)
    const enabledSourceIds = summary.config.enabled_sources ?? allSources.map((s) => s.id);

    // Transform sources for the UI
    const sources = allSources.map((source) => ({
      id: source.id,
      displayName: source.displayName,
      type: source.type,
      status: source.status,
      enabled: source.enabled,
      requiresAuth: source.requiresAuth,
    }));

    // Transform resolved data for the UI
    const resolvedData = Object.entries(summary.resolved).map(([field, data]) => ({
      field,
      value: data?.value ?? null,
      source: data?.source ?? 'unknown',
      hasConflict: summary.conflicts.includes(field as EnrichableField),
    }));

    // Get field overrides
    const fieldOverrides = summary.config.field_overrides ?? {};

    return NextResponse.json({
      sku,
      sources,
      enabledSourceIds,
      resolvedData,
      originalPrice,
      fieldOverrides,
      conflicts: summary.conflicts,
    });
  } catch (error) {
    console.error('[Enrichment API] Error fetching enrichment data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
