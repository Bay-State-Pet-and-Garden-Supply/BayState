/**
 * Enrichment (AI Extraction) Contract Types — v1
 *
 * Versioned contract for AI extraction results from the lightweight Python worker.
 * Stores into `products_ingestion.sources.enriched` with backward-compatible aliases
 * so the existing consolidation pipeline can consume it unchanged.
 *
 * Protected fields (price, upc, stock_status, manufacturer_part_number, product_line)
 * are NEVER sourced from enrichment — they come from the original import only.
 */

export type EnrichmentResultStatus = "success" | "partial" | "failed" | "error";

export type EnrichmentMode = "structured" | "metadata" | "llm" | "mixed";

/**
 * The coordinator/requested extraction mode.
 *
 * This is intentionally separate from `EnrichmentMode`, which describes the
 * worker execution strategy used to produce the result.
 */
export type RequestedExtractionMode = "mixed" | "distributor_only" | "ai_only";

export interface EnrichmentResultSourceV1 {
  url: string;
  domain?: string | null;
  label?: string | null;
  target_id?: string | null;
  /** Approved source extraction: source type (official_brand, distributor, etc.) */
  source_type?: string | null;
  /** Approved source extraction: source slug */
  source_slug?: string | null;
  /** Approved source extraction: brand_sources.id reference */
  approved_source_id?: string | null;
  /** Approved source extraction: evidence about match quality */
  evidence?: string | null;
}

export interface CoreDataV1 {
  name?: string | null;
  brand_name?: string | null;
  brand_id?: string | null;
  description?: string | null;
  price?: number | null;
  weight_lbs?: number | null;
  category_id?: string | null;
  canonical_category_breadcrumb?: string | null;
  search_keywords?: string | null;
  confidence_score?: number | null;
  stock_status?: string | null;
  availability?: string | null;
  minimum_quantity?: number | null;
  is_special_order?: boolean | null;
  is_taxable?: boolean | null;
}

export interface FacetDataV1 {
  definition_slug: string;
  value: string;
  confidence_score?: number | null;
  evidence_source?: string | null;
}

export interface MediaDataV1 {
  url: string;
  role?: string | null;
  source?: string | null;
  confidence_score?: number | null;
}

export interface EvidenceDataV1 {
  source_urls?: string[];
  selected_images?: string[];
  image_text?: string | null;
  extraction_notes?: string | null;
}

export interface LegacyEnrichedProductFactsV1 {
  name?: string | null;
  brand?: string | null;
  description?: string | null;
  category?: string | null;
  upc?: string | null;
  weight?: string | null;
  dimensions?: string | null;
  shipping_weight?: string | null;
  image_urls?: Array<
    | string
    | {
        status?: "success" | "error";
        data_url?: string | null;
        error_type?: string | null;
        error_message?: string | null;
        original_url?: string | null;
        status_code?: number | null;
      }
  >;
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

export interface NestedEnrichedProductFactsV1 {
  core?: CoreDataV1 | null;
  facets?: FacetDataV1[];
  media?: MediaDataV1[];
  evidence?: EvidenceDataV1 | null;
}

export type EnrichedProductFactsV1 = NestedEnrichedProductFactsV1 & LegacyEnrichedProductFactsV1;

export interface EnrichmentConfidenceV1 {
  overall: number;
  fields: Record<string, number>;
}

export interface EnrichmentValidationV1 {
  upc_match?: boolean | null;
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
 *
 * Approved source extraction adds optional fields:
 *   - source.source_type / source.source_slug / source.approved_source_id / source.evidence
 *   - requested_extraction_mode (coordinator/run mode separate from worker execution mode)
 *   - decision ("deterministic_success" | "deterministic_partial" | "llm_fallback" | "failed")
 *   - llm_used
 *   - source_results[] (array of individual source extraction results)
 */
export type EnrichmentDecision = "deterministic_success" | "deterministic_partial" | "llm_fallback" | "failed";

export interface SourceResultInfo {
  sourceSlug: string;
  sourceType: string;
  confidence: number;
  matchedFields?: string[];
  evidenceUrl?: string | null;
  product?: EnrichedProductFactsV1 | null;
}

export interface EnrichmentResultV1 {
  schema_version: "v1";
  upc: string;
  source: EnrichmentResultSourceV1;
  status: EnrichmentResultStatus;
  extracted_at: string;
  model?: string | null;
  mode: EnrichmentMode;
  /** Requested coordinator/run mode (separate from worker execution mode). */
  requested_extraction_mode?: RequestedExtractionMode | null;
  product: EnrichedProductFactsV1;
  confidence: EnrichmentConfidenceV1;
  validation: EnrichmentValidationV1;
  attempts: EnrichmentAttemptSummaryV1[];
  /** Approved source extraction: decision type */
  decision?: EnrichmentDecision | null;
  /** Approved source extraction: whether LLM was used */
  llm_used?: boolean | null;
  /** Approved source extraction: per-source extraction results */
  source_results?: SourceResultInfo[];
}

export interface NormalizedEnrichedSourceBaseV1 {
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
  images?: Array<
    | string
    | {
        status?: "success" | "error";
        data_url?: string | null;
        error_type?: string | null;
        error_message?: string | null;
        original_url?: string | null;
        status_code?: number | null;
      }
  >;
  image_urls?: Array<
    | string
    | {
        status?: "success" | "error";
        data_url?: string | null;
        error_type?: string | null;
        error_message?: string | null;
        original_url?: string | null;
        status_code?: number | null;
      }
  >;
  url: string;
  /** Backward-compatible alias: overall confidence score */
  confidence_score: number;
  /** Approved source extraction: decision type */
  decision?: EnrichmentDecision | null;
  /** Approved source extraction: whether LLM was used */
  llm_used?: boolean | null;
  /** Requested coordinator/run mode (separate from worker execution mode). */
  requested_extraction_mode?: RequestedExtractionMode | null;
  /** Active/summary source slug for this normalized enriched record. */
  source_slug?: string | null;
  source_type?: string | null;
  source_label?: string | null;
  active_source_slug?: string | null;
  /** Approved source extraction: per-source results */
  source_results?: SourceResultInfo[];
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

/**
 * A stored snapshot for a single approved/distributor source.
 *
 * This keeps the legacy aliases alongside the nested `extracted` fields so the
 * snapshot can be rendered directly in the admin UI.
 */
export type ApprovedSourceSnapshotV1 = NormalizedEnrichedSourceBaseV1;

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
 *
 * `approved_sources` preserves per-distributor/per-approved-source identity while
 * the top-level aliases continue to expose the active summary snapshot.
 */
export interface NormalizedEnrichedSourceV1 extends NormalizedEnrichedSourceBaseV1 {
  approved_sources?: Record<string, ApprovedSourceSnapshotV1>;
}
