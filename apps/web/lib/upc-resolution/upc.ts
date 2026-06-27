/**
 * UPC/GTIN normalization, validation, and comparison utilities.
 *
 * Supports GTIN-8, GTIN-12 (UPC-A), GTIN-13 (EAN-13), and GTIN-14.
 *
 * All functions accept raw input strings including common formatting characters
 * (dashes, spaces, parentheses) and normalize to digit-only strings before
 * processing.
 *
 * References:
 *   - GS1 General Specifications (GTIN check digit algorithm)
 *   - https://www.gs1.org/services/how-calculate-check-digit-manually
 */

// =============================================================================
// Normalization
// =============================================================================

/**
 * Strip all non-digit characters from a string, returning only the digits.
 * Returns an empty string if input contains no digits.
 */
export function normalizeGtin(input: string): string {
  return input.replace(/\D/g, "");
}

// =============================================================================
// GTIN Length Detection
// =============================================================================

/**
 * Supported GTIN lengths.
 * GTIN-12 = UPC-A, GTIN-13 = EAN-13, GTIN-8 = EAN-8, GTIN-14 = ITF-14/EAN-14.
 */
export type GtinLength = 8 | 12 | 13 | 14;

const VALID_GTIN_LENGTHS = new Set<number>([8, 12, 13, 14]);

/**
 * Detect the GTIN length from a normalized digit string.
 * Returns null if the length is not a valid GS1 GTIN length.
 */
export function detectGtinLength(digits: string): GtinLength | null {
  if (VALID_GTIN_LENGTHS.has(digits.length)) {
    return digits.length as GtinLength;
  }
  return null;
}

// =============================================================================
// Check Digit Validation (GS1 algorithm)
// =============================================================================

/**
 * GS1 standard check digit validation.
 *
 * Algorithm (for GTIN-13 / EAN-13 as example):
 *   1. From rightmost digit before the check digit, assign alternating weights
 *      of 3, 1, 3, 1, ... moving leftward.
 *   2. Sum the weighted digits.
 *   3. The check digit is the smallest number that, when added to the sum,
 *      produces a multiple of 10.
 *
 * This implementation handles all GTIN lengths by using the same algorithm but
 * varying the starting weight: GTIN-8/12/13/14 all use the same alternating
 * 3-1-3-1 pattern, starting from the rightmost data digit with weight 3.
 *
 * @param digits - A normalized (digits-only) GTIN string
 * @returns `true` if the check digit is valid
 */
export function validateGtinCheckDigit(digits: string): boolean {
  if (!digits || digits.length === 0) return false;

  const length = detectGtinLength(digits);
  if (!length) return false;

  // Extract the check digit (last digit) and the data digits (all but last)
  const checkDigitStr = digits[digits.length - 1];
  const dataDigits = digits.slice(0, -1);

  if (!/^\d$/.test(checkDigitStr)) return false;
  if (!/^\d+$/.test(dataDigits)) return false;

  const checkDigit = parseInt(checkDigitStr, 10);

  // Compute expected check digit using GS1 alternating weights
  // Starting from the rightmost data digit, weight = 3
  let sum = 0;
  let weight = 3;

  for (let i = dataDigits.length - 1; i >= 0; i--) {
    sum += parseInt(dataDigits[i], 10) * weight;
    weight = weight === 3 ? 1 : 3;
  }

  const computedCheckDigit = (10 - (sum % 10)) % 10;

  return computedCheckDigit === checkDigit;
}

// =============================================================================
// High-Level Validation
// =============================================================================

/**
 * Result of a complete GTIN validation.
 */
export interface GtinValidationResult {
  /** Whether the input represents a structurally valid GTIN */
  valid: boolean;
  /** Normalized digit-only string */
  normalized: string;
  /** Detected GTIN length, if valid */
  length: GtinLength | null;
  /** Whether the check digit passes GS1 validation */
  checkDigitValid: boolean;
  /** Human-readable reason if invalid */
  reason?: string;
}

/**
 * Fully validate a GTIN string: normalize, check length, check digit.
 *
 * Accepts GTIN-8, GTIN-12, GTIN-13, GTIN-14.
 * Common input formats: "07330530059412", "0733053005941", "733053005941",
 * "4901234567890", "2001234567890", "042100005264".
 */
export function validateGtin(input: string): GtinValidationResult {
  const normalized = normalizeGtin(input);

  if (!normalized) {
    return {
      valid: false,
      normalized: "",
      length: null,
      checkDigitValid: false,
      reason: "No digits found in input",
    };
  }

  if (normalized.length < 8 || normalized.length > 14) {
    return {
      valid: false,
      normalized,
      length: detectGtinLength(normalized),
      checkDigitValid: false,
      reason: `GTIN length ${normalized.length} is not a valid GS1 length (8, 12, 13, or 14)`,
    };
  }

  const length = detectGtinLength(normalized);
  if (!length) {
    return {
      valid: false,
      normalized,
      length: null,
      checkDigitValid: false,
      reason: `Unsupported GTIN length: ${normalized.length}`,
    };
  }

  const checkDigitValid = validateGtinCheckDigit(normalized);

  return {
    valid: checkDigitValid,
    normalized,
    length,
    checkDigitValid,
    ...(checkDigitValid ? {} : { reason: "Check digit validation failed" }),
  };
}

