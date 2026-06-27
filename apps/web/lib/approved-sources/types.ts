/**
 * Approved Source Extraction — shared coordinator types
 *
 * These types define the source plan contract between the coordinator (web) and
 * the runner (scraper). The coordinator builds a per-UPC source plan from
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
  | "upc_search"
  | "domain_search"
  | "direct_url"
  | "feed_lookup";

// =============================================================================
// Extraction mode
// =============================================================================

export type ExtractionMode = "mixed" | "distributor_only" | "ai_only";

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
  /** How to search this source for a given UPC */
  searchMode: ApprovedSearchMode;
  /** Which fields this source is allowed to provide */
  allowedFields: string[];
  /** Priority order (lower = earlier) */
  priority: number;
  /** If true, the runner should try this source first */
  runFirst: boolean;
  /**
   * UPC Resolution V2 stage label.
   * Set by the coordinator when V2 cascade is enabled.
   * Values: "distributor", "official_brand", "licensed", "serp"
   */
  resolutionStage?: string;
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
// Full source plan (per-UPC)
// =============================================================================

export interface ApprovedSourcePlan {
  /** Schema version for forward compatibility */
  schemaVersion: "v1";
  /** Target UPC */
  upc: string;
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
  /** Requested extraction mode for this plan. */
  extractionMode: ExtractionMode;
  /** Optional distributor slug selected by the user */
  selectedDistributorSlug?: string | null;
  /** Ordered priority list of sources to try */
  priority: ApprovedSourcePlanEntry[];
  /** Source crawl/asset policy */
  sourcePolicy: ApprovedSourcePolicy;
}

// =============================================================================
// Profile Snapshot types
// =============================================================================

/**
 * Immutable snapshot of a Site Extraction Profile version embedded in job config.
 * Resolved by the coordinator at job-creation time, never queried at runtime.
 */
export interface ProfileSnapshot {
  /** The site_extraction_profiles row id */
  profile_id: string;
  /** The active site_extraction_profile_versions row id */
  version_id: string;
  /** Deterministic hash of rules + compiled schema */
  version_hash: string;
  /** BayState Field Evidence Rules (declarative JSON) */
  rules: Record<string, unknown>;
  /** Compiled Crawl4AI JsonCssExtractionStrategy schema */
  compiled_crawl4ai_schema: Record<string, unknown> | null;
  /** Owner scope that uniquely identifies the profile */
  scope: {
    brand_id: string;
    source_slug: string;
    canonical_domain: string;
  };
}

// =============================================================================
// Failure codes
// =============================================================================

export type SourcePlanFailureCode =
  | "product_not_found"
  | "missing_brand"
  | "no_sources_configured"
  | "ai_only_no_official_domains"
  | "database_error"
  | "source_cascade_not_configured";

// =============================================================================
// Build result (per UPC — either a plan or an error)
// =============================================================================

export type SourcePlanResult =
  | { ok: true; plan: ApprovedSourcePlan }
  | { ok: false; error: string; upc: string; code?: SourcePlanFailureCode };

// =============================================================================
// Domain constants
// =============================================================================

/**
 * Domains that the runner must never crawl or extract from.
 * These are marketplace, retailer, blog, and review sites that
 * pose legal/licensing risks for product data extraction.
 */
export const DISALLOWED_DOMAINS: string[] = [
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
