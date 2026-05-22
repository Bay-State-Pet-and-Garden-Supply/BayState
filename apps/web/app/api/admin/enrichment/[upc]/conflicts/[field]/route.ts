import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';
import { getProductEnrichmentSummary } from '@/lib/enrichment/config';
import { getAllSources } from '@/lib/enrichment/sources';
import { isEnrichableField, type EnrichableField } from '@/lib/enrichment/types';

/**
 * GET /api/admin/enrichment/[upc]/conflicts/[field]
 * 
 * Get all available values for a conflicting field from different sources.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ upc: string; field: string }> }
) {
  const { upc, field } = await params;

  if (!upc || !field) {
    return NextResponse.json({ error: 'UPC and field are required' }, { status: 400 });
  }

  if (!isEnrichableField(field)) {
    return NextResponse.json({ error: `Unknown field: ${field}` }, { status: 400 });
  }

  const auth = await requireAdminAuth(request);
  if (!auth.authorized) return auth.response;

  const supabase = await createAdminClient();

  try {
    const summary = await getProductEnrichmentSummary(upc);

    if (!summary) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const allSources = await getAllSources();
    const sourceMap = new Map(allSources.map((s) => [s.id, s.displayName]));

    // Collect all values for this field from all sources
    const options: { sourceId: string; sourceName: string; value: unknown }[] = [];

    // From scrapers
    for (const [sourceId, sourceData] of Object.entries(summary.scraperSources)) {
      const value = sourceData.data[field as EnrichableField];
      if (value !== undefined && value !== null) {
        options.push({
          sourceId,
          sourceName: sourceMap.get(sourceId) ?? sourceId,
          value,
        });
      }
    }

    return NextResponse.json({
      field,
      upc,
      options,
      currentSource: summary.resolved[field as EnrichableField]?.source ?? null,
    });
  } catch (error) {
    console.error('[Enrichment API] Error fetching conflicts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
