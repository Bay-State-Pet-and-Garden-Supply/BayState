'use server';

/**
 * Enrichment Config Operations
 * 
 * Server actions for managing per-product enrichment configuration.
 */

import { createClient } from '@/lib/supabase/server';
import type { 
  EnrichmentConfig, 
  ProductEnrichmentSummary, 
  EnrichableField,
  SourceEnrichmentData 
} from './types';
import { ENRICHABLE_FIELDS } from './types';

/**
 * Gets the enrichment config for a product.
 */
async function getEnrichmentConfig(upc: string): Promise<EnrichmentConfig | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products_ingestion')
    .select('enrichment_config')
    .eq('upc', upc)
    .single();

  if (error || !data) {
    console.error('[Enrichment] Failed to get config:', error);
    return null;
  }

  return (data.enrichment_config as EnrichmentConfig) ?? {};
}

/**
 * Gets the full enrichment summary for a product, including all source data and conflicts.
 */
export async function getProductEnrichmentSummary(upc: string): Promise<ProductEnrichmentSummary | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products_ingestion')
    .select('upc, sources, enrichment_config')
    .eq('upc', upc)
    .single();

  if (error || !data) {
    console.error('[Enrichment] Failed to get product data:', error);
    return null;
  }

  const sources = (data.sources ?? {}) as Record<string, Record<string, unknown>>;
  const config = (data.enrichment_config ?? {}) as EnrichmentConfig;

  // Convert raw sources to SourceEnrichmentData format
  const scraperSources: Record<string, SourceEnrichmentData> = {};
  for (const [scraperId, rawData] of Object.entries(sources)) {
    scraperSources[scraperId] = {
      sourceId: scraperId,
      sourceType: 'scraper',
      fetchedAt: (rawData.fetched_at as string) ?? new Date().toISOString(),
      data: extractEnrichableFields(rawData),
      raw: rawData,
    };
  }

  // Detect conflicts
  const conflicts = detectConflicts(scraperSources);

  // Resolve to "Golden Record"
  const resolved = resolveEnrichmentData(scraperSources, config);

  return {
    upc,
    scraperSources,
    config,
    conflicts,
    resolved,
  };
}

/**
 * Extracts enrichable fields from raw source data.
 */
function extractEnrichableFields(rawData: Record<string, unknown>): Partial<Record<EnrichableField, unknown>> {
  const result: Partial<Record<EnrichableField, unknown>> = {};

  for (const field of ENRICHABLE_FIELDS) {
    if (rawData[field] !== undefined && rawData[field] !== null && rawData[field] !== '') {
      result[field] = rawData[field];
    }
  }

  return result;
}

/**
 * Detects fields where multiple sources provide different values.
 */
function detectConflicts(
  scraperSources: Record<string, SourceEnrichmentData>
): EnrichableField[] {
  const conflicts: EnrichableField[] = [];
  const allSources = scraperSources;

  for (const field of ENRICHABLE_FIELDS) {
    const values: { source: string; value: unknown }[] = [];

    for (const [sourceId, sourceData] of Object.entries(allSources)) {
      const fieldValue = sourceData.data[field];
      if (fieldValue !== undefined && fieldValue !== null) {
        values.push({ source: sourceId, value: fieldValue });
      }
    }

    // Check if there are multiple distinct values
    if (values.length > 1) {
      const distinctValues = new Set(values.map((v) => JSON.stringify(v.value)));
      if (distinctValues.size > 1) {
        conflicts.push(field);
      }
    }
  }

  return conflicts;
}

/**
 * Resolves enrichment data according to config and priority.
 * Priority order: field_overrides > first available source
 */
function resolveEnrichmentData(
  scraperSources: Record<string, SourceEnrichmentData>,
  config: EnrichmentConfig
): Partial<Record<EnrichableField, { value: unknown; source: string }>> {
  const resolved: Partial<Record<EnrichableField, { value: unknown; source: string }>> = {};
  const allSources = scraperSources;

  for (const field of ENRICHABLE_FIELDS) {
    // Check for explicit override
    const overrideSource = config.field_overrides?.[field];
    if (overrideSource && allSources[overrideSource]?.data[field] !== undefined) {
      resolved[field] = {
        value: allSources[overrideSource].data[field],
        source: overrideSource,
      };
      continue;
    }

    // Find first available source with data for this field
    for (const [sourceId, sourceData] of Object.entries(allSources)) {
      const fieldValue = sourceData.data[field];
      if (fieldValue !== undefined && fieldValue !== null) {
        resolved[field] = { value: fieldValue, source: sourceId };
        break;
      }
    }
  }

  return resolved;
}
