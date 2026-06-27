/**
 * Source results → product-level UPC resolution state reducer.
 *
 * Takes an array of SourceResultInfo plus the expected UPC and produces
 * a UpcResolutionDecision: final status, stage, confidence, evidence list,
 * and needsAttention flag.
 *
 * Used by the enrichment callback route when V2 mode is active, and by
 * the enrichment-result V2 status helper.
 */

import type {
  UpcResolutionDecision,
  UpcResolutionStatus,
  UpcResolutionEvidence,
} from "./types";
import { classifySourceEvidence, isAcceptedEvidence } from "./gates";
import { normalizeSourceOutcome } from "@/lib/scraper-callback/enrichment-result";
import type { SourceResultInfo } from "@/lib/scraper-callback/enrichment-result";

// =============================================================================
// Evidence sorting priority (highest confidence / most authoritative first)
// =============================================================================

const STAGE_PRIORITY: Record<string, number> = {
  distributor: 1,
  official_brand: 2,
  licensed: 3,
  gs1: 4,
  serp: 5,
  vlm_packaging: 6,
  manual: 7,
};

function stageSortWeight(stage: string): number {
  return STAGE_PRIORITY[stage] ?? 99;
}

/**
 * Reduce an array of source results into a single product-level UPC resolution decision.
 *
 * Algorithm:
 *   1. Classify each source result into evidence.
 *   2. Check for accepted proof evidence.
 *   3. Check for conflicting UPC evidence.
 *   4. Derive final status.
 *
 * @param sourceResults - All source results from the enrichment callback
 * @param expectedUpc - The expected/authoritative UPC for this product
 * @returns A UpcResolutionDecision
 */
export function reduceSourceResults(
  sourceResults: SourceResultInfo[],
  expectedUpc: string,
): UpcResolutionDecision {
  if (sourceResults.length === 0) {
    return {
      status: "unresolved",
      stage: "none",
      confidence: 0,
      evidence: [],
      needsAttention: false,
    };
  }

  // 1. Classify each source result into evidence
  const evidenceList: UpcResolutionEvidence[] = sourceResults.map((sr) =>
    classifySourceEvidence(sr, { expectedUpc }),
  );

  // 2. Sort evidence by stage priority then confidence descending
  evidenceList.sort((a, b) => {
    const stageDiff = stageSortWeight(a.stage) - stageSortWeight(b.stage);
    if (stageDiff !== 0) return stageDiff;
    return b.confidence - a.confidence;
  });

  // 3. Find accepted proof evidence
  const acceptedProofs = evidenceList.filter(isAcceptedEvidence);

  // 4. Find conflicting UPC evidence (only actual conflicts, not below-gate candidates)
  const conflicts = evidenceList.filter(
    (e) => e.kind === "conflicting_upc",
  );

  // 5. Check for conflicting but credible evidence
  //    If there are both accepted proofs and conflicting evidence, the conflict
  //    wins — route to manual review.
  const hasAnyOutcomeFound = sourceResults.some(
    (sr) => normalizeSourceOutcome(sr.outcome) === "found",
  );

  // Determine status
  let status: UpcResolutionStatus;
  let stage: string;
  let confidence: number;

  if (conflicts.length > 0 && acceptedProofs.length > 0) {
    // Credible conflict alongside accepted proof — route to manual review
    status = "conflict";
    stage = conflicts[0].stage;
    confidence = Math.max(conflicts[0].confidence, acceptedProofs[0].confidence);
  } else if (conflicts.length > 0 && acceptedProofs.length === 0) {
    // Conflicting UPC but no accepted proof
    status = "conflict";
    stage = conflicts[0].stage;
    confidence = conflicts[0].confidence;
  } else if (acceptedProofs.length > 0) {
    // Accepted proof found — confirmed
    status = "confirmed";
    stage = acceptedProofs[0].stage;
    confidence = acceptedProofs[0].confidence;
  } else if (hasAnyOutcomeFound) {
    // Found something but no accepted proof → candidate
    status = "candidate";
    stage = evidenceList[0]?.stage ?? "unknown";
    confidence = evidenceList[0]?.confidence ?? 0;
  } else {
    // No found outcomes at all → unresolved
    status = "unresolved";
    stage = "none";
    confidence = 0;
  }

  // 6. Determine needsAttention
  // Narrowing: after the if/else chain above, TS infers a subset of UpcResolutionStatus
  // (confirmed | conflict | candidate | unresolved). Manual override/private_label are
  // not assigned above, so the comparisons would always be true. We use a widened check.
  const needsAttention = (status as string) !== "confirmed"
    && (status as string) !== "manual_override"
    && (status as string) !== "private_label";

  return {
    status,
    stage,
    confidence,
    evidence: evidenceList,
    needsAttention,
  };
}

/**
 * Convenience: build the V2 pipeline_status and upc_resolution_* fields
 * that should be written to products_ingestion in V2 mode.
 */
export function buildV2ResolutionUpdate(
  sourceResults: SourceResultInfo[],
  expectedUpc: string,
): {
  pipeline_status: "processed" | "needs_attention";
  upc_resolution_status: UpcResolutionStatus;
  upc_resolution_stage: string;
  upc_resolution_confidence: number;
  upc_resolution_evidence: UpcResolutionEvidence[];
} {
  const decision = reduceSourceResults(sourceResults, expectedUpc);

  const pipelineStatus =
    decision.status === "confirmed" || decision.status === "manual_override" || decision.status === "private_label"
      ? "processed"
      : "needs_attention";

  return {
    pipeline_status: pipelineStatus,
    upc_resolution_status: decision.status,
    upc_resolution_stage: decision.stage,
    upc_resolution_confidence: decision.confidence,
    upc_resolution_evidence: decision.evidence,
  };
}
