/**
 * UPC Resolution proof gates and evidence classification.
 *
 * Maps source outcome + metadata to evidence kinds and confidence ranges
 * as defined in the accepted proof gates table.
 *
 * These are pure functions used by source-results.ts for the reducer and
 * by the enrichment callback for V2 status decisions.
 */

import type {
  EvidenceKind,
  UpcResolutionEvidence,
  UpcResolutionStatus,
} from "./types";
import { validateGtinCheckDigit, compareGtin, extractObservedGtin } from "./upc";
import { normalizeSourceOutcome } from "@/lib/scraper-callback/enrichment-result";
import type { SourceResultInfo } from "@/lib/scraper-callback/enrichment-result";

// =============================================================================
// Confidence ranges per evidence kind (approved gate table)
// =============================================================================

const EVIDENCE_CONFIDENCE_RANGES: Record<
  EvidenceKind,
  { min: number; max: number }
> = {
  distributor_exact_upc: { min: 0.95, max: 0.98 },
  official_exact_upc: { min: 0.98, max: 0.98 },
  official_high_confidence_no_upc: { min: 0.90, max: 0.94 },
  gs1_validation: { min: 0.95, max: 0.95 },
  icecat_exact_gtin: { min: 0.90, max: 0.94 },
  licensed_exact_upc: { min: 0.86, max: 0.92 },
  open_pet_food_facts_exact_barcode: { min: 0.82, max: 0.88 },
  serp_exact_upc: { min: 0.85, max: 0.90 },
  packaging_vlm_exact_upc: { min: 0.95, max: 0.97 },
  manual_override: { min: 1.0, max: 1.0 },
  private_label: { min: 1.0, max: 1.0 },
  candidate_below_gate: { min: 0.0, max: 0.69 },
  conflicting_upc: { min: 0.0, max: 0.0 },
  no_upc_evidence: { min: 0.0, max: 0.0 },
};

/**
 * Check whether a given confidence falls within the acceptable range for
 * an evidence kind.
 */
export function confidenceInRange(
  kind: EvidenceKind,
  confidence: number,
): boolean {
  const range = EVIDENCE_CONFIDENCE_RANGES[kind];
  if (!range) return false;
  return confidence >= range.min && confidence <= range.max;
}

// =============================================================================
// Evidence Classification
// =============================================================================

/**
 * Options for classifySourceEvidence.
 */
export interface ClassifyEvidenceOptions {
  /** Expected UPC/GTIN for this product */
  expectedUpc: string;
  /** Source slug override (falls back to sourceResult.sourceSlug) */
  sourceSlug?: string;
  /** Stage override (e.g. "distributor", "official_brand", "serp") */
  stage?: string;
}

// Normalize source type aliases to canonical stage names.
function normalizeStage(
  sourceType: string | null | undefined,
  sourceSlug?: string,
): string {
  const type = (sourceType ?? "").toLowerCase();

  if (type === "distributor") return "distributor";
  if (type === "official_brand") return "official_brand";
  if (type === "licensed" || type === "licensed_feed") return "licensed";
  if (type === "serp" || type === "serp_discovery") return "serp";
  if (type === "vlm_packaging") return "vlm_packaging";
  if (type === "gs1") return "gs1";
  if (type === "manual") return "manual";

  // Fallback: use sourceType as-is, or sourceSlug
  return type || sourceSlug || "unknown";
}

/**
 * Classify a single source result into an UpcResolutionEvidence.
 *
 * This function determines:
 *   1. What kind of evidence the source result represents
 *   2. Whether it qualifies as accepted proof or is below gate
 *   3. What confidence to assign
 *   4. What gate/reason code to attach
 *
 * Source outcomes:
 *   - `found` with exact UPC match and reasonable confidence → accepted proof
 *   - `found` without exact UPC match → candidate or no_upc_evidence
 *   - `not_stocked` → no_upc_evidence (source ran, product not found)
 *   - `source_error` → no_upc_evidence (source failed)
 *   - `skipped` → no_upc_evidence
 */
