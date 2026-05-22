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
    /** job type: 'static_scraper' | 'fallback_serper_ai' | 'enrichment' */
    sourceKind: 'static_scraper' | 'fallback_serper_ai' | 'enrichment';
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

type SourcePayloadByUpc = Record<string, Record<string, unknown>>;

export class MissingProductsIngestionUpcsError extends Error {
  missingUpcs: string[];

  constructor(missingUpcs: string[]) {
    const sortedUpcs = [...missingUpcs].sort();
    super(`Missing products_ingestion rows for UPCs: ${sortedUpcs.join(', ')}`);
    this.name = 'MissingProductsIngestionUpcsError';
    this.missingUpcs = sortedUpcs;
  }
}

interface PartialPersistenceResult {
  persisted: string[];
  missing: string[];
}

interface ProductsIngestionSourceRow {
  upc: string;
  sources: Record<string, unknown>;
}

async function makeIncomingSourcesDurable(
  supabase: Pick<SupabaseClient, 'from' | 'storage'>,
  productId: string,
  upc: string,
  sources: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const durableSources = await replaceInlineImageDataUrls(supabase, sources, {
    folderPath: buildProductImageStorageFolder('pipeline-sources', upc),
    productId,
    onError: (message, error) => {
      console.warn(`[Products Ingestion] ${message}`, error);
    },
  });

  return durableSources.value;
}

/**
 * Loads existing sources from products_ingestion for the given UPCs.
 * Returns only rows that exist — does NOT throw on missing UPCs.
 */
async function loadProductsIngestionSourcesByUpc(
  supabase: SupabaseClient,
  upcs: string[]
): Promise<Map<string, ProductsIngestionSourceRow>> {
  if (upcs.length === 0) {
    return new Map();
  }

  const uniqueUpcs = [...new Set(upcs)];
  const { data, error } = await supabase
    .from('products_ingestion')
    .select('upc, sources')
    .in('upc', uniqueUpcs);

  if (error) {
    throw new Error(`Failed to fetch products_ingestion UPCs: ${error.message}`);
  }

  const sourcesByUpc = new Map<string, ProductsIngestionSourceRow>();
  for (const row of data || []) {
    sourcesByUpc.set(row.upc, {
      upc: row.upc,
      sources: (row.sources as Record<string, unknown>) || {},
    });
  }

  return sourcesByUpc;
}

/**
 * Attach provenance metadata to each source payload in upcData.
 * Adds `_provenance` as a sub-object to each source's data, recording
 * the source kind, job id, chunk id, scraper slug, and optional
 * quality scores, serper query, and llm model.
 */
function attachProvenance(
  upcData: SourcePayloadByUpc,
  provenance?: ProvenanceContext,
): SourcePayloadByUpc {
  if (!provenance) return upcData;

  const result: SourcePayloadByUpc = {};

  for (const [upc, sources] of Object.entries(upcData)) {
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

    result[upc] = enrichedSources;
  }

  return result;
}

/**
 * Strict persistence — throws MissingProductsIngestionUpcsError if any UPC
 * is missing from products_ingestion. No rows are written in that case.
 */
