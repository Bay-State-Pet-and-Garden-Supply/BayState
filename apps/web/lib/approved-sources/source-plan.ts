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
 */
function normalizeDomain(raw: string): string {
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
function isDisallowed(domain: string): boolean {
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

      // Separate official_brand entries for terminal fallback.
      // Per CONTEXT.md: "Run all, keep all — every enabled source is attempted
      // regardless of early successes." The official brand SERP always runs as
      // the terminal source even if distributors found the product.
      if (source.source_type === "official_brand") {
        entries.push(entry);
      } else {
        distributorEntries.push(entry);
      }
    }

    // ---- Add official brand as terminal SERP fallback ----
    // If the brand has official domains but no official_brand brand_source entry
    // appeared from the sources query, synthesize one as terminal fallback.
    const hasOfficialBrand = entries.some((e) => e.sourceType === "official_brand") ||
      distributorEntries.some((e) => e.sourceType === "official_brand");

    if (
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
