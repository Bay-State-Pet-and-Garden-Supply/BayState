import { SupabaseClient } from '@supabase/supabase-js';
import {
  hasMeaningfulProductSourceData,
  mergeProductSources,
} from '@/lib/product-sources';

type SourcePayloadBySku = Record<string, Record<string, unknown>>;

export class MissingProductsIngestionSkusError extends Error {
  missingSkus: string[];

  constructor(missingSkus: string[]) {
    const sortedSkus = [...missingSkus].sort();
    super(`Missing products_ingestion rows for SKUs: ${sortedSkus.join(', ')}`);
    this.name = 'MissingProductsIngestionSkusError';
    this.missingSkus = sortedSkus;
  }
}

export interface PartialPersistenceResult {
  persisted: string[];
  missing: string[];
}

/**
 * Loads existing sources from products_ingestion for the given SKUs.
 * Returns only rows that exist — does NOT throw on missing SKUs.
 */
export async function loadProductsIngestionSourcesBySku(
  supabase: SupabaseClient,
  skus: string[]
): Promise<Map<string, Record<string, unknown>>> {
  if (skus.length === 0) {
    return new Map();
  }

  const uniqueSkus = [...new Set(skus)];
  const { data, error } = await supabase
    .from('products_ingestion')
    .select('sku, sources')
    .in('sku', uniqueSkus);

  if (error) {
    throw new Error(`Failed to fetch products_ingestion SKUs: ${error.message}`);
  }

  const sourcesBySku = new Map<string, Record<string, unknown>>();
  for (const row of data || []) {
    sourcesBySku.set(row.sku, (row.sources as Record<string, unknown>) || {});
  }

  return sourcesBySku;
}

/**
 * Strict persistence — throws MissingProductsIngestionSkusError if any SKU
 * is missing from products_ingestion. No rows are written in that case.
 */
export async function persistProductsIngestionSourcesStrict(
  supabase: SupabaseClient,
  skuData: SourcePayloadBySku,
  isTestJob: boolean,
  nowIso: string
): Promise<string[]> {
  const skus = Object.keys(skuData);
  if (skus.length === 0) {
    return [];
  }

  const existingSourcesBySku = await loadProductsIngestionSourcesBySku(supabase, skus);

  const missingSkus = skus.filter((sku) => !existingSourcesBySku.has(sku));
  if (missingSkus.length > 0) {
    throw new MissingProductsIngestionSkusError(missingSkus);
  }

  const updateRows = skus.map((sku) => {
    const scrapedData = skuData[sku];
    const hasMeaningfulData = hasMeaningfulProductSourceData(scrapedData);

    const updatedSources = {
      ...mergeProductSources(existingSourcesBySku.get(sku) || {}, scrapedData),
      _last_scraped: nowIso,
    };

    return {
      sku,
      sources: updatedSources,
      is_test_run: isTestJob,
      updated_at: nowIso,
      ...(hasMeaningfulData ? { pipeline_status: 'enriched' as const } : {}),
    };
  });

  const { error: updateError } = await supabase
    .from('products_ingestion')
    .upsert(updateRows, { onConflict: 'sku' });

  if (updateError) {
    throw new Error(`Bulk update failed: ${updateError.message}`);
  }

  return skus;
}

/**
 * Partial persistence — persists data for SKUs that exist in products_ingestion,
 * skips missing ones, and reports both lists. Never throws for missing SKUs.
 */
export async function persistProductsIngestionSourcesPartial(
  supabase: SupabaseClient,
  skuData: SourcePayloadBySku,
  isTestJob: boolean,
  nowIso: string
): Promise<PartialPersistenceResult> {
  const skus = Object.keys(skuData);
  if (skus.length === 0) {
    return { persisted: [], missing: [] };
  }

  const existingSourcesBySku = await loadProductsIngestionSourcesBySku(supabase, skus);

  const missing = skus.filter((sku) => !existingSourcesBySku.has(sku));
  const toUpdateSkus = skus.filter((sku) => existingSourcesBySku.has(sku));

  if (missing.length > 0) {
    console.warn(
      `[Products Ingestion] ${missing.length} SKU(s) not found in products_ingestion, skipping: ${missing.join(', ')}`
    );
  }

  if (toUpdateSkus.length === 0) {
    return { persisted: [], missing };
  }

  const updateRows = toUpdateSkus.map((sku) => {
    const scrapedData = skuData[sku];
    const hasMeaningfulData = hasMeaningfulProductSourceData(scrapedData);

    const updatedSources = {
      ...mergeProductSources(existingSourcesBySku.get(sku) || {}, scrapedData),
      _last_scraped: nowIso,
    };

    return {
      sku,
      sources: updatedSources,
      is_test_run: isTestJob,
      updated_at: nowIso,
      ...(hasMeaningfulData ? { pipeline_status: 'enriched' as const } : {}),
    };
  });

  const { error: updateError } = await supabase
    .from('products_ingestion')
    .upsert(updateRows, { onConflict: 'sku' });

  if (updateError) {
    throw new Error(`Bulk update failed: ${updateError.message}`);
  }

  return { persisted: toUpdateSkus, missing };
}
