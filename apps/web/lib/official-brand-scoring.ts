import { normalizeOfficialBrandDomain } from '@/lib/official-brand-workflow';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SerperCandidate {
  url: string;
  title: string;
  snippet: string;
  result_type: 'organic' | 'knowledge_graph';
}

export interface MergedCandidate extends SerperCandidate {
  appeared_in_phases: number[];
}

export interface ScoredCandidate extends SerperCandidate {
  rank: number;
  confidence: number;
  selection_tier: 'official_domain' | 'preferred_domain' | 'knowledge_graph' | 'organic';
  composite_score: number;
  appeared_in_phases: number[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SITE_EXCLUSIONS = [
  'amazon.com',
  'ebay.com',
  'walmart.com',
  'target.com',
  'chewy.com',
  'petco.com',
  'petsmart.com',
  'homedepot.com',
  'lowes.com',
  'tractorsupply.com',
];

const AMBIGUOUS_NUMERIC_IDENTIFIER_MAX_LENGTH = 5;
export const CROSS_PHASE_BONUS = 10;
export const SKU_IN_CONTENT_BONUS = 5;
export const PREDICTED_NAME_OVERLAP_BONUS = 3;
export const KNOWLEDGE_GRAPH_BONUS = 40;

// ---------------------------------------------------------------------------
// Query builders
// ---------------------------------------------------------------------------

/**
 * Returns true when an identifier-only query is likely too generic
 * to stand on its own (e.g. short all-numeric values that could be
 * UPC fragments rather than unique SKUs).
 */
export function isAmbiguousIdentifier(sku: string): boolean {
  const cleaned = sku.trim();
  if (!cleaned) return false;
  return /^\d+$/.test(cleaned) && cleaned.length < AMBIGUOUS_NUMERIC_IDENTIFIER_MAX_LENGTH;
}

/** Phase 1 search query: SKU-only for strong identifiers, brand+SKU for ambiguous ones. */
export function buildPhase1Query(sku: string, brandName?: string): string {
  const skuClean = sku.trim();
  if (!skuClean) return '';
  if (brandName && isAmbiguousIdentifier(skuClean)) {
    return `${brandName.trim()} ${skuClean}`;
  }
  return skuClean;
}

/** Phase 2 search query: consolidated product name + brand. */
export function buildPhase2Query(predictedName: string, brandName?: string): string {
  const parts = [predictedName.trim(), brandName?.trim()].filter(Boolean);
  return parts.join(' ');
}

/** Append -site: exclusion directives to a base query string. */
export function buildExclusionQuery(baseQuery: string): string {
  const clean = baseQuery.trim();
  if (!clean) return '';
  const exclusions = SITE_EXCLUSIONS.map((d) => `-site:${d}`).join(' ');
  return `${clean} ${exclusions}`;
}

/**
 * Build site-constrained rescue queries for known official/preferred domains.
 * Returns `["site:domain1 query", "site:domain2 query", ...]`.
 */
export function buildSiteConstrainedQueries(domains: string[], query: string): string[] {
  const cleanQuery = query.trim();
  if (!cleanQuery || domains.length === 0) return [];
  return domains
    .map((d) => normalizeOfficialBrandDomain(d))
    .filter(Boolean)
    .map((normalized) => `site:${normalized} ${cleanQuery}`);
}

// ---------------------------------------------------------------------------
// Merging & deduplication
// ---------------------------------------------------------------------------

/**
 * Merge Phase 1 and Phase 2 search results, tagging each URL with the
 * phases it appeared in. Deduplicates by URL, keeping the result with
 * the most phases (ties → keep first occurrence).
 */
export function mergeAndDedupeCandidates(
  phase1: SerperCandidate[],
  phase2: SerperCandidate[],
): MergedCandidate[] {
  const byUrl = new Map<string, MergedCandidate>();

  for (const c of phase1) {
    byUrl.set(c.url, { ...c, appeared_in_phases: [1] });
  }

  for (const c of phase2) {
    const existing = byUrl.get(c.url);
    if (existing) {
      existing.appeared_in_phases = [1, 2];
    } else {
      byUrl.set(c.url, { ...c, appeared_in_phases: [2] });
    }
  }

  return Array.from(byUrl.values());
}

// ---------------------------------------------------------------------------
// Domain-tier helpers
// ---------------------------------------------------------------------------

export function getSelectionTier(
  url: string,
  officialDomains: string[],
  preferredDomains: string[],
): 'official_domain' | 'preferred_domain' | 'organic' {
  const normalizedDomain = normalizeOfficialBrandDomain(url);
  if (!normalizedDomain) return 'organic';

  const normalizedOfficial = officialDomains
    .map((d) => normalizeOfficialBrandDomain(d))
    .filter(Boolean) as string[];
  const normalizedPreferred = preferredDomains
    .map((d) => normalizeOfficialBrandDomain(d))
    .filter(Boolean) as string[];

  if (
    normalizedOfficial.some((d) => normalizedDomain === d || normalizedDomain.endsWith(`.${d}`))
  ) {
    return 'official_domain';
  }

  if (
    normalizedPreferred.some((d) => normalizedDomain === d || normalizedDomain.endsWith(`.${d}`))
  ) {
    return 'preferred_domain';
  }

  return 'organic';
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * Rank merged candidates by domain tier, cross-phase confirmation,
 * content signals, and LLM confidence.
 */
export function rankCandidates(
  candidates: MergedCandidate[],
  confidenceScores: Map<number, number>,
  officialDomains: string[],
  preferredDomains: string[],
  sku: string,
  predictedName: string | null,
): ScoredCandidate[] {
  const normalDomain = normalizeOfficialBrandDomain;

  const normalizedOfficial = officialDomains
    .map((d) => normalDomain(d))
    .filter(Boolean) as string[];
  const normalizedPreferred = preferredDomains
    .map((d) => normalDomain(d))
    .filter(Boolean) as string[];

  const scored: Array<
    ScoredCandidate & { sortTier: number }
  > = candidates.map((c, i) => {
    const domain = normalDomain(c.url);
    const inOfficial =
      domain !== undefined &&
      normalizedOfficial.some((d) => domain === d || domain.endsWith(`.${d}`));
    const inPreferred =
      domain !== undefined &&
      normalizedPreferred.some((d) => domain === d || domain.endsWith(`.${d}`));

    // --- Tier ---
    let tier: ScoredCandidate['selection_tier'];
    let sortTier: number;

    if (inOfficial) {
      tier = 'official_domain';
      sortTier = 0;
    } else if (inPreferred) {
      tier = 'preferred_domain';
      sortTier = 1;
    } else if (c.result_type === 'knowledge_graph') {
      tier = 'knowledge_graph';
      sortTier = 2;
    } else {
      tier = 'organic';
      sortTier = 3;
    }

    // --- Base score ---
    let composite = confidenceScores.get(i) ?? 0;

    // Domain-tier bonuses
    if (inOfficial) {
      composite += c.appeared_in_phases.length > 1 ? 100 : 80;
    } else if (inPreferred) {
      composite += c.appeared_in_phases.length > 1 ? 60 : 50;
    }

    // Cross-phase confirmation bonus
    if (c.appeared_in_phases.length > 1) {
      composite += CROSS_PHASE_BONUS;
    }

    // Knowledge Graph bonus (when not already tiered above)
    if (c.result_type === 'knowledge_graph' && !inOfficial && !inPreferred) {
      composite += KNOWLEDGE_GRAPH_BONUS;
    }

    // SKU appears in URL/title/snippet
    if (sku && `${c.url} ${c.title} ${c.snippet}`.toLowerCase().includes(sku.toLowerCase())) {
      composite += SKU_IN_CONTENT_BONUS;
    }

    // Predicted name overlap with title (≥2 words)
    if (predictedName && c.title) {
      const predictedWords = new Set(predictedName.toLowerCase().split(/\s+/).filter(Boolean));
      if (predictedWords.size >= 2) {
        const titleWords = c.title.toLowerCase().split(/\s+/);
        const overlap = titleWords.filter((w) => predictedWords.has(w)).length;
        if (overlap >= 2) {
          composite += PREDICTED_NAME_OVERLAP_BONUS;
        }
      }
    }

    return {
      ...c,
      rank: 0,
      confidence: confidenceScores.get(i) ?? 0,
      selection_tier: tier,
      composite_score: composite,
      sortTier,
    };
  });

  scored.sort((a, b) => {
    if (a.sortTier !== b.sortTier) return a.sortTier - b.sortTier;
    if (b.composite_score !== a.composite_score) return b.composite_score - a.composite_score;
    return 0;
  });

  return scored.map((item, idx) => ({
    url: item.url,
    title: item.title,
    snippet: item.snippet,
    result_type: item.result_type,
    rank: idx + 1,
    confidence: item.confidence,
    selection_tier: item.selection_tier,
    composite_score: item.composite_score,
    appeared_in_phases: item.appeared_in_phases,
  }));
}