/**
 * Convenience: check whether a string is a valid GTIN (all checks pass).
 */
export function isValidGtin(input: string): boolean {
  return validateGtin(input).valid;
}

// =============================================================================
// Equivalence and Comparison
// =============================================================================

/**
 * Compare two potential GTIN values for UPC identity equivalence.
 *
 * Normalizes both inputs and considers them equal if:
 *   - They are identical after normalization, OR
 *   - They normalize to the same digit prefix (e.g. GTIN-13 "0733053005941"
 *     and GTIN-12 "073305300594" have the same 12-digit data)
 *     ... Actually, GS1 GTINs can be zero-padded to different lengths.
 *     For identity purposes, we compare the 12/13/14 digit forms by
 *     zero-padding to 14 digits (GTIN-14) and comparing that way.
 *
 * This handles:
 *   - "0733053005941" (GTIN-13) vs "733053005941" (GTIN-12 without leading zero)
 *   - "07330530059412" (GTIN-14) vs "0733053005941" (GTIN-13)
 *   - Leading/trailing whitespace, dashes, spaces
 *
 * @returns true if both inputs represent the same underlying GTIN
 */
export function compareGtin(a: string, b: string): boolean {
  const normA = normalizeGtin(a);
  const normB = normalizeGtin(b);

  if (!normA || !normB) return false;

  // Direct match
  if (normA === normB) return true;

  // Zero-pad both to 14 digits and compare
  const paddedA = normA.padStart(14, "0");
  const paddedB = normB.padStart(14, "0");

  return paddedA === paddedB;
}

/**
 * Ensure a GTIN string has exactly the expected length by zero-padding or
 * validating. Returns null if the normalized input's length is incompatible.
 *
 * @param input - Raw GTIN string
 * @param targetLength - Desired length (8, 12, 13, or 14)
 */
export function padGtinToLength(
  input: string,
  targetLength: GtinLength,
): string | null {
  const normalized = normalizeGtin(input);
  if (!normalized) return null;

  if (normalized.length > targetLength) return null;
  return normalized.padStart(targetLength, "0");
}

/**
 * Convert a GTIN to its GTIN-14 representation by zero-padding.
 */
export function toGtin14(input: string): string | null {
  return padGtinToLength(input, 14);
}

// =============================================================================
// Observed GTIN Extraction from product shapes
// =============================================================================

/**
 * Extract the observed UPC/GTIN from a product result object.
 *
 * Reads identifier fields in priority order:
 *   1. Top-level keys: upc, gtin, gtin12, gtin13, barcode
 *   2. Nested facets entries with definition_slug/name/label
 *      matching upc, gtin, or barcode
 *
 * Returns the normalized digit-only string, or empty string if nothing found.
 *
 * This matches the runner's serialised EnrichedProductFacts shape
 * (apps/scraper/scrapers/ai_search/enrichment_models.py) where identifiers
 * may be represented as facets with value fields.
 */
export function extractObservedGtin(
  product: Record<string, unknown> | null | undefined,
): string {
  if (!product) return "";

  // 1. Check top-level identifier fields
  const topLevelCandidates = ["upc", "gtin", "gtin12", "gtin13", "barcode"];
  for (const key of topLevelCandidates) {
    const val = product[key];
    if (val !== undefined && val !== null) {
      const normalized = normalizeGtin(String(val));
      if (normalized.length > 0) return normalized;
    }
  }

  // 2. Check nested facets entries
  const facets = product["facets"];
  if (Array.isArray(facets)) {
    const facetSlugs = new Set(["upc", "gtin", "barcode"]);
    for (const facet of facets) {
      if (!facet || typeof facet !== "object") continue;
      const f = facet as Record<string, unknown>;
      const slug =
        (f.definition_slug as string | undefined) ??
        (f.name as string | undefined) ??
        (f.label as string | undefined);
      if (slug && typeof slug === "string" && facetSlugs.has(slug.toLowerCase())) {
        const val =
          (f.value as string | undefined) ??
          (f.value_text as string | undefined) ??
          (f.raw_value as string | undefined);
        if (val !== undefined && val !== null) {
          const normalized = normalizeGtin(String(val));
          if (normalized.length > 0) return normalized;
        }
      }
    }
  }

  return "";
}

// =============================================================================
// Check digit computation (for verification or generating valid GTINs)
// =============================================================================

/**
 * Compute the GS1 check digit for a string of data digits.
 *
 * @param dataDigits - The digit string without the check digit (can include non-digits)
 * @returns The computed check digit (0-9), or NaN if input is invalid
 */
export function computeCheckDigit(input: string): number {
  const normalized = normalizeGtin(input);

  if (!normalized || !/^\d+$/.test(normalized)) {
    return NaN;
  }

  let sum = 0;
  let weight = 3;

  for (let i = normalized.length - 1; i >= 0; i--) {
    sum += parseInt(normalized[i], 10) * weight;
    weight = weight === 3 ? 1 : 3;
  }

  return (10 - (sum % 10)) % 10;
}
