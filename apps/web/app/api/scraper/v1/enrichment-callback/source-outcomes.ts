/**
 * Source Outcome Normalization
 *
 * Pure helper functions to normalize per-source outcome classifications and
 * determine final pipeline status from source results.
 *
 * Handles the three production bugs:
 * 1. Some sources (e.g. Amazon/marketplace) emit product data but leave
 *    `outcome: null`. We infer `found` from product evidence.
 * 2. Some sources (e.g. Bradley) classify clean no-match messages as
 *    `source_error` instead of `not_stocked`. We detect known no-match
 *    messages and reclassify them.
 * 3. Old strict logic ("any source_error -> needs_attention") ignored found
 *    results. New logic: found wins.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceResultLike {
  outcome?: string | null;
  sourceSlug?: string;
  sourceType?: string;
  confidence?: number | null;
  matchedFields?: string[] | null;
  evidenceUrl?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  attemptedAt?: string | null;
  /** Product data with nested extracted fields. Accepts both
   * NestedEnrichedProductFactsV1 (core.facets.media.evidence) and
   * flat key-value structures from legacy/adapters. */
  product?: Record<string, unknown> | null;
}

export interface NormalizedSourceResult extends SourceResultLike {
  /** Normalized outcome (always set) */
  outcome: "found" | "not_stocked" | "source_error" | "skipped";
  /** Whether outcome was inferred rather than explicit */
  inferredOutcome: boolean;
}

export type FinalStatus = "processed" | "needs_attention";

