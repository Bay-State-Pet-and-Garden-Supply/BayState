/**
 * Enrichment Result Helpers for Source Cascade
 *
 * Centralizes EnrichmentResultV1 parsing, source payload conversion,
 * source-attempt row creation, and ADR 0002 found-wins status decisions.
 *
 * This module bridges the runner's EnrichmentResultV1 JSON shape
 * (defined in apps/scraper/scrapers/ai_search/enrichment_models.py)
 * with the coordinator's DB persistence layer.
 *
 * Storage shape (explicit decision from oracle review):
 *   products_ingestion.sources[sourceSlug] = flat canonical source payload
 *   NOT sources.enriched and NOT only nested source_results.
 */

import type { PersistedPipelineStatus } from "@/lib/pipeline/types";

// =============================================================================
// Zod schema for the runner's callback payload
// =============================================================================

import { z } from "zod";

/**
 * Per-source extraction result metadata sent by the runner.
 * Matches apps/scraper/scrapers/ai_search/enrichment_models.py SourceResultInfo.
 */
export const SourceResultInfoSchema = z.object({
  sourceSlug: z.string(),
  sourceType: z.string(),
  confidence: z.number().min(0).max(1).default(0),
  matchedFields: z.array(z.string()).default([]),
  evidenceUrl: z.string().nullable().optional(),
  product: z.record(z.string(), z.unknown()).nullable().optional(),
  extractionMethod: z.string().nullable().optional(),
  platform: z.string().nullable().optional(),
  llmUsed: z.boolean().nullable().optional(),
  /** "found" | "not_stocked" | "source_error" | "skipped" */
  outcome: z.string().nullable().optional(),
  error_code: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  attempted_at: z.string().nullable().optional(),
});

export type SourceResultInfo = z.infer<typeof SourceResultInfoSchema>;

/**
 * The full enrichment result sent by the runner.
 * Matches EnrichmentResultV1 from the py models plus transport fields.
 */
export const EnrichmentResultV1Schema = z.object({
  // Transport fields injected by runner's submit_enrichment_result
  _attempt_id: z.string(),
  _status: z.string().optional(),
  _lease_token: z.string().optional(),
  _error_message: z.string().optional(),

  // Standard EnrichmentResultV1 fields
  schema_version: z.string().default("v1"),
  upc: z.string(),
  source: z.object({
    url: z.string(),
    domain: z.string().optional(),
  }),
  status: z.enum(["success", "partial", "failed"]),
  extracted_at: z.string(),
  model: z.string().nullable().optional(),
  mode: z.string().default("mixed"),
  product: z.record(z.string(), z.unknown()).default({}),
  confidence: z.object({
    overall: z.number().min(0).max(1).default(0),
    fields: z.record(z.string(), z.number()).default({}),
  }).default({ overall: 0, fields: {} }),
  validation: z.object({
    warnings: z.array(z.string()).default([]),
    missing_required: z.array(z.string()).default([]),
  }).default({ warnings: [], missing_required: [] }),
  attempts: z.array(z.record(z.string(), z.unknown())).default([]),
  // Approved source extraction fields
  decision: z.string().nullable().optional(),
  llm_used: z.boolean().nullable().optional(),
  source_results: z.array(SourceResultInfoSchema).default([]),
});

export type EnrichmentResultV1 = z.infer<typeof EnrichmentResultV1Schema>;

// =============================================================================
// Source Outcome Normalization
// =============================================================================

/**
 * Normalized source outcome.
 * ADR 0002 defines: found | not_stocked | source_error | skipped
 */
export type NormalizedOutcome = "found" | "not_stocked" | "source_error" | "skipped";

/**
 * Normalize a runner source outcome string to the canonical set.
 *
 * Handles:
 *   - null → "found" (Amazon/marketplace null-outcome + product data pattern;
 *     the runner's executor normalizes these to found before they reach here)
 *   - "" → "skipped"
 *   - "found" / "not_stocked" / "source_error" / "skipped" → pass through
 */
export function normalizeSourceOutcome(outcome: string | null | undefined): NormalizedOutcome {
  if (outcome === null || outcome === undefined) {
    return "found";
  }

  if (outcome.trim() === "") {
    return "skipped";
  }

  const normalized = outcome.trim().toLowerCase();

  if (["found", "not_stocked", "source_error", "skipped"].includes(normalized)) {
    return normalized as NormalizedOutcome;
  }

  // Unknown outcome string — treat as skipped
  console.warn(`[EnrichmentResult] Unknown source outcome "${outcome}", treating as skipped`);
  return "skipped";
}

