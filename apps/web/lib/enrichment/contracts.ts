/**
 * Enrichment (AI Extraction) Contract Types — v1
 *
 * Versioned contract for AI extraction results from the lightweight Python worker.
 * Stores into `products_ingestion.sources.enriched` with backward-compatible aliases
 * so the existing consolidation pipeline can consume it unchanged.
 *
 * Protected fields (price, sku, stock_status, manufacturer_part_number, product_line)
 * are NEVER sourced from enrichment — they come from the original import only.
 */

export type EnrichmentResultStatus = "success" | "partial" | "failed";

export type EnrichmentMode = "structured" | "metadata" | "llm" | "mixed";

export interface EnrichmentResultSourceV1 {
  url: string;
  domain?: string | null;
  label?: string | null;
  target_id?: string | null;
}

export interface EnrichedProductFactsV1 {
  name?: string | null;
  brand?: string | null;
  description?: string | null;
  category?: string | null;
  sku?: string | null;
  weight?: string | null;
  dimensions?: string | null;
  shipping_weight?: string | null;
  image_urls?: string[];
  ingredients?: string | null;
  features?: string[];
  pet_type?: string | null;
  life_stage?: string | null;
  pet_size?: string | null;
  food_form?: string | null;
  flavor?: string | null;
  special_diet?: string[];
  health_feature?: string[];
  packaging_type?: string | null;
  size?: string | null;
  color?: string | null;
}

export interface EnrichmentConfidenceV1 {
  overall: number;
  fields: Record<string, number>;
}

export interface EnrichmentValidationV1 {
  sku_match?: boolean;
  warnings?: string[];
  missing_required?: string[];
}

export interface EnrichmentAttemptSummaryV1 {
  mode: EnrichmentMode | string;
  status: EnrichmentResultStatus | string;
  error?: string | null;
}

/**
 * The canonical v1 enrichment result contract.
 * Returned by the Python worker and accepted by the v2 enrichment-callback route.
 */
export interface EnrichmentResultV1 {
  schema_version: "v1";
  sku: string;
  source: EnrichmentResultSourceV1;
  status: EnrichmentResultStatus;
  extracted_at: string;
  model?: string | null;
  mode: EnrichmentMode;
  product: EnrichedProductFactsV1;
  confidence: EnrichmentConfidenceV1;
  validation: EnrichmentValidationV1;
  attempts: EnrichmentAttemptSummaryV1[];
}

/**
 * The normalized shape stored into `products_ingestion.sources.enriched`.
 * Contains backward-compatible aliases so existing consolidation can consume it.
 *
 * Key aliases:
 *   - product.name → title, name
 *   - product.image_urls → images, image_urls
 *   - product.brand → brand
 *   - product.description → description
 *   - product.category → category
 *   - product.weight → weight
 *   - product.url → url
 *   - source.url → url
 *   - confidence.overall → confidence_score
 */
export interface NormalizedEnrichedSourceV1 {
  schema_version: "v1";
  source_kind: "enriched";
  /** Backward-compatible alias: product name */
  title?: string | null;
  /** Backward-compatible alias: product name */
  name?: string | null;
  brand?: string | null;
  description?: string | null;
  category?: string | null;
  weight?: string | null;
  /** Backward-compatible alias: product image URLs */
  images?: string[];
  /** Full resolved URL of the extraction source */
  image_urls?: string[];
  url: string;
  /** Backward-compatible alias: overall confidence score */
  confidence_score: number;
  /** Nested enriched product facts (all extracted fields) */
  extracted: EnrichedProductFactsV1;
  /** Per-field confidence scores */
  confidence: EnrichmentConfidenceV1;
  /** Validation results */
  validation: EnrichmentValidationV1;
  /** Extraction attempt history */
  attempts: EnrichmentAttemptSummaryV1[];
  model?: string | null;
  mode: EnrichmentMode;
  extracted_at: string;
}
