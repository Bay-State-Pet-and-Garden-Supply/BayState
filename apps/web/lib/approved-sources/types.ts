/**
 * Approved Source Extraction — shared coordinator types
 *
 * These types define the source plan contract between the coordinator (web) and
 * the runner (scraper). The coordinator builds a per-SKU source plan from
 * brand_sources and brand state; the runner executes it.
 */

// =============================================================================
// Source types
// =============================================================================

export type ApprovedSourceType =
  | "official_brand"
  | "distributor"
  | "internal"
  | "licensed_feed";

export type ApprovedSearchMode =
  | "sku_search"
  | "domain_search"
  | "direct_url"
  | "feed_lookup";

// =============================================================================
// Single entry in a source plan
// =============================================================================

export interface ApprovedSourcePlanEntry {
  /** Source type classification */
  sourceType: ApprovedSourceType;
  /** Unique slug for this source (e.g. "phillips", "fromm") */
  sourceSlug: string;
  /** Human-readable display name */
  displayName: string;
  /** Allowed crawl domains (hostnames only, no scheme/path) */
  domains: string[];
  /** Allowed asset/image CDN domains */
  assetDomains: string[];
  /** Crawl4AI adapter slug the runner should use */
  adapterSlug: string;
  /** Whether the source requires authentication */
  requiresAuth: boolean;
  /** Credential reference key (not the actual credentials) */
  credentialRef: string | null;
  /** How to search this source for a given SKU */
  searchMode: ApprovedSearchMode;
  /** Which fields this source is allowed to provide */
  allowedFields: string[];
  /** Priority order (lower = earlier) */
  priority: number;
  /** If true, the runner should try this source first */
  runFirst: boolean;
}

// =============================================================================
// Source policy
// =============================================================================

export interface ApprovedSourcePolicy {
  /** Domain hostnames the runner is allowed to crawl */
  allowedDomains: string[];
  /** Asset/image CDN domains allowed in extracted results */
  allowedAssetDomains: string[];
  /** Domain hostnames the runner must never crawl (blocklist) */
  disallowedDomains: string[];
  /** If true, only approved sources (no open-web fallback) */
  approvedSourcesOnly: boolean;
}

// =============================================================================
// LLM policy
// =============================================================================

export interface ApprovedSourceLLMPolicy {
  /** Whether LLM fallback is allowed at all */
  enabled: boolean;
  /** If true, LLM may only run after deterministic extraction fails */
  onlyAfterDeterministicFailure: boolean;
  /** If true, LLM may only process approved source content */
  approvedSourcesOnly: boolean;
}

// =============================================================================
// Source result
// =============================================================================

export interface ApprovedSourceResult {
  sourceSlug: string;
  sourceType: ApprovedSourceType;
  confidence: number;
  matchedFields: string[];
  evidenceUrl?: string | null;
}

// =============================================================================
// Full source plan (per-SKU)
// =============================================================================

export interface ApprovedSourcePlan {
  /** Schema version for forward compatibility */
  schemaVersion: "v1";
  /** Target SKU */
  sku: string;
  /** Minimal product input (name, price) from import */
  input: {
    name?: string | null;
    price?: number | null;
  };
  /** Resolved brand info */
  brand: {
    id: string;
    name: string;
    slug: string;
  } | null;
  /** Optional distributor slug selected by the user */
  selectedDistributorSlug?: string | null;
  /** Ordered priority list of sources to try */
  priority: ApprovedSourcePlanEntry[];
  /** Source crawl/asset policy */
  sourcePolicy: ApprovedSourcePolicy;
  /** LLM fallback policy */
  llmPolicy: ApprovedSourceLLMPolicy;
}

// =============================================================================
// Extraction mode
// =============================================================================

export type ExtractionMode = "mixed" | "distributor_only" | "ai_only";

// =============================================================================
// Build result (per SKU — either a plan or an error)
// =============================================================================

export type SourcePlanResult =
  | { ok: true; plan: ApprovedSourcePlan }
  | { ok: false; error: string; sku: string };

// =============================================================================
// Domain constants
// =============================================================================

/**
 * Domains that the runner must never crawl or extract from.
 * These are marketplace, retailer, blog, and review sites that
 * pose legal/licensing risks for product data extraction.
 */
export const DISALLOWED_DOMAINS: string[] = [
  "amazon.com",
  "amzn.to",
  "chewy.com",
  "walmart.com",
  "petco.com",
  "petsmart.com",
  "ebay.com",
  "etsy.com",
  "google.com",
  "googleapis.com",
  "googlesyndication.com",
  "youtube.com",
  "target.com",
  "instacart.com",
  "shopify.com",
  "blogspot.com",
  "wordpress.com",
  "medium.com",
];

/**
 * Default LLM policy for approved source extraction.
 */
export const DEFAULT_LLM_POLICY: ApprovedSourceLLMPolicy = {
  enabled: true,
  onlyAfterDeterministicFailure: true,
  approvedSourcesOnly: true,
};
