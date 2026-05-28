/**
 * Enrichment Result Validation
 *
 * Zod schemas for runtime validation of v1 enrichment result payloads
 * received from the worker via the enrichment-callback endpoint.
 *
 * Uses Zod v4 API conventions.
 */

import { z } from "zod";

// =============================================================================
// Scalar Schemas
// =============================================================================

const enrichmentResultStatusSchema = z.enum([
  "success",
  "partial",
  "failed",
  "error",
]);

const enrichmentModeSchema = z.enum([
  "structured",
  "metadata",
  "llm",
  "mixed",
]);

const requestedExtractionModeSchema = z.enum([
  "mixed",
  "distributor_only",
  "ai_only",
]).nullable().optional();

// =============================================================================
// Source Schema
// =============================================================================

const decisionSchema = z.enum([
  "deterministic_success",
  "deterministic_partial",
  "llm_fallback",
  "failed",
]).nullable().optional();

const scraperImageCaptureResultSchema = z.object({
  status: z.enum(["success", "error"]).optional(),
  data_url: z.string().nullable().optional(),
  error_type: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  original_url: z.string().nullable().optional(),
  status_code: z.number().nullable().optional(),
});

const imageUrlElementSchema = z.union([
  z.string(),
  scraperImageCaptureResultSchema,
]);

const enrichedProductFactsV1Schema = z.object({
  name: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  upc: z.string().nullable().optional(),
  weight: z.string().nullable().optional(),
  dimensions: z.string().nullable().optional(),
  shipping_weight: z.string().nullable().optional(),
  image_urls: z.array(imageUrlElementSchema).optional(),
  ingredients: z.string().nullable().optional(),
  features: z.array(z.string()).optional(),
  pet_type: z.string().nullable().optional(),
  life_stage: z.string().nullable().optional(),
  pet_size: z.string().nullable().optional(),
  food_form: z.string().nullable().optional(),
  flavor: z.string().nullable().optional(),
  special_diet: z.array(z.string()).optional(),
  health_feature: z.array(z.string()).optional(),
  packaging_type: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

const sourceResultInfoSchema = z.object({
  sourceSlug: z.string(),
  sourceType: z.string(),
  confidence: z.number().min(0).max(1),
  matchedFields: z.array(z.string()).optional(),
  evidenceUrl: z.string().nullable().optional(),
  product: enrichedProductFactsV1Schema.nullable().optional(),
});

const enrichmentResultSourceV1Schema = z.object({
  url: z.string().min(1, "URL is required"),
  domain: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  target_id: z.string().uuid().nullable().optional(),
  source_type: z.string().nullable().optional(),
  source_slug: z.string().nullable().optional(),
  approved_source_id: z.string().nullable().optional(),
  evidence: z.string().nullable().optional(),
});

// =============================================================================
// Confidence Schema
// =============================================================================

const enrichmentConfidenceV1Schema = z.object({
  overall: z.number().min(0).max(1),
  fields: z.record(z.string(), z.number().min(0).max(1)),
});

// =============================================================================
// Validation Schema
// =============================================================================

const enrichmentValidationV1Schema = z.object({
  upc_match: z.boolean().nullable().optional(),
  warnings: z.array(z.string()).optional(),
  missing_required: z.array(z.string()).optional(),
});

// =============================================================================
// Attempt Summary Schema
// =============================================================================

const enrichmentAttemptSummaryV1Schema = z.object({
  mode: z.string(),
  status: z.string(),
  error: z.string().nullable().optional(),
});

// =============================================================================
// Top-Level Result Schema
// =============================================================================

const enrichmentResultV1Schema = z.object({
  schema_version: z.literal("v1"),
  upc: z.string().min(1, "UPC is required"),
  source: enrichmentResultSourceV1Schema,
  status: enrichmentResultStatusSchema,
  extracted_at: z.string().datetime({ offset: true }),
  model: z.string().nullable().optional(),
  mode: enrichmentModeSchema,
  requested_extraction_mode: requestedExtractionModeSchema,
  product: enrichedProductFactsV1Schema,
  confidence: enrichmentConfidenceV1Schema,
  validation: enrichmentValidationV1Schema,
  attempts: z.array(enrichmentAttemptSummaryV1Schema),
  decision: decisionSchema,
  llm_used: z.boolean().nullable().optional(),
  source_results: z.array(sourceResultInfoSchema).optional(),
});

// =============================================================================
// Batch Validation Helpers
// =============================================================================

export interface EnrichmentResultBatchResult {
  valid: z.infer<typeof enrichmentResultV1Schema>[];
  invalid: Array<{
    index: number;
    errors: z.ZodError;
  }>;
}

/**
 * Validates a single v1 enrichment result payload.
 * Returns a Zod safeParse result with the parsed data on success.
 */
export function safeValidateEnrichmentResultV1(
  data: unknown,
): z.infer<typeof enrichmentResultV1Schema> | null {
  const result = enrichmentResultV1Schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.error("Zod Validation Error for EnrichmentResultV1:", JSON.stringify(result.error.format(), null, 2));
  return null;
}

/**
 * Validates an array of candidate v1 payloads, separating valid from invalid.
 */
function validateEnrichmentResultBatch(
  candidates: unknown[],
): EnrichmentResultBatchResult {
  const valid: EnrichmentResultBatchResult["valid"] = [];
  const invalid: EnrichmentResultBatchResult["invalid"] = [];

  for (let i = 0; i < candidates.length; i++) {
    const result = enrichmentResultV1Schema.safeParse(candidates[i]);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalid.push({ index: i, errors: result.error });
    }
  }

  return { valid, invalid };
}
