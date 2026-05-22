import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';
import { getAllSources } from '@/lib/enrichment/sources';
import { getProductEnrichmentSummary } from '@/lib/enrichment/config';
import type { EnrichableField } from '@/lib/enrichment/types';

/**
 * GET /api/admin/enrichment/[upc]
 * 
 * Fetches enrichment data for a specific product including:
 * - Available sources
 * - Enabled sources for this product
 * - Resolved data (Golden Record)
 * - Original price from import
 */
export async function GET(
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
    // Get all available sources
    const allSources = await getAllSources();

    // Get product enrichment summary
    const summary = await getProductEnrichmentSummary(upc);

    if (!summary) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Get original price from input
    const { data: product } = await supabase
      .from('products_ingestion')
      .select('input')
      .eq('upc', upc)
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
      upc,
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
