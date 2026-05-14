/**
 * Per-SKU static scrape quality evaluation.
 *
 * Determines whether a product's static scrape results contain enough
 * core identity data to proceed without fallback SERPER/AI extraction.
 *
 * Core identity fields (price/stock/availability are NOT evaluated):
 * - Matched SKU/identifier
 * - Title/name
 * - Brand/manufacturer
 * - Source URL
 */

export type ScrapeQualityResult = 'pass' | 'needs_fallback_review';

export interface ScrapeQualityVerdict {
  result: ScrapeQualityResult;
  missingFields: string[];
  sourceScores: Record<string, number>;
  reason: string;
  hasMatchedSku: boolean;
  matchedSourceKeys: string[];
}

/** Field matchers for core identity fields (case-insensitive by convention) */
const CORE_FIELD_PATTERNS: Record<string, RegExp> = {
  title: /^(title|name|product_name|product_title|item_name)$/i,
  brand: /^(brand|manufacturer|vendor|make|supplier)$/i,
  url: /^(url|link|product_url|source_url|page_url|href)$/i,
};

function hasNonEmptyValue(
  obj: Record<string, unknown>,
  patterns: RegExp,
): boolean {
  for (const key of Object.keys(obj)) {
    if (patterns.test(key)) {
      const val = obj[key];
      if (val !== null && val !== undefined && val !== '') {
        return true;
      }
    }
  }
  return false;
}

function countCoreFields(source: Record<string, unknown>): {
  hasTitle: boolean;
  hasBrand: boolean;
  hasUrl: boolean;
  matchedFields: string[];
} {
  const matchedFields: string[] = [];
  const hasTitle = hasNonEmptyValue(source, CORE_FIELD_PATTERNS.title);
  if (hasTitle) matchedFields.push('title');

  const hasBrand = hasNonEmptyValue(source, CORE_FIELD_PATTERNS.brand);
  if (hasBrand) matchedFields.push('brand');

  const hasUrl = hasNonEmptyValue(source, CORE_FIELD_PATTERNS.url);
  if (hasUrl) matchedFields.push('url');

  return { hasTitle, hasBrand, hasUrl, matchedFields };
}

const IDENTIFIER_FIELD_RE = /^(sku|id|identifier|gtin|upc|item_id|product_id)$/i;

/**
 * Check if a source has an explicit identifier matching the target SKU.
 *
 * If the source has NO identifier fields at all, the association is implicit
 * (the scraper was assigned to scrape this specific SKU) so we return true.
 * If the source has identifier fields, at least one must match the SKU.
 */
function hasMatchedIdentifier(
  source: Record<string, unknown>,
  sku: string,
): boolean {
  const identFields: string[] = [];
  let foundExactMatch = false;

  for (const key of Object.keys(source)) {
    const val = source[key];
    if (typeof val !== 'string' && typeof val !== 'number') continue;
    const strVal = String(val).trim();

    // Direct field value equals sku (any field)
    if (strVal === sku) {
      foundExactMatch = true;
    }

    // Track identifier-typed fields
    if (IDENTIFIER_FIELD_RE.test(key)) {
      identFields.push(key);
    }
  }

  // If we found any exact match, success
  if (foundExactMatch) return true;

  // If source has zero identifier-typed fields, association is implicit
  if (identFields.length === 0) return true;

  // Source has identifier fields but none matched — explicit mismatch
  return false;
}

function scoreSource(
  source: Record<string, unknown>,
  sku: string,
): { score: number; matchedFields: string[] } {
  let score = 0;
  const matchedFields: string[] = [];

  // Identifier match is worth 2 points (most important)
  if (hasMatchedIdentifier(source, sku)) {
    score += 2;
    matchedFields.push('matched_SKU');
  }

  const { hasTitle, hasBrand, hasUrl, matchedFields: coreFields } =
    countCoreFields(source);
  if (hasTitle) {
    score += 1;
  }
  if (hasBrand) {
    score += 1;
  }
  if (hasUrl) {
    score += 1;
  }

  matchedFields.push(...coreFields);

  return { score, matchedFields };
}