export function classifySourceEvidence(
  sourceResult: SourceResultInfo,
  options: ClassifyEvidenceOptions,
): UpcResolutionEvidence {
  const { expectedUpc, stage: stageOverride } = options;
  const observedUpc = extractObservedGtin(
    sourceResult.product as Record<string, unknown> | null | undefined,
  );

  const outcome = normalizeSourceOutcome(sourceResult.outcome);
  const stage =
    stageOverride ??
    sourceResult.resolutionStage ??
    normalizeStage(sourceResult.sourceType, sourceResult.sourceSlug);
  const sourceSlug = options.sourceSlug ?? sourceResult.sourceSlug;
  const confidence = sourceResult.confidence ?? 0;
  const now = new Date().toISOString();

  // Handle non-found outcomes: no UPC evidence
  if (outcome !== "found") {
    return {
      kind: "no_upc_evidence",
      stage,
      sourceSlug,
      expectedUpc,
      confidence: 0,
      matchedFields: sourceResult.matchedFields ?? [],
      evidenceUrl: sourceResult.evidenceUrl ?? null,
      gate: `outcome:${outcome}`,
      extractedAt: sourceResult.attempted_at ?? now,
    };
  }

  // source found something — check for exact UPC match using GTIN equivalence
  const exactUpcMatch =
    observedUpc.length > 0 && compareGtin(observedUpc, expectedUpc);

  if (exactUpcMatch && validateGtinCheckDigit(observedUpc)) {
    // Exact UPC match with valid check digit
    let kind: EvidenceKind;

    if (stage === "distributor") {
      kind = "distributor_exact_upc";
    } else if (stage === "official_brand") {
      kind = "official_exact_upc";
    } else if (stage === "licensed") {
      kind = "licensed_exact_upc";
    } else if (stage === "serp") {
      kind = "serp_exact_upc";
    } else if (stage === "vlm_packaging") {
      kind = "packaging_vlm_exact_upc";
    } else {
      // Default to licensed-level for generic sources
      kind = "licensed_exact_upc";
    }

    const cappedConfidence = Math.min(
      confidence,
      EVIDENCE_CONFIDENCE_RANGES[kind].max,
    );

    return {
      kind,
      stage,
      sourceSlug,
      expectedUpc,
      confidence: cappedConfidence,
      matchedFields: sourceResult.matchedFields ?? [],
      evidenceUrl: sourceResult.evidenceUrl ?? null,
      gate: "exact_upc_match:accepted",
      extractedAt: sourceResult.attempted_at ?? now,
    };
  }

  if (exactUpcMatch && !validateGtinCheckDigit(observedUpc)) {
    // Exact string match but check digit fails — candidate below gate
    return {
      kind: "candidate_below_gate",
      stage,
      sourceSlug,
      expectedUpc,
      observedUpc,
      confidence: Math.min(confidence, 0.5),
      matchedFields: sourceResult.matchedFields ?? [],
      evidenceUrl: sourceResult.evidenceUrl ?? null,
      gate: "exact_upc_match_but_check_digit_failed",
      extractedAt: sourceResult.attempted_at ?? now,
    };
  }

  // Found with product data but no exact UPC match
  if (observedUpc.length > 0 && !compareGtin(observedUpc, expectedUpc)) {
    // Different UPC observed — potential conflict
    return {
      kind: "conflicting_upc",
      stage,
      sourceSlug,
      expectedUpc,
      observedUpc,
      confidence: Math.min(confidence, 0.5),
      matchedFields: sourceResult.matchedFields ?? [],
      evidenceUrl: sourceResult.evidenceUrl ?? null,
      gate: "observed_upc_differs_from_expected",
      extractedAt: sourceResult.attempted_at ?? now,
    };
  }

  // Found with product data but no observed UPC at all
  // Could be official_high_confidence_no_upc if stage is official_brand
  if (stage === "official_brand" && confidence >= 0.9) {
    return {
      kind: "official_high_confidence_no_upc",
      stage,
      sourceSlug,
      expectedUpc,
      confidence: Math.min(confidence, 0.94),
      matchedFields: sourceResult.matchedFields ?? [],
      evidenceUrl: sourceResult.evidenceUrl ?? null,
      gate: "official_high_confidence_no_upc",
      extractedAt: sourceResult.attempted_at ?? now,
    };
  }

  // Generic candidate below gate
  return {
    kind: "candidate_below_gate",
    stage,
    sourceSlug,
    expectedUpc,
    confidence: Math.min(confidence, 0.69),
    matchedFields: sourceResult.matchedFields ?? [],
    evidenceUrl: sourceResult.evidenceUrl ?? null,
    gate: "no_exact_upc_match:candidate",
    extractedAt: sourceResult.attempted_at ?? now,
  };
}

// =============================================================================
// Acceptance check: is this evidence accepted proof?
// =============================================================================

/**
 * Evidence kinds that count as accepted proof for advancing a product.
 */
const ACCEPTED_PROOF_KINDS: ReadonlySet<EvidenceKind> = new Set<EvidenceKind>([
  "distributor_exact_upc",
  "official_exact_upc",
  "official_high_confidence_no_upc",
  "gs1_validation",
  "icecat_exact_gtin",
  "licensed_exact_upc",
  "open_pet_food_facts_exact_barcode",
  "serp_exact_upc",
  "packaging_vlm_exact_upc",
  "manual_override",
  "private_label",
]);

/**
 * Returns true if the evidence kind qualifies as accepted proof.
 */
export function isAcceptedProof(kind: EvidenceKind): boolean {
  return ACCEPTED_PROOF_KINDS.has(kind);
}

/**
 * Returns true if a single evidence item represents accepted proof.
 */
export function isAcceptedEvidence(
  evidence: UpcResolutionEvidence,
): boolean {
  return (
    isAcceptedProof(evidence.kind) &&
    evidence.confidence >=
      EVIDENCE_CONFIDENCE_RANGES[evidence.kind]?.min
  );
}

// =============================================================================
// Publish guard helper
// =============================================================================

/**
 * Determine if a product with the given resolution status may be published.
 *
 * Only `confirmed`, `manual_override`, and `private_label` allow publishing.
 *
 * This is the canonical check used by the publish guard in MVP 3+.
 * In MVP 0 it is available for tests and future integration.
 */
export function isResolutionPublishable(
  status: UpcResolutionStatus,
): boolean {
  return (
    status === "confirmed" ||
    status === "manual_override" ||
    status === "private_label"
  );
}

/**
 * Convert a resolution decision's needsAttention into a pipeline_status hint.
 *
 * In V2 mode:
 *   - Confirmed/override/private-label → pipeline can advance to "processed"
 *   - unresolved/candidate → "needs_attention" (no proof found)
 *   - conflict → "needs_attention" (conflicting evidence)
 */
export function resolutionToPipelineStatusHint(
  status: UpcResolutionStatus,
  hasAnyFound: boolean,
): "processed" | "needs_attention" {
  if (isResolutionPublishable(status)) {
    return "processed";
  }

  // Conflict always needs attention
  if (status === "conflict") {
    return "needs_attention";
  }

  // If no source even found anything, needs attention
  if (!hasAnyFound) {
    return "needs_attention";
  }

  // Unresolved/candidate with some found sources → still needs attention
  // because no proof was accepted
  return "needs_attention";
}
