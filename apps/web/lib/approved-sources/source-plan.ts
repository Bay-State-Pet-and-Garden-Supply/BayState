/**
 * Approved Source Plan Builder
 *
 * Builds per-UPC source plans from the brand_sources table and product brand state.
 * This is the coordinator's main function for creating source plans that the
 * runner then executes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type ApprovedSourcePlan,
  type ApprovedSourcePlanEntry,
  type ApprovedSourcePolicy,
  type ApprovedSourceType,
  type ApprovedSearchMode,
  type ProfileSnapshot,
  type SourcePlanFailureCode,
  type SourcePlanResult,
  DISALLOWED_DOMAINS,
} from "./types";
import { getUntriedAndErroredSources, isCascadeConfigured } from "./source-cascade";

// =============================================================================
// Database row shapes (minimal, not full DB types)
// =============================================================================

interface ProductRow {
  upc: string;
  brand_id: string | null;
  input: {
    name?: string | null;
    price?: number | null;
  } | null;
}

interface BrandRow {
  id: string;
  name: string;
  slug: string;
  official_domains: string[];
  preferred_domains?: string[];
  source_cascade_configured_at?: string | null;
}

interface BrandSourceRow {
  id: string;
  brand_id: string;
  source_type: string;
  source_slug: string;
  display_name: string;
  domains: string[];
  asset_domains: string[];
  crawl4ai_adapter_slug: string;
  requires_auth: boolean;
  credential_ref: string | null;
  search_mode: string;
  allowed_fields: string[];
  priority: number;
  enabled: boolean;
}

// =============================================================================
// Domain helpers
// =============================================================================

/**
 * Normalize a domain (or URL) to a clean hostname.
 * Strips scheme, leading "www.", path/query/fragment, and default ports.
 */
export function normalizeDomain(raw: string): string {
  let d = raw.trim().toLowerCase();

  // Strip scheme
  if (d.includes("://")) {
    d = d.split("://")[1];
  }

  // Strip "www." prefix
  if (d.startsWith("www.")) {
    d = d.slice(4);
  }

  // Strip path, query, fragment
  const slashIdx = d.indexOf("/");
  if (slashIdx !== -1) {
    d = d.slice(0, slashIdx);
  }

  // Strip port
  const colonIdx = d.lastIndexOf(":");
  if (colonIdx !== -1 && d.includes(".")) {
    const portPart = d.slice(colonIdx + 1);
    if (/^\d+$/.test(portPart)) {
      d = d.slice(0, colonIdx);
    }
  }

  return d;
}

/**
 * Check if a domain is in the disallowed set (suffix matching).
 *
 * "images.amazon.com" is blocked by "amazon.com" because it ends with
 * ".amazon.com". Exact matches also block. Partial matches like
 * "not-amazon.com" are NOT blocked.
 */
export function isDisallowed(domain: string): boolean {
  const normalized = normalizeDomain(domain);
  return DISALLOWED_DOMAINS.some(
    (disallowed) =>
      normalized === disallowed ||
      normalized.endsWith("." + disallowed),
  );
}

/**
 * Filter and normalize an array of domains, rejecting disallowed ones.
 * Returns the clean domains and any rejected domains.
 */
function filterDomains(
  rawDomains: string[],
): { clean: string[]; rejected: string[] } {
  const clean: string[] = [];
  const rejected: string[] = [];

  for (const raw of rawDomains) {
    const normalized = normalizeDomain(raw);
    if (isDisallowed(normalized)) {
      rejected.push(normalized);
    } else {
      clean.push(normalized);
    }
  }

  return { clean, rejected };
}

// =============================================================================
// Options
// =============================================================================