// =============================================================================
// Source Payload Builder
// =============================================================================

/**
 * Build a flat canonical source payload for products_ingestion.sources[sourceSlug].
 *
 * Extracts relevant fields from the runner's per-source product data and
 * returns a clean, flat object ready for storage.
 */
export function buildCanonicalSourcePayload(
  sourceResult: SourceResultInfo,
): Record<string, unknown> {
  const product = sourceResult.product ?? {};

  // Build a flat canonical payload from the runner's product data.
  // We extract the most commonly used fields to keep the shape predictable.
  const payload: Record<string, unknown> = {
    _source_slug: sourceResult.sourceSlug,
    _source_type: sourceResult.sourceType,
    _extracted_at: sourceResult.attempted_at ?? new Date().toISOString(),
    _confidence: sourceResult.confidence,
    _evidence_url: sourceResult.evidenceUrl ?? null,
    _extraction_method: sourceResult.extractionMethod ?? null,
    _llm_used: sourceResult.llmUsed ?? null,
  };

  // Map top-level product fields from the runner's EnrichedProductFacts shape.
  // The runner sends product as a dict; we selectively pick the useful payload fields.
  if (product && typeof product === "object") {
    const p = product as Record<string, unknown>;

    // Core fields
    if (p.name) payload.name = p.name;
    if (p.brand) payload.brand = p.brand;
    if (p.brand_name) payload.brand_name = p.brand_name;
    if (p.description) payload.description = p.description;

    // Category
    if (p.category) payload.category = p.category;
    if (p.canonical_category_breadcrumb) payload.canonical_category_breadcrumb = p.canonical_category_breadcrumb;

    // Media/images
    if (p.image_urls && Array.isArray(p.image_urls)) payload.image_urls = p.image_urls;
    if (p.images && Array.isArray(p.images)) payload.images = p.images;

    // Nested core data
    if (p.core && typeof p.core === "object") {
      const core = p.core as Record<string, unknown>;
      if (core.name && !payload.name) payload.name = core.name;
      if (core.brand_name && !payload.brand_name) payload.brand_name = core.brand_name;
      if (core.description && !payload.description) payload.description = core.description;
      if (core.canonical_category_breadcrumb && !payload.canonical_category_breadcrumb) {
        payload.canonical_category_breadcrumb = core.canonical_category_breadcrumb;
      }
      if (core.weight_lbs !== undefined && core.weight_lbs !== null) payload.weight_lbs = core.weight_lbs;
      if (core.price !== undefined && core.price !== null) payload.price = core.price;
      if (core.confidence_score !== undefined && core.confidence_score !== null) {
        payload.confidence_score = core.confidence_score;
      }
      // Also store full core for backward compat
      payload.core = core;
    }

    // Facets
    if (p.facets && Array.isArray(p.facets)) {
      payload.facets = p.facets;
      // Also extract individual facet values as top-level keys for easy access
      for (const facet of p.facets) {
        if (facet && typeof facet === "object") {
          const f = facet as Record<string, unknown>;
          if (f.definition_slug && f.value) {
            payload[f.definition_slug as string] = f.value;
          }
        }
      }
    }

    // Media
    if (p.media && Array.isArray(p.media)) {
      payload.media = p.media;
    }

    // Evidence
    if (p.evidence && typeof p.evidence === "object") {
      payload.evidence = p.evidence;
    }

    // Size metrics
    if (p.size_metrics) payload.size_metrics = p.size_metrics;
    if (p.weight) payload.weight = p.weight;
    if (p.shipping_weight) payload.shipping_weight = p.shipping_weight;
    if (p.dimensions) payload.dimensions = p.dimensions;

    // Detail fields
    if (p.ingredients) payload.ingredients = p.ingredients;
    if (p.features) payload.features = p.features;

    // Pet fields
    if (p.pet_type) payload.pet_type = p.pet_type;
    if (p.life_stage) payload.life_stage = p.life_stage;
    if (p.pet_size) payload.pet_size = p.pet_size;
    if (p.food_form) payload.food_form = p.food_form;
    if (p.flavor) payload.flavor = p.flavor;
    if (p.special_diet) payload.special_diet = p.special_diet;
    if (p.health_feature) payload.health_feature = p.health_feature;

    // Other common fields
    if (p.color) payload.color = p.color;
    if (p.size) payload.size = p.size;
    if (p.packaging_type) payload.packaging_type = p.packaging_type;
  }

  return payload;
}

