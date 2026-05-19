/**
 * Normalizes a v1 EnrichmentResult into the shape stored in
 * `products_ingestion.sources.enriched`.
 *
 * The normalized shape has backward-compatible aliases so the existing
 * consolidation pipeline (`prompt-builder.ts`, `batch-service.ts`) can
 * consume it without changes.
 */

import type {
  EnrichmentResultV1,
  NormalizedEnrichedSourceV1,
  EnrichedProductFactsV1,
} from "./contracts";

/**
 * Normalize a v1 enrichment result into the sources.enriched shape.
 */
export function normalizeEnrichmentResultForSources(
  result: EnrichmentResultV1
): NormalizedEnrichedSourceV1 {
  const product = result.product;

  return {
    schema_version: "v1",
    source_kind: "enriched",

    // Backward-compatible aliases
    title: product.name ?? null,
    name: product.name ?? null,
    brand: product.brand ?? null,
    description: product.description ?? null,
    category: product.category ?? null,
    weight: product.weight ?? null,
    images: product.image_urls ?? [],
    image_urls: product.image_urls ?? [],
    url: result.source.url,
    confidence_score: result.confidence.overall,

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

    // Approved source extraction evidence
    decision: result.decision ?? null,
    llm_used: result.llm_used ?? null,
    source_results: result.source_results ?? undefined,
  };
}

/**
 * Extract backward-compatible source fields for the consolidation prompt builder.
 * This allows the existing source filtering logic to work with enriched sources.
 */
function extractEnrichedSourceAliases(
  normalized: NormalizedEnrichedSourceV1
): Record<string, unknown> {
  return {
    title: normalized.title,
    name: normalized.name,
    brand: normalized.brand,
    description: normalized.description,
    category: normalized.category,
    weight: normalized.weight,
    images: normalized.images,
    image_urls: normalized.image_urls,
    url: normalized.url,
    confidence_score: normalized.confidence_score,
    // Preserve full enriched data for detail enrichment
    ...Object.fromEntries(
      Object.entries(normalized.extracted).filter(
        ([, value]) => value !== null && value !== undefined
      )
    ),
  };
}