export interface BuildSourcePlanOptions {
  /**
   * Retry mode for the extraction run.
   * - "all" (default): run every enabled source in the cascade
   * - "failed_or_untried": only run sources that previously errored or were
   *   never attempted (incremental re-extraction)
   */
  retryMode?: "all" | "failed_or_untried";
  /**
   * Enable SERP Discovery as a terminal fallback when all distributors
   * are clean not_stocked. When false, the official_brand SERP fallback
   * entry is not synthesized and only explicit distributor sources run.
   * Default: true (SERP Discovery enabled).
   */
  serpDiscoveryEnabled?: boolean;
  /**
   * Enable UPC Resolution V2 staged cascade.
   * When true, synthesize fallback entries in this order after distributors:
   *   1. official_brand_crawl (resolutionStage "official_brand")
   *   2. serp_candidate_discovery (resolutionStage "serp")
   * Instead of the legacy crawl4ai_direct→serp_discovery single fallback.
   * Default: false (legacy behavior preserved).
   */
  upcResolutionV2Enabled?: boolean;
}

// =============================================================================
// Main builder
// =============================================================================

/**
 * Build ApprovedSourcePlan objects for one or more UPCs.
 *
 * Returns a map keyed by UPC. Each value is either an ApprovedSourcePlan
 * (ok: true) or a structured error (ok: false).
 */
function buildFailureResult(
  upc: string,
  error: string,
  code?: SourcePlanFailureCode,
): SourcePlanResult {
  return {
    ok: false,
    upc,
    error,
    code,
  };
}