// =============================================================================
// Source Attempt Row Builder
// =============================================================================

/**
 * Build enrichment_source_attempts insert rows from source_results[].
 *
 * Each source result becomes one row in the enrichment_source_attempts table.
 * The table has a composite index on (upc, source_slug, attempted_at DESC)
 * but no unique constraint on (attempt_id, source_slug), so we handle
 * dedup by deleting existing rows for this attempt_id before inserting.
 */
export function buildSourceAttemptRows(
  attemptId: string,
  jobId: string,
  upc: string,
  brandId: string | null,
  sourceResults: SourceResultInfo[],
): Array<{
  id?: string;
  job_id: string;
  attempt_id: string;
  upc: string;
  brand_id: string | null;
  source_type: string;
  source_slug: string;
  display_name: string;
  priority: number;
  outcome: string;
  confidence: number;
  matched_fields: string[];
  evidence_url: string | null;
  error_code: string | null;
  error_message: string | null;
  raw_result: Record<string, unknown> | null;
  attempted_at: string;
}> {
  return sourceResults.map((sr) => {
    const outcome = normalizeSourceOutcome(sr.outcome);

    return {
      job_id: jobId,
      attempt_id: attemptId,
      upc,
      brand_id: brandId,
      source_type: sr.sourceType || "distributor",
      source_slug: sr.sourceSlug,
      display_name: sr.sourceSlug, // sourceSlug is the canonical identifier
      priority: 100, // default; will be overridden by cascade ordering where possible
      outcome,
      confidence: sr.confidence ?? 0,
      matched_fields: sr.matchedFields ?? [],
      evidence_url: sr.evidenceUrl ?? null,
      error_code: sr.error_code ?? null,
      error_message: sr.error_message ?? null,
      raw_result: sr.product ? (sr.product as Record<string, unknown>) : null,
      attempted_at: sr.attempted_at ?? new Date().toISOString(),
    };
  });
}

// =============================================================================
// Source Payload Map Builder
// =============================================================================

/**
 * Build a map of sourceSlug → canonical source payload for
 * writing to products_ingestion.sources.
 *
 * Each source result with outcome "found" gets its own key in the map.
 * Source results with other outcomes may optionally be included for
 * debugging but are primarily tracked in enrichment_source_attempts.
 */
export function buildSourcePayloadsByUpc(
  sourceResults: SourceResultInfo[],
): Record<string, Record<string, unknown>> {
  const sources: Record<string, Record<string, unknown>> = {};

  for (const sr of sourceResults) {
    const outcome = normalizeSourceOutcome(sr.outcome);
    if (outcome === "found" || outcome === "not_stocked") {
      // Include not_stocked sources too — they provide useful negative evidence
      // and prevent re-extraction of the same source
      sources[sr.sourceSlug] = {
        ...buildCanonicalSourcePayload(sr),
        _outcome: outcome,
      };
    }
  }

  return sources;
}

// =============================================================================
// Final Status Decision (ADR 0002 — Found-Wins Rule)
// =============================================================================

/**
 * Determine the final product pipeline_status based on all source outcomes.
 *
 * Implements ADR 0002:
 *   - ANY source found → "processed"
 *   - No found AND any source_error → "needs_attention"
 *   - All clean not_stocked or empty → "processed"
 */
export function determineFinalStatus(
  outcomes: NormalizedOutcome[],
): PersistedPipelineStatus {
  if (outcomes.length === 0) {
    return "processed"; // No sources — cascade was empty, move along
  }

  const hasFound = outcomes.some((o) => o === "found");
  if (hasFound) {
    return "processed"; // Found-wins rule
  }

  const hasError = outcomes.some((o) => o === "source_error");
  if (hasError) {
    return "needs_attention"; // All else errored
  }

  // All clean not_stocked or skipped — cascade ran exhaustively
  return "processed";
}

/**
 * Convenience wrapper: extract outcomes from source_results and determine final status.
 */
export function determineStatusFromSourceResults(
  sourceResults: SourceResultInfo[],
): PersistedPipelineStatus {
  const outcomes = sourceResults.map((sr) => normalizeSourceOutcome(sr.outcome));
  return determineFinalStatus(outcomes);
}