export async function persistProductsIngestionSourcesStrict(
  supabase: SupabaseClient,
  upcData: SourcePayloadByUpc,
  isTestJob: boolean,
  nowIso: string,
  provenance?: ProvenanceContext,
): Promise<string[]> {
  const upcs = Object.keys(upcData);
  if (upcs.length === 0) {
    return [];
  }

  const enrichedUpcData = attachProvenance(upcData, provenance);

  const existingSourcesByUpc = await loadProductsIngestionSourcesByUpc(supabase, upcs);

  const missingUpcs = upcs.filter((upc) => !existingSourcesByUpc.has(upc));
  if (missingUpcs.length > 0) {
    throw new MissingProductsIngestionUpcsError(missingUpcs);
  }

  // Skip pipeline status update for static scraper and enrichment jobs —
  // quality routing at job completion will determine the next status
  const isStaticScraperJob = provenance?.sourceKind === 'static_scraper';
  const isEnrichmentJob = provenance?.sourceKind === 'enrichment';
  const skipStatusUpdate = isStaticScraperJob || isEnrichmentJob;

  const updateRows = await Promise.all(upcs.map(async (upc) => {
    const existingRow = existingSourcesByUpc.get(upc)!;
    const scrapedData = await makeIncomingSourcesDurable(supabase, upc, upc, enrichedUpcData[upc] || upcData[upc]);
    const hasMeaningfulData = hasMeaningfulProductSourceData(scrapedData);

    const updatedSources = mergeProductSources(existingRow.sources, scrapedData);

    return {
      upc,
      sources: updatedSources,
      is_test_run: isTestJob,
      updated_at: nowIso,
      ...(hasMeaningfulData && !skipStatusUpdate
        ? {
            pipeline_status: 'processed' as const,
          }
        : {}),
    };
  }));

  const { error: updateError } = await supabase
    .from('products_ingestion')
    .upsert(updateRows, { onConflict: 'upc' });

  if (updateError) {
    throw new Error(`Bulk update failed: ${updateError.message}`);
  }

  return upcs;
}

/**
 * Partial persistence — persists data for UPCs that exist in products_ingestion,
 * skips missing ones, and reports both lists. Never throws for missing UPCs.
 */
export async function persistProductsIngestionSourcesPartial(
  supabase: SupabaseClient,
  upcData: SourcePayloadByUpc,
  isTestJob: boolean,
  nowIso: string,
  provenance?: ProvenanceContext,
): Promise<PartialPersistenceResult> {
  const upcs = Object.keys(upcData);
  if (upcs.length === 0) {
    return { persisted: [], missing: [] };
  }

  const enrichedUpcData = attachProvenance(upcData, provenance);

  const existingSourcesByUpc = await loadProductsIngestionSourcesByUpc(supabase, upcs);

  const missing = upcs.filter((upc) => !existingSourcesByUpc.has(upc));
  const toUpdateUpcs = upcs.filter((upc) => existingSourcesByUpc.has(upc));

  if (missing.length > 0) {
    console.warn(
      `[Products Ingestion] ${missing.length} UPC(s) not found in products_ingestion, skipping: ${missing.join(', ')}`
    );
  }

  if (toUpdateUpcs.length === 0) {
    return { persisted: [], missing };
  }

  // Skip pipeline status update for static scraper and enrichment jobs —
  // quality routing at job completion will determine the next status
  const isStaticScraperJob = provenance?.sourceKind === 'static_scraper';
  const isEnrichmentJob = provenance?.sourceKind === 'enrichment';
  const skipStatusUpdate = isStaticScraperJob || isEnrichmentJob;

  const updateRows = await Promise.all(toUpdateUpcs.map(async (upc) => {
    const existingRow = existingSourcesByUpc.get(upc)!;
    const scrapedData = await makeIncomingSourcesDurable(supabase, upc, upc, enrichedUpcData[upc] || upcData[upc]);
    const hasMeaningfulData = hasMeaningfulProductSourceData(scrapedData);

    const updatedSources = mergeProductSources(existingRow.sources, scrapedData);

    return {
      upc,
      sources: updatedSources,
      is_test_run: isTestJob,
      updated_at: nowIso,
      ...(hasMeaningfulData && !skipStatusUpdate
        ? {
            pipeline_status: 'processed' as const,
          }
        : {}),
    };
  }));

  const { error: updateError } = await supabase
    .from('products_ingestion')
    .upsert(updateRows, { onConflict: 'upc' });

  if (updateError) {
    console.error(`[Products Ingestion] Bulk update failed: ${updateError.message}`);
    throw new Error(`Bulk update failed: ${updateError.message}`);
  }

  return { persisted: toUpdateUpcs, missing };
}