export async function buildApprovedSourcePlans(
  db: SupabaseClient,
  upcs: string[],
  options?: BuildSourcePlanOptions,
): Promise<Record<string, SourcePlanResult>> {
  const results: Record<string, SourcePlanResult> = {};
  const retryMode = options?.retryMode ?? "all";
  const serpDiscoveryEnabled = options?.serpDiscoveryEnabled ?? true;
  const upcResolutionV2Enabled = options?.upcResolutionV2Enabled ?? false;

  if (!upcs.length) {
    return results;
  }

  // ------------------------------------------------------------------
  // 1. Load products with brand_id and input
  // ------------------------------------------------------------------
  const { data: products, error: productError } = await db
    .from("products_ingestion")
    .select("upc, brand_id, input")
    .in("upc", upcs);

  if (productError) {
    for (const upc of upcs) {
      results[upc] = buildFailureResult(
        upc,
        `Database error loading products: ${productError.message}`,
        "database_error",
      );
    }
    return results;
  }

  const productMap = new Map<string, ProductRow>(
    (products ?? []).map((p: ProductRow) => [p.upc, p]),
  );

  // ------------------------------------------------------------------
  // 2. Identify UPCs missing direct brand_id and reject them early.
  // ------------------------------------------------------------------
  const brandedUpcs: string[] = [];
  for (const upc of upcs) {
    const product = productMap.get(upc);
    if (!product) {
      results[upc] = buildFailureResult(upc, "Product not found", "product_not_found");
      continue;
    }

    if (!product.brand_id) {
      results[upc] = buildFailureResult(
        upc,
        "Product has no assigned brand. Assign a brand before extraction.",
        "missing_brand",
      );
      continue;
    }

    brandedUpcs.push(upc);
  }

  if (!brandedUpcs.length) {
    return results;
  }

  // ------------------------------------------------------------------
  // 3. Collect unique brand IDs and load brand info
  // ------------------------------------------------------------------
  const brandIds = [
    ...new Set(
      brandedUpcs
        .map((upc) => productMap.get(upc)?.brand_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  const { data: brands, error: brandError } = await db
    .from("brands")
    .select("id, name, slug, official_domains, source_cascade_configured_at")
    .in("id", brandIds);

  if (brandError) {
    for (const upc of brandedUpcs) {
      results[upc] = buildFailureResult(
        upc,
        `Database error loading brands: ${brandError.message}`,
        "database_error",
      );
    }
    return results;
  }

  const brandMap = new Map<string, BrandRow>(
    (brands ?? []).map((b: BrandRow) => [b.id, b]),
  );

  // ------------------------------------------------------------------
  // 3b. Check cascade readiness for all brands using isCascadeConfigured
  //     (requires timestamp + at least one enabled distributor source)
  // ------------------------------------------------------------------
  const configuredBrandIds = new Set<string>();
  for (const brand of (brands ?? []) as BrandRow[]) {
    const configured = await isCascadeConfigured(db, brand.id);
    if (configured) {
      configuredBrandIds.add(brand.id);
    }
  }

  const cascadeReadyUpcs: string[] = [];
  for (const upc of brandedUpcs) {
    const product = productMap.get(upc)!;
    const brand = brandMap.get(product.brand_id!);
    if (!brand) {
      results[upc] = buildFailureResult(
        upc,
        `Brand record not found for brand_id ${product.brand_id}`,
        "missing_brand",
      );
      continue;
    }
    if (!configuredBrandIds.has(brand.id)) {
      results[upc] = buildFailureResult(
        upc,
        `Source cascade not configured for brand "${brand.name}" (${brand.slug}). Configure distributor priorities in brand settings before extraction.`,
        "source_cascade_not_configured",
      );
      continue;
    }
    cascadeReadyUpcs.push(upc);
  }

  if (!cascadeReadyUpcs.length) {
    return results;
  }

  // ------------------------------------------------------------------
  // 4. Load brand_sources for all brand IDs
  // ------------------------------------------------------------------
  const configuredBrandIdList = Array.from(configuredBrandIds);
  const { data: brandSources, error: sourcesError } = await db
    .from("brand_sources")
    .select(
      "id, brand_id, source_type, source_slug, display_name, domains, asset_domains, crawl4ai_adapter_slug, requires_auth, credential_ref, search_mode, allowed_fields, priority, enabled",
    )
    .in("brand_id", configuredBrandIdList)
    .eq("enabled", true)
    .order("priority", { ascending: true });

  if (sourcesError) {
    for (const upc of cascadeReadyUpcs) {
      results[upc] = buildFailureResult(
        upc,
        `Database error loading brand sources: ${sourcesError.message}`,
        "database_error",
      );
    }
    return results;
  }

  const sourcesByBrand = new Map<string, BrandSourceRow[]>();
  for (const source of brandSources ?? []) {
    const existing = sourcesByBrand.get(source.brand_id) ?? [];
    existing.push(source);
    sourcesByBrand.set(source.brand_id, existing);
  }

  // ------------------------------------------------------------------
  // 5. Build a source plan for each cascade-ready UPC
  // ------------------------------------------------------------------
  for (const upc of cascadeReadyUpcs) {
    const product = productMap.get(upc)!;
    const brand = brandMap.get(product.brand_id!);
    if (!brand) {
      results[upc] = buildFailureResult(
        upc,
        `Brand record not found for brand_id ${product.brand_id}`,
        "missing_brand",
      );
      continue;
    }

    const sources = sourcesByBrand.get(brand.id) ?? [];

    // ---- Incremental re-extraction: filter to failed/untried sources ----
    let activeSources = sources;
    if (retryMode === "failed_or_untried") {
      const allSlugs = sources.map((s) => s.source_slug);
      const retrySlugs = await getUntriedAndErroredSources(db, upc, allSlugs);
      const retrySet = new Set(retrySlugs);
      activeSources = sources.filter((s) => retrySet.has(s.source_slug));
    }

    // ---- Build entries ----
    const entries: ApprovedSourcePlanEntry[] = [];
    const distributorEntries: ApprovedSourcePlanEntry[] = [];
    const allDomains: Set<string> = new Set();
    const allAssetDomains: Set<string> = new Set();

    for (const source of activeSources) {
      // Product-level enrichment_config.enabled_sources filtering is removed.
      // All enabled brand_sources are included based on the cascade.

      // Determine domains: use source domains, fall back to brand domains
      // for official_brand entries without explicit domains
      let entryDomains: string[];
      if (
        source.source_type === "official_brand" &&
        (!source.domains || source.domains.length === 0)
      ) {
        entryDomains = [...(brand.official_domains ?? [])];
      } else {
        entryDomains = [...(source.domains ?? [])];
      }

      // Filter out disallowed domains
      const { clean: cleanDomains } = filterDomains(entryDomains);
      const { clean: cleanAssetDomains } = filterDomains(
        source.asset_domains ?? [],
      );

      if (cleanDomains.length === 0 && source.source_type !== "internal") {
        continue;
      }

      for (const d of cleanDomains) allDomains.add(d);
      for (const d of cleanAssetDomains) allAssetDomains.add(d);

      const entry: ApprovedSourcePlanEntry = {
        sourceType: source.source_type as ApprovedSourceType,
        sourceSlug: source.source_slug,
        displayName: source.display_name,
        domains: cleanDomains,
        assetDomains: cleanAssetDomains,
        adapterSlug: source.crawl4ai_adapter_slug,
        requiresAuth: source.requires_auth,
        credentialRef: source.credential_ref,
        searchMode: source.search_mode as ApprovedSearchMode,
        allowedFields: source.allowed_fields ?? [],
        priority: source.priority,
        runFirst: false,
      };

      // In V2 mode, official_brand entries use the strict official_brand_crawl
      // adapter and get a resolutionStage for executor routing.
      // In legacy mode, official_brand entries use the serp_discovery adapter
      // (via crawl4ai_direct alias) and are skipped when serpDiscoveryEnabled is false.
      if (source.source_type === "official_brand") {
        if (upcResolutionV2Enabled) {
          // V2 mode: use strict official_brand_crawl adapter
          entry.adapterSlug = "official_brand_crawl";
          entry.resolutionStage = "official_brand";
          entries.push(entry);
        } else if (serpDiscoveryEnabled) {
          // Legacy mode: use SERP discovery fallback
          entries.push(entry);
        }
      } else {
        distributorEntries.push(entry);
      }
    }

    // ---- Add staged V2 fallback or legacy SERP fallback ----
    // Check if any official_brand entry exists already (either from brand_sources or already synthesized)
    const hasOfficialBrand = entries.some((e) => e.sourceType === "official_brand") ||
      distributorEntries.some((e) => e.sourceType === "official_brand");

    if (upcResolutionV2Enabled) {
      // V2 mode: synthesize staged fallback entries
      // Only synthesize if brand has official domains
      if (brand.official_domains && brand.official_domains.length > 0) {
        const { clean: cleanDomains } = filterDomains(brand.official_domains);
        if (cleanDomains.length > 0) {
          // Stage 1: Official brand crawl (strict UPC-gated)
          if (!hasOfficialBrand) {
            const officialEntry: ApprovedSourcePlanEntry = {
              sourceType: "official_brand",
              sourceSlug: brand.slug,
              displayName: brand.name,
              domains: cleanDomains,
              assetDomains: [],
              adapterSlug: "official_brand_crawl",
              requiresAuth: false,
              credentialRef: null,
              searchMode: "domain_search",
              allowedFields: [
                "title", "description", "images", "ingredients",
                "guaranteed_analysis", "category",
              ],
              priority: 100,
              runFirst: false,
              resolutionStage: "official_brand",
            };
            entries.push(officialEntry);
          }

          // Stage 2: SERP candidate discovery (strict UPC-gated, last resort)
          const serpEntry: ApprovedSourcePlanEntry = {
            sourceType: "official_brand",
            sourceSlug: "serp_candidate",
            displayName: `${brand.name} (SERP)`,
            domains: cleanDomains,
            assetDomains: [],
            adapterSlug: "serp_candidate_discovery",
            requiresAuth: false,
            credentialRef: null,
            searchMode: "domain_search",
            allowedFields: [
              "title", "description", "images",
            ],
            priority: 500,
            runFirst: false,
            resolutionStage: "serp",
          };
          entries.push(serpEntry);

          // Ensure official brand domains are always in the source policy
          // (Fix #6: when synthesizing a SERP candidate from official brand
          // domains, those domains must be included in allowedDomains even
          // when an explicit official brand source already exists.)
          for (const d of cleanDomains) allDomains.add(d);
        }
      }
    } else {
      // Legacy mode: synthesize terminal SERP fallback
      if (
        serpDiscoveryEnabled &&
        !hasOfficialBrand &&
        brand.official_domains &&
        brand.official_domains.length > 0
      ) {
        const { clean: cleanDomains } = filterDomains(brand.official_domains);
        if (cleanDomains.length > 0) {
          const fallbackEntry: ApprovedSourcePlanEntry = {
            sourceType: "official_brand",
            sourceSlug: brand.slug,
            displayName: brand.name,
            domains: cleanDomains,
            assetDomains: [],
            adapterSlug: "crawl4ai_direct",
            requiresAuth: false,
            credentialRef: null,
            searchMode: "domain_search",
            allowedFields: [
              "title", "description", "images", "ingredients",
              "guaranteed_analysis", "category",
            ],
            priority: 1000, // Last priority — terminal fallback
            runFirst: false,
          };
          distributorEntries.push(fallbackEntry);
          for (const d of cleanDomains) allDomains.add(d);
        }
      }
    }

    // ---- Sort distributor entries by priority, official_brand last ----
    distributorEntries.sort((a, b) => a.priority - b.priority);

    // Official brand entries already in `entries` go last (re-sorted by priority)
    entries.sort((a, b) => a.priority - b.priority);

    // Combine: distributor entries first, then official brand entries
    const orderedEntries = [...distributorEntries, ...entries];

    if (orderedEntries.length === 0) {
      results[upc] = buildFailureResult(
        upc,
        `No approved sources configured for brand ${brand.name} (${brand.slug}). Enable at least one distributor source in brand settings.`,
        "no_sources_configured",
      );
      continue;
    }

    // ---- Build source policy ----
    const sourcePolicy: ApprovedSourcePolicy = {
      allowedDomains: Array.from(allDomains),
      allowedAssetDomains: Array.from(allAssetDomains),
      disallowedDomains: [...DISALLOWED_DOMAINS],
      approvedSourcesOnly: true,
    };

    // ---- Assemble plan ----
    const hasOfficialFallback = orderedEntries.some(
      (e) => e.sourceType === "official_brand"
    );

    const plan: ApprovedSourcePlan = {
      schemaVersion: "v1",
      upc,
      input: {
        name: product.input?.name ?? null,
        price: product.input?.price ?? null,
      },
      brand: {
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
      },
      extractionMode: "mixed",
      selectedDistributorSlug: null,
      priority: orderedEntries,
      sourcePolicy,
    };

    results[upc] = { ok: true, plan };
  }

  return results;
}

// =============================================================================
// Profile snapshot resolution
// =============================================================================

interface SiteExtractionProfileRow {
  id: string;
  brand_id: string;
  source_slug: string;
  canonical_domain: string;
  status: string;
  active_version_id: string | null;
}

interface ProfileVersionRow {
  id: string;
  profile_id: string;
  version_number: number;
  status: string;
  rules: Record<string, unknown>;
  compiled_crawl4ai_schema: Record<string, unknown> | null;
  version_hash: string;
}

/**
 * Resolve active Site Extraction Profile snapshots for all sources in the
 * given source plans, keyed by `${sourceSlug}:${canonicalDomain}`.
 *
 * For each source in each plan, looks up an active site_extraction_profiles
 * row by (brand_id, source_slug, canonical_domain). If one exists and has an
 * active_version_id, fetches the corresponding profile version snapshot.
 *
 * Skips profiles without active versions. Returns an empty map when no
 * profiles are found.
 */
export async function resolveProfileSnapshots(
  supabase: SupabaseClient,
  sourcePlansByUpc: Record<string, SourcePlanResult>,
): Promise<Record<string, ProfileSnapshot>> {
  const snapshots: Record<string, ProfileSnapshot> = {};

  // ---- 1. Collect unique (brand_id, source_slug, canonical_domain) tuples ----
  const profileKeys = new Set<string>();
  const keyToBrandId = new Map<string, string>();
  const keyToSourceSlug = new Map<string, string>();
  const keyToDomain = new Map<string, string>();

  for (const result of Object.values(sourcePlansByUpc)) {
    if (!result.ok || !result.plan) continue;
    const plan = result.plan;
    const brandId = plan.brand?.id;
    if (!brandId) continue;

    for (const entry of plan.priority) {
      for (const domain of entry.domains) {
        // Key includes brand_id to prevent cross-brand misrouting
        const key = `${brandId}:${entry.sourceSlug}:${domain}`;
        if (!profileKeys.has(key)) {
          profileKeys.add(key);
          keyToBrandId.set(key, brandId);
          keyToSourceSlug.set(key, entry.sourceSlug);
          keyToDomain.set(key, domain);
        }
      }
    }
  }

  if (profileKeys.size === 0) {
    return snapshots;
  }

  // ---- 2. Batch-fetch site_extraction_profiles for all keys ----
  // Build array of (brand_id, source_slug) tuples for an OR query
  const keys = Array.from(profileKeys);
  const brandIds = [...new Set(keys.map(k => keyToBrandId.get(k)!))];
  const sourceSlugs = [...new Set(keys.map(k => keyToSourceSlug.get(k)!))];

  const { data: profileRows, error: profileError } = await supabase
    .from("site_extraction_profiles")
    .select("id, brand_id, source_slug, canonical_domain, status, active_version_id")
    .in("brand_id", brandIds)
    .in("source_slug", sourceSlugs)
    .eq("status", "active");

  if (profileError) {
    console.warn("[resolveProfileSnapshots] Error fetching profiles:", profileError.message);
    return snapshots;
  }

  if (!profileRows || profileRows.length === 0) {
    return snapshots;
  }

  const rows = profileRows as SiteExtractionProfileRow[];

  // ---- 3. Index profiles by brand-scoped key ----
  const profileByKey = new Map<string, SiteExtractionProfileRow>();
  for (const row of rows) {
    // Use brand-scoped key to prevent cross-brand misrouting
    const key = `${row.brand_id}:${row.source_slug}:${row.canonical_domain}`;
    if (row.active_version_id) {
      profileByKey.set(key, row);
    }
  }

  if (profileByKey.size === 0) {
    return snapshots;
  }

  // ---- 4. Collect active version IDs and fetch versions ----
  const activeVersionIds = [...new Set(
    Array.from(profileByKey.values()).map(r => r.active_version_id!).filter(Boolean),
  )];

  if (activeVersionIds.length === 0) {
    return snapshots;
  }

  const { data: versionRows, error: versionError } = await supabase
    .from("site_extraction_profile_versions")
    .select("id, profile_id, version_number, status, rules, compiled_crawl4ai_schema, version_hash")
    .in("id", activeVersionIds)
    .eq("status", "active");

  if (versionError) {
    console.warn("[resolveProfileSnapshots] Error fetching versions:", versionError.message);
    return snapshots;
  }

  if (!versionRows || versionRows.length === 0) {
    return snapshots;
  }

  const versions = versionRows as ProfileVersionRow[];

  // ---- 5. Index versions by profile_id ----
  const versionByProfileId = new Map<string, ProfileVersionRow>();
  for (const v of versions) {
    versionByProfileId.set(v.profile_id, v);
  }

  // ---- 6. Build snapshot dict using brand-scoped keys ----
  for (const key of keys) {
    const profile = profileByKey.get(key);
    if (!profile) continue;

    const version = versionByProfileId.get(profile.id);
    if (!version) continue;

    const brandId = keyToBrandId.get(key)!;
    const sourceSlug = keyToSourceSlug.get(key)!;
    const domain = keyToDomain.get(key)!;

    snapshots[key] = {
      profile_id: profile.id,
      version_id: version.id,
      version_hash: version.version_hash,
      rules: version.rules ?? {},
      compiled_crawl4ai_schema: version.compiled_crawl4ai_schema ?? null,
      scope: {
        brand_id: brandId,
        source_slug: sourceSlug,
        canonical_domain: domain,
      },
    };
  }

  return snapshots;
}