/**
 * Evaluate whether a SKU's static scrape results meet quality thresholds.
 *
 * A `pass` verdict requires at least one source with:
 * - A matched SKU/identifier (or source content that clearly maps to the SKU)
 * - At least 2 of: title/name, brand/manufacturer, source URL
 *   with at least title present (title + brand OR title + URL)
 *
 * Price, stock, and availability are explicitly NOT evaluated.
 */
export function evaluateScrapeQuality(
  sku: string,
  input: Record<string, unknown> | null,
  sources: Record<string, unknown>,
): ScrapeQualityVerdict {
  const sourceKeys = Object.keys(sources);

  // No sources at all
  if (sourceKeys.length === 0) {
    return {
      result: 'needs_fallback_review',
      missingFields: ['any source'],
      sourceScores: {},
      reason: `No sources found for SKU "${sku}"`,
      hasMatchedSku: false,
      matchedSourceKeys: [],
    };
  }

  const sourceScores: Record<string, number> = {};
  const matchedSourceKeys: string[] = [];
  let bestScore = 0;
  let bestMissingFields: string[] = [];
  let bestReason = '';

  for (const sourceKey of sourceKeys) {
    const sourceVal = sources[sourceKey];
    if (!sourceVal || typeof sourceVal !== 'object') {
      sourceScores[sourceKey] = 0;
      continue;
    }

    const source = sourceVal as Record<string, unknown>;
    const { score, matchedFields } = scoreSource(source, sku);
    sourceScores[sourceKey] = score;

    if (score > 0) {
      matchedSourceKeys.push(sourceKey);
    }

    if (score > bestScore) {
      bestScore = score;

      const missing: string[] = [];
      if (!matchedFields.includes('matched_SKU')) missing.push('identifier/SKU match');
      if (!matchedFields.includes('title')) missing.push('title/name');
      if (!matchedFields.includes('brand')) missing.push('brand/manufacturer');
      if (!matchedFields.includes('url')) missing.push('source URL');

      const hasTitle = matchedFields.includes('title');
      const hasBrand = matchedFields.includes('brand');
      const hasUrl = matchedFields.includes('url');

      if (hasTitle && (hasBrand || hasUrl)) {
        bestReason = `Source "${sourceKey}" has sufficient identity data`;
      } else {
        bestReason = `Source "${sourceKey}" missing required identity fields: ${missing.join(', ') || 'insufficient data'}`;
      }

      bestMissingFields = missing;
    }
  }

  // Determine pass/fail based on best source
  // Pass requires: matched identifier + title + (brand OR url)
  const bestSourceKey = matchedSourceKeys.length > 0
    ? sourceKeys.find((k) => sourceScores[k] === bestScore) || ''
    : '';
  const bestSource = bestSourceKey && sources[bestSourceKey]
    ? (sources[bestSourceKey] as Record<string, unknown>)
    : null;

  const hasIdentifier = bestSource
    ? hasMatchedIdentifier(bestSource, sku)
    : false;
  const { hasTitle, hasBrand, hasUrl } = bestSource
    ? countCoreFields(bestSource)
    : { hasTitle: false, hasBrand: false, hasUrl: false };

  const passes = hasIdentifier && hasTitle && (hasBrand || hasUrl);

  if (passes) {
    return {
      result: 'pass',
      missingFields: [],
      sourceScores,
      reason: bestReason || 'Static scrape quality is sufficient',
      hasMatchedSku: true,
      matchedSourceKeys,
    };
  }

  const missingFields: string[] = [];
  if (!hasIdentifier) missingFields.push('identifier/SKU match');
  if (!hasTitle) missingFields.push('title/name');
  if (!hasBrand) missingFields.push('brand/manufacturer');
  if (!hasUrl) missingFields.push('source URL');

  return {
    result: 'needs_fallback_review',
    missingFields,
    sourceScores,
    reason: bestReason || `Insufficient identity data for SKU "${sku}"`,
    hasMatchedSku: hasIdentifier,
    matchedSourceKeys,
  };
}