export interface StatusResult {
  status: FinalStatus;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Known clean no-match messages from scraper adapters (case-insensitive). */
const NO_MATCH_PATTERNS = [
  "no matching product card found",
  "no match found",
  "no product match found",
  "no result(s) found",
  "no results found",
];

/**
 * The four explicit outcome values from the runner contract.
 */
const KNOWN_OUTCOMES = new Set([
  "found",
  "not_stocked",
  "source_error",
  "skipped",
]);

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Check if an error message indicates a clean no-match (not stocked).
 */
function isCleanNoMatch(errorMessage: string | null | undefined): boolean {
  if (!errorMessage) return false;
  const lower = errorMessage.toLowerCase();
  return NO_MATCH_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Check if a source result has usable product evidence.
 *
 * We are conservative: only infer `found` when there is clear evidence of
 * successfully extracted product data — not from empty shell results.
 */
function hasUsableProductEvidence(sr: SourceResultLike): boolean {
  // Helper to extract nested values safely
  const getCore = <T>(key: string): T | undefined => {
    if (sr.product && typeof sr.product === "object" && !Array.isArray(sr.product)) {
      const core = (sr.product as Record<string, unknown>)["core"];
      if (core && typeof core === "object") {
        return (core as Record<string, unknown>)[key] as T | undefined;
      }
    }
    return undefined;
  };

  // Non-null product with a name is the strongest signal
  // Check both nested core.name and flat name field (adapters vary)
  const nestedName = getCore<string>("name");
  const flatName = sr.product && typeof sr.product === "object" && !Array.isArray(sr.product)
    ? (sr.product as Record<string, unknown>)["name"] as string | undefined
    : undefined;
  const name = nestedName ?? flatName;
  if (typeof name === "string" && name.trim().length > 0) {
    return true;
  }

  // High confidence with matched fields is also strong evidence
  if (typeof sr.confidence === "number" && sr.confidence >= 0.7) {
    return true;
  }

  // Non-empty matched fields list suggests extraction produced field-level data
  if (Array.isArray(sr.matchedFields) && sr.matchedFields.length > 0) {
    return true;
  }

  // Check for description (nested or flat)
  const nestedDesc = getCore<string>("description");
  const flatDesc = sr.product && typeof sr.product === "object" && !Array.isArray(sr.product)
    ? (sr.product as Record<string, unknown>)["description"] as string | undefined
    : undefined;
  const desc = nestedDesc ?? flatDesc;
  if (typeof desc === "string" && desc.trim().length > 0) {
    return true;
  }

  return false;
}

/**
 * Normalize a single source result's outcome.
 *
 * Rules:
 * - Preserves explicit known outcomes (found, not_stocked, source_error, skipped)
 * - Infers found when null outcome + usable product evidence
 * - Infers not_stocked for known no-match error messages
 * - Defaults to source_error for null outcomes without evidence
 */
function normalizeSourceResultOutcome(
  sr: SourceResultLike,
): NormalizedSourceResult {
  const rawOutcome = sr.outcome ?? null;
  const isExplicit = typeof rawOutcome === "string" && KNOWN_OUTCOMES.has(rawOutcome);

  if (isExplicit) {
    // Explicit outcome — trust it, no inference needed
    return {
      ...sr,
      outcome: rawOutcome as NormalizedSourceResult["outcome"],
      inferredOutcome: false,
    };
  }

  // Missing or unknown outcome — attempt inference
  const errorMessage = sr.errorMessage ?? null;

  // Check for clean no-match patterns first (these are misclassified as errors)
  if (isCleanNoMatch(errorMessage)) {
    return {
      ...sr,
      outcome: "not_stocked",
      inferredOutcome: true,
    };
  }

  // Check for usable product evidence
  if (hasUsableProductEvidence(sr)) {
    return {
      ...sr,
      outcome: "found",
      inferredOutcome: true,
    };
  }

  // Default: genuine source error (couldn't verify either way)
  return {
    ...sr,
    outcome: "source_error",
    inferredOutcome: true,
  };
}

/**
 * Normalize an array of source results.
 */
export function normalizeSourceResults(
  results: SourceResultLike[],
): NormalizedSourceResult[] {
  return results.map(normalizeSourceResultOutcome);
}

// ---------------------------------------------------------------------------
// Status Determination
// ---------------------------------------------------------------------------

/**
 * Determine final pipeline status from normalized source outcomes.
 *
 * Rules:
 * - Any found result -> processed
 * - Else any source_error -> needs_attention
 * - Else (all not_stocked or skipped) -> processed
 */
export function determineSourceOutcomeStatus(
  normalizedResults: NormalizedSourceResult[],
): StatusResult {
  const hasFound = normalizedResults.some((r) => r.outcome === "found");
  if (hasFound) {
    return { status: "processed" };
  }

  const hasSourceError = normalizedResults.some(
    (r) => r.outcome === "source_error" && r.sourceSlug !== "amazon",
  );
  if (hasSourceError) {
    return { status: "needs_attention" };
  }

  // All not_stocked or skipped
  return { status: "processed" };
}

// ---------------------------------------------------------------------------
// Error Message Builder
// ---------------------------------------------------------------------------

/**
 * Build a concise error message summarizing source errors for needs_attention.
 */
export function buildSourceErrorMessage(
  normalizedResults: NormalizedSourceResult[],
): string {
  const errors = normalizedResults
    .filter((r) => r.outcome === "source_error")
    .map((r) => {
      const code = r.errorCode ? ` (${r.errorCode})` : "";
      return `${r.sourceSlug ?? "unknown"}${code}`;
    });

  if (errors.length === 0) {
    return "Source errors encountered during extraction";
  }

  return `Source errors: ${errors.join(", ")}`;
}

// ---------------------------------------------------------------------------
// Convenience: check if approved source result has usable data at top level
// ---------------------------------------------------------------------------

/**
 * Check if an approved-source result has usable product data at the top level
 * (e.g. for payloads without per-source results).
 */
export function hasTopLevelProductData(result: {
  status?: string;
  product?: Record<string, unknown> | null;
  confidence?: { overall?: number };
}): boolean {
  // Must be a success or partial result before considering top-level data
  if (result.status !== "success" && result.status !== "partial") {
    return false;
  }
  // Check both nested core.name and flat name
  const coreName = (result.product as Record<string, unknown> | undefined)?.["core"] as Record<string, unknown> | undefined;
  const nestedName = coreName?.["name"] as string | undefined;
  const flatName = result.product?.["name"] as string | undefined;
  const name = nestedName ?? flatName;
  if (name && name.trim().length > 0) {
    return true;
  }
  // Require both high confidence AND some product evidence
  if (result.confidence?.overall != null && result.confidence.overall >= 0.7) {
    // Check for at least some product data or matched fields
    if (result.product != null) {
      return true;
    }
    return false;
  }
  return false;
}
