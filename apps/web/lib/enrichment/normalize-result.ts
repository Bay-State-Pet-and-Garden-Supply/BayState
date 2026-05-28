/**
 * Normalizes a v1 EnrichmentResult into the shape stored in
 * `products_ingestion.sources.enriched`.
 *
 * The normalized shape has backward-compatible aliases so the existing
 * consolidation pipeline (`prompt-builder.ts`, `batch-service.ts`) can
 * consume it without changes.
 */

import type {
  EnrichmentConfidenceV1,
  EnrichedProductFactsV1,
  EnrichmentResultSourceV1,
  EnrichmentResultV1,
  NormalizedEnrichedSourceV1,
  RequestedExtractionMode,
} from "./contracts";

interface NormalizeEnrichmentResultOptions {
  requestedExtractionMode?: RequestedExtractionMode | null;
}

interface LegacyEnrichedAliasFields {
  title: string | null;
  name: string | null;
  brand: string | null;
  description: string | null;
  category: string | null;
  weight: string | null;
  images: any[];
  image_urls: any[];
  url: string;
  confidence_score: number;
}

function resolveSourceSlug(result: EnrichmentResultV1): string | null {
  if (typeof result.source.source_slug === "string" && result.source.source_slug.trim()) {
    return result.source.source_slug.trim();
  }

  const firstSourceSlug = result.source_results?.find((entry) => typeof entry.sourceSlug === "string" && entry.sourceSlug.trim())?.sourceSlug;
  return typeof firstSourceSlug === "string" && firstSourceSlug.trim()
    ? firstSourceSlug.trim()
    : null;
}

function resolveSourceType(result: EnrichmentResultV1): string | null {
  if (typeof result.source.source_type === "string" && result.source.source_type.trim()) {
    return result.source.source_type.trim();
  }

  const firstSourceType = result.source_results?.find((entry) => typeof entry.sourceType === "string" && entry.sourceType.trim())?.sourceType;
  return typeof firstSourceType === "string" && firstSourceType.trim()
    ? firstSourceType.trim()
    : null;
}

/**
 * Build backward-compatible aliases from the nested product/source payload.
 */
function buildLegacyEnrichedAliases(
  product: EnrichedProductFactsV1,
  source: EnrichmentResultSourceV1,
  confidence: EnrichmentConfidenceV1,
): LegacyEnrichedAliasFields {
  const isNested = product && ("core" in product || "facets" in product || "media" in product);

  if (isNested) {
    const weightVal = product.core?.weight_lbs;
    const weightStr = weightVal !== undefined && weightVal !== null ? String(weightVal) : null;
    const imgUrls = product.media?.map((m) => m.url) ?? [];
    return {
      title: product.core?.name ?? null,
      name: product.core?.name ?? null,
      brand: product.core?.brand_name ?? null,
      description: product.core?.description ?? null,
      category: product.core?.canonical_category_breadcrumb ?? null,
      weight: weightStr,
      images: imgUrls,
      image_urls: imgUrls,
      url: source.url,
      confidence_score: confidence.overall,
    };
  } else {
    // Legacy flat shape
    const legacyProd = product as any;
    return {
      title: legacyProd?.name ?? null,
      name: legacyProd?.name ?? null,
      brand: legacyProd?.brand ?? null,
      description: legacyProd?.description ?? null,
      category: legacyProd?.category ?? null,
      weight: legacyProd?.weight ?? null,
      images: legacyProd?.image_urls ?? [],
      image_urls: legacyProd?.image_urls ?? [],
      url: source.url,
      confidence_score: confidence.overall,
    };
  }
}

/**
 * Normalize a v1 enrichment result into the sources.enriched shape.
 */
export function normalizeEnrichmentResultForSources(
  result: EnrichmentResultV1,
  options?: NormalizeEnrichmentResultOptions,
): NormalizedEnrichedSourceV1 {
  const product = result.product;
  const sourceSlug = resolveSourceSlug(result);
  const sourceType = resolveSourceType(result);
  const requestedExtractionMode =
    options?.requestedExtractionMode
    ?? result.requested_extraction_mode
    ?? null;

  return {
    schema_version: "v1",
    source_kind: "enriched",

    ...buildLegacyEnrichedAliases(product, result.source, result.confidence),

    // Nested enriched product facts (all extracted fields)
    extracted: product,

    // Confidence and validation details
    confidence: result.confidence,
    validation: result.validation,

    // Extraction metadata
    attempts: result.attempts,
    model: result.model ?? null,
    mode: result.mode,
    extracted_at: result.extracted_at,

    // Approved source extraction evidence / provenance
    decision: result.decision ?? null,
    llm_used: result.llm_used ?? null,
    requested_extraction_mode: requestedExtractionMode,
    source_slug: sourceSlug,
    source_type: sourceType,
    source_label: result.source.label ?? null,
    active_source_slug: sourceSlug,
    source_results: result.source_results?.length ? result.source_results : undefined,
  };
}
