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
import { validateEnrichmentConfig, ENRICHABLE_FIELDS } from './types';
import { getAllSources } from './sources';

/**
 * Gets the enrichment config for a product.
 */
export async function getEnrichmentConfig(sku: string): Promise<EnrichmentConfig | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products_ingestion')
    .select('enrichment_config')
    .eq('sku', sku)
    .single();

  if (error || !data) {
    console.error('[Enrichment] Failed to get config:', error);
    return null;
  }

  return (data.enrichment_config as EnrichmentConfig) ?? {};
}

/**
 * Updates the enrichment config for a product.
 */
export async function updateEnrichmentConfig(
  sku: string,
  config: Partial<EnrichmentConfig>
): Promise<{ success: boolean; error?: string }> {
  // Validate the config
  const fullConfig: EnrichmentConfig = {
    ...config,
    last_manual_edit: new Date().toISOString(),
  };

  const validation = validateEnrichmentConfig(fullConfig);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join('; ') };
  }

  const supabase = await createClient();

  // Get existing config and merge
  const { data: existing } = await supabase
    .from('products_ingestion')
    .select('enrichment_config')
    .eq('sku', sku)
    .single();

  const mergedConfig: EnrichmentConfig = {
    ...(existing?.enrichment_config as EnrichmentConfig ?? {}),
    ...fullConfig,
  };

  const { error } = await supabase
    .from('products_ingestion')
    .update({
      enrichment_config: mergedConfig,
      updated_at: new Date().toISOString(),
    })
    .eq('sku', sku);

  if (error) {
    console.error('[Enrichment] Failed to update config:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Enables or disables specific sources for a product.
 */
export async function toggleSourcesForProduct(
  sku: string,
  sourceIds: string[],
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  const currentConfig = await getEnrichmentConfig(sku);
  const enabledSources = new Set(currentConfig?.enabled_sources ?? []);

  // Get all available sources to determine the full list
  const allSources = await getAllSources();
  const allSourceIds = allSources.map((s) => s.id);

  // If no enabled_sources set, start with all sources enabled
  if (!currentConfig?.enabled_sources) {
    allSourceIds.forEach((id) => enabledSources.add(id));
  }

  // Toggle the specified sources
  for (const sourceId of sourceIds) {
    if (enabled) {
      enabledSources.add(sourceId);
    } else {
      enabledSources.delete(sourceId);
    }
  }

  return updateEnrichmentConfig(sku, {
    enabled_sources: Array.from(enabledSources),
  });
}

/**
 * Sets the preferred source for a specific field.
 */
export async function setFieldSourceOverride(
  sku: string,
  field: EnrichableField,
  sourceId: string
): Promise<{ success: boolean; error?: string }> {
  const currentConfig = await getEnrichmentConfig(sku);

  return updateEnrichmentConfig(sku, {
    field_overrides: {
      ...(currentConfig?.field_overrides ?? {}),
      [field]: sourceId,
    },
  });
}

/**
 * Clears the source override for a specific field.
 */
export async function clearFieldSourceOverride(
  sku: string,
  field: EnrichableField
): Promise<{ success: boolean; error?: string }> {
  const currentConfig = await getEnrichmentConfig(sku);
  const overrides = { ...(currentConfig?.field_overrides ?? {}) };
  delete overrides[field];

  return updateEnrichmentConfig(sku, {
    field_overrides: overrides,
  });
}

/**
 * Gets the full enrichment summary for a product, including all source data and conflicts.
 */
export async function getProductEnrichmentSummary(sku: string): Promise<ProductEnrichmentSummary | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products_ingestion')
    .select('sku, sources, enrichment_config')
    .eq('sku', sku)
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
    sku,
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
  const enabledSources = config.enabled_sources;

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
      // Skip disabled sources
      if (enabledSources && !enabledSources.includes(sourceId)) {
        continue;
      }

      const fieldValue = sourceData.data[field];
      if (fieldValue !== undefined && fieldValue !== null) {
        resolved[field] = { value: fieldValue, source: sourceId };
        break;
      }
    }
  }

  return resolved;
}

/**
 * Gets enrichment summaries for multiple products.
 */
export async function getProductEnrichmentSummaries(
  skus: string[]
): Promise<Map<string, ProductEnrichmentSummary>> {
  const results = new Map<string, ProductEnrichmentSummary>();

  // Fetch in parallel for performance
  const summaries = await Promise.all(
    skus.map((sku) => getProductEnrichmentSummary(sku))
  );

  for (let i = 0; i < skus.length; i++) {
    const summary = summaries[i];
    if (summary) {
      results.set(skus[i], summary);
    }
  }

  return results;
}
