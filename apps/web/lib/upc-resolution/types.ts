/**
 * UPC Resolution V2 types
 *
 * Shared evidence, decision, and status types for the UPC-proof cascade.
 * These types are consumed by gates, source-results reducer, enrichment-result
 * helpers, the enrichment callback route, and admin review UI.
 */

import type { NormalizedOutcome } from "@/lib/scraper-callback/enrichment-result";

// =============================================================================
// UPC Resolution Status — product-level classification
// =============================================================================

/**
 * Product-level UPC resolution status.
 *
 * - `unresolved`: No accepted proof; no candidate evidence above gate.
 * - `candidate`: Plausible evidence found but below accepted-proof gate.
 * - `confirmed`: At least one accepted proof gate was satisfied.
 * - `conflict`: Credible but conflicting UPCs or brand/UPC mismatch.
 * - `manual_override`: Admin manually confirmed a UPC with supporting note.
 * - `private_label`: Admin marked this product as private-label / no GS1 UPC.
 */
export type UpcResolutionStatus =
  | "unresolved"
  | "candidate"
  | "confirmed"
  | "conflict"
  | "manual_override"
  | "private_label";

/** All valid resolution status values for constraint checks. */
export const UPC_RESOLUTION_STATUSES: readonly UpcResolutionStatus[] = [
  "unresolved",
  "candidate",
  "confirmed",
  "conflict",
  "manual_override",
  "private_label",
] as const;

export function isUpcResolutionStatus(s: string): s is UpcResolutionStatus {
  return (UPC_RESOLUTION_STATUSES as readonly string[]).includes(s);
}

// =============================================================================
// Evidence Classification
// =============================================================================

/**
 * Known evidence-kind identifiers for classifying a source result's proof level.
 * Maps to the accepted/rejected gates in docs/adr/0006-upc-resolution-proof-required.md.
 */
export type EvidenceKind =
  /** Distributor product page explicitly matches expected UPC/GTIN */
  | "distributor_exact_upc"
  /** Official brand domain page contains expected UPC/GTIN */
  | "official_exact_upc"
  /** Official domain high-confidence match without explicit UPC */
  | "official_high_confidence_no_upc"
  /** GS1 GTIN validation returned licensee/brand match */
  | "gs1_validation"
  /** Open Icecat exact GTIN plus brand match */
  | "icecat_exact_gtin"
  /** Licensed/commercial provider echoes exact UPC with brand/title/variant gates */
  | "licensed_exact_upc"
  /** Open Pet Food Facts exact barcode match */
  | "open_pet_food_facts_exact_barcode"
  /** SERP-crawled page contains exact expected UPC with brand/title gates */
  | "serp_exact_upc"
  /** Packaging VLM extraction digits match expected UPC with check digit pass */
  | "packaging_vlm_exact_upc"
  /** Admin manual override with evidence URL and note */
  | "manual_override"
  /** Private label / no GS1 UPC — admin-marked exception */
  | "private_label"
  /** Candidate evidence below accepted-proof gate confidence */
  | "candidate_below_gate"
  /** Conflicting UPC observed from a credible source */
  | "conflicting_upc"
  /** Source result had no UPC-relevant evidence */
  | "no_upc_evidence";

// =============================================================================
// Source-level evidence per source result
// =============================================================================

/**
 * Evidence captured from one source result during a UPC resolution attempt.
 * Stored in products_ingestion.upc_resolution_evidence as a JSONB array,
 * and in upc_resolution_events.evidence per event.
 */
export interface UpcResolutionEvidence {
  /** Evidence-kind identifier (e.g. "distributor_exact_upc", "candidate_below_gate") */
  kind: EvidenceKind;
  /** Resolution stage that produced this evidence (e.g. "distributor", "official_brand") */
  stage: string;
  /** Source slug (e.g. "phillips", "fromm") */
  sourceSlug: string;
  /** Expected UPC/GTIN for this product */
  expectedUpc: string;
  /** Observed UPC/GTIN if different from expected (omitted when identical) */
  observedUpc?: string;
  /** Confidence score for this specific evidence (0.0–1.0) */
  confidence: number;
  /** Fields that were matched to produce this evidence */
  matchedFields: string[];
  /** URL of the page where evidence was found */
  evidenceUrl?: string | null;
  /** Machine-readable gate/reason code for acceptance or rejection */
  gate: string;
  /** Candidate URLs discovered but not accepted as proof */
  candidateUrls?: string[];
  /** ISO timestamp of when this evidence was extracted */
  extractedAt: string;
}

// =============================================================================
// Product-level resolution decision
// =============================================================================

/**
 * Result of reducing all source outcomes into a single product-level decision.
 * Produced by reduceSourceResults in source-results.ts.
 */
export interface UpcResolutionDecision {
  /** Final resolution status for the product */
  status: UpcResolutionStatus;
  /** Stage identifier from the best/accepted evidence */
  stage: string;
  /** Overall confidence (0.0–1.0) */
  confidence: number;
  /** All evidence collected across source results */
  evidence: UpcResolutionEvidence[];
  /** True when the product should be flagged for manual review */
  needsAttention: boolean;
}

// =============================================================================
// V2 Job Config Keys
// =============================================================================

/**
 * Keys in enrichment_jobs.config JSON that enable UPC Resolution V2 behavior.
 */
export const UPC_RESOLUTION_V2_CONFIG_KEYS = {
  /** String policy key: "proof_required" enables V2 strict mode */
  POLICY_KEY: "upc_resolution_policy",
  /** Boolean feature flag key: true enables V2 (alternative to policy key) */
  V2_FLAG_KEY: "upc_resolution_v2",
} as const;

/**
 * Accepted values for upc_resolution_policy job config field.
 */
export type UpcResolutionPolicy = "proof_required" | "legacy" | undefined;

/**
 * Check whether a job config enables UPC Resolution V2 behavior.
 */
export function isUpcResolutionV2Enabled(
  jobConfig: Record<string, unknown> | null | undefined,
): boolean {
  if (!jobConfig) return false;

  const policy = jobConfig[UPC_RESOLUTION_V2_CONFIG_KEYS.POLICY_KEY];
  if (policy === "proof_required") return true;

  const v2Flag = jobConfig[UPC_RESOLUTION_V2_CONFIG_KEYS.V2_FLAG_KEY];
  if (v2Flag === true) return true;

  return false;
}

// =============================================================================
// Pipeline status helper for V2 mode
// =============================================================================

/**
 * Whether a decision's status allows the product to advance past UPC resolution
 * without manual review. Used by V2 callback logic and the publish guard.
 *
 * Only `confirmed`, `manual_override`, and `private_label` satisfy the proof
 * requirement. `unresolved`, `candidate`, and `conflict` all require attention.
 */
export function hasAcceptedUPCProof(decision: UpcResolutionDecision): boolean {
  return (
    decision.status === "confirmed" ||
    decision.status === "manual_override" ||
    decision.status === "private_label"
  );
}
