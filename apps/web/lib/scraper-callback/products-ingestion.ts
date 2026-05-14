import { SupabaseClient } from '@/lib/supabase/server';
import {
  hasMeaningfulProductSourceData,
  mergeProductSources,
} from '@/lib/product-sources';
import {
  buildProductImageStorageFolder,
  replaceInlineImageDataUrls,
} from '@/lib/product-image-storage';

export interface ProvenanceContext {
    /** job type: 'static_scraper' | 'fallback_serper_ai' */
    sourceKind: 'static_scraper' | 'fallback_serper_ai';
    /** The scrape job that produced these results */
    scrapeJobId: string;
    /** The specific chunk (if applicable) */
    scrapeChunkId?: string;
    /** The scraper slug that generated the source data */
    scraperSlug?: string;
    /** Per-source quality scores (keyed by source name) */
    qualityScores?: Record<string, number>;
    /** SERPER query used for discovery (fallback only) */
    serperQuery?: string;
    /** LLM model used (fallback only) */
    llmModel?: string;
}

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

interface PartialPersistenceResult {
  persisted: string[];
  missing: string[];
}

interface ProductsIngestionSourceRow {
  sku: string;
  sources: Record<string, unknown>;
}

async function makeIncomingSourcesDurable(
  supabase: Pick<SupabaseClient, 'from' | 'storage'>,
  productId: string,
  sku: string,
  sources: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const durableSources = await replaceInlineImageDataUrls(supabase, sources, {
    folderPath: buildProductImageStorageFolder('pipeline-sources', sku),
    productId,
    onError: (message, error) => {
      console.warn(`[Products Ingestion] ${message}`, error);
    },
  });

  return durableSources.value;
}

/**
 * Loads existing sources from products_ingestion for the given SKUs.
 * Returns only rows that exist — does NOT throw on missing SKUs.
 */
async function loadProductsIngestionSourcesBySku(
  supabase: SupabaseClient,
  skus: string[]
): Promise<Map<string, ProductsIngestionSourceRow>> {
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

  const sourcesBySku = new Map<string, ProductsIngestionSourceRow>();
  for (const row of data || []) {
    sourcesBySku.set(row.sku, {
      sku: row.sku,
      sources: (row.sources as Record<string, unknown>) || {},
    });
  }

  return sourcesBySku;
}

/**
 * Attach provenance metadata to each source payload in skuData.
 * Adds `_provenance` as a sub-object to each source's data, recording
 * the source kind, job id, chunk id, scraper slug, and optional
 * quality scores, serper query, and llm model.
 */
function attachProvenance(
  skuData: SourcePayloadBySku,
  provenance?: ProvenanceContext,
): SourcePayloadBySku {
  if (!provenance) return skuData;

  const result: SourcePayloadBySku = {};

  for (const [sku, sources] of Object.entries(skuData)) {
    const enrichedSources: Record<string, unknown> = {};

    for (const [sourceName, sourcePayload] of Object.entries(sources)) {
      const existingProvenance =
        sourcePayload && typeof sourcePayload === 'object' && !Array.isArray(sourcePayload)
          ? ((sourcePayload as Record<string, unknown>)._provenance as Record<string, unknown>) || {}
          : {};

      const score = provenance.qualityScores?.[sourceName];

      enrichedSources[sourceName] = {
        ...(sourcePayload as Record<string, unknown>),
        _provenance: {
          source_kind: provenance.sourceKind,
          scrape_job_id: provenance.scrapeJobId,
          ...(provenance.scrapeChunkId ? { scrape_chunk_id: provenance.scrapeChunkId } : {}),
          ...(provenance.scraperSlug ? { scraper_slug: provenance.scraperSlug } : {}),
          ...(score !== undefined ? { quality_score: score } : {}),
          ...(provenance.serperQuery ? { serper_query: provenance.serperQuery } : {}),
          ...(provenance.llmModel ? { llm_model: provenance.llmModel } : {}),
          ...existingProvenance,
        },
      };
    }

    result[sku] = enrichedSources;
  }

  return result;
}

/**
 * Strict persistence — throws MissingProductsIngestionSkusError if any SKU
 * is missing from products_ingestion. No rows are written in that case.
 */
export async function persistProductsIngestionSourcesStrict(
  supabase: SupabaseClient,
  skuData: SourcePayloadBySku,
  isTestJob: boolean,
  nowIso: string,
  provenance?: ProvenanceContext,
): Promise<string[]> {
  const skus = Object.keys(skuData);
  if (skus.length === 0) {
    return [];
  }

  const enrichedSkuData = attachProvenance(skuData, provenance);

  const existingSourcesBySku = await loadProductsIngestionSourcesBySku(supabase, skus);

  const missingSkus = skus.filter((sku) => !existingSourcesBySku.has(sku));
  if (missingSkus.length > 0) {
    throw new MissingProductsIngestionSkusError(missingSkus);
  }

  // Skip pipeline status update for static scraper jobs — quality routing
  // at job completion will decide between scraped and needs_fallback_review
  const isStaticScraperJob = provenance?.sourceKind === 'static_scraper';

  const updateRows = await Promise.all(skus.map(async (sku) => {
    const existingRow = existingSourcesBySku.get(sku)!;
    const scrapedData = await makeIncomingSourcesDurable(supabase, sku, sku, enrichedSkuData[sku] || skuData[sku]);
    const hasMeaningfulData = hasMeaningfulProductSourceData(scrapedData);

    const updatedSources = mergeProductSources(existingRow.sources, scrapedData);

    return {
      sku,
      sources: updatedSources,
      is_test_run: isTestJob,
      updated_at: nowIso,
      ...(hasMeaningfulData && !isStaticScraperJob
        ? {
            pipeline_status: 'scraped' as const,
          }
        : {}),
    };
  }));

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
  nowIso: string,
  provenance?: ProvenanceContext,
): Promise<PartialPersistenceResult> {
  const skus = Object.keys(skuData);
  if (skus.length === 0) {
    return { persisted: [], missing: [] };
  }

  const enrichedSkuData = attachProvenance(skuData, provenance);

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

  // Skip pipeline status update for static scraper jobs — quality routing
  // at job completion will decide between scraped and needs_fallback_review
  const isStaticScraperJob = provenance?.sourceKind === 'static_scraper';

  const updateRows = await Promise.all(toUpdateSkus.map(async (sku) => {
    const existingRow = existingSourcesBySku.get(sku)!;
    const scrapedData = await makeIncomingSourcesDurable(supabase, sku, sku, enrichedSkuData[sku] || skuData[sku]);
    const hasMeaningfulData = hasMeaningfulProductSourceData(scrapedData);

    const updatedSources = mergeProductSources(existingRow.sources, scrapedData);

    return {
      sku,
      sources: updatedSources,
      is_test_run: isTestJob,
      updated_at: nowIso,
      ...(hasMeaningfulData && !isStaticScraperJob
        ? {
            pipeline_status: 'scraped' as const,
          }
        : {}),
    };
  }));

  const { error: updateError } = await supabase
    .from('products_ingestion')
    .upsert(updateRows, { onConflict: 'sku' });

  if (updateError) {
    console.error(`[Products Ingestion] Bulk update failed: ${updateError.message}`);
    throw new Error(`Bulk update failed: ${updateError.message}`);
  }

  return { persisted: toUpdateSkus, missing };
}
