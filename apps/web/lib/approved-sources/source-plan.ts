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
  type ExtractionMode,
  type SourcePlanFailureCode,
  type SourcePlanResult,
  DISALLOWED_DOMAINS,
} from "./types";
import { normalizeDistributorSlug, findDistributorInCatalog, buildDistributorPlanEntry } from "./distributor-catalog";

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
  enrichment_config?: any;
}

interface BrandRow {
  id: string;
  name: string;
  slug: string;
  official_domains: string[];
  preferred_domains?: string[];
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
   * Optional distributor slug to prefer. If provided, the matching
   * brand_sources entry with source_type='distributor' and
   * source_slug matching this value will be marked runFirst.
   */
  selectedDistributorSlug?: string;
  /**
   * Extraction mode: mixed (default), distributor_only, or ai_only.
   */
  extractionMode?: ExtractionMode;
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
  // Normalize distributor slug through catalog to support aliases
  const selectedDistributorSlug = options?.selectedDistributorSlug
    ? normalizeDistributorSlug(options.selectedDistributorSlug)
    : undefined;
  const extractionMode = options?.extractionMode ?? "mixed";

  if (!upcs.length) {
    return results;
  }

  // ------------------------------------------------------------------
  // 1. Load products with brand_id and input
  // ------------------------------------------------------------------
  const { data: products, error: productError } = await db
    .from("products_ingestion")
    .select("upc, brand_id, input, enrichment_config")
    .in("upc", upcs);

  if (productError) {
    for (const upc of upcs) {
      results[upc] = {
        ...buildFailureResult(
          upc,
          `Database error loading products: ${productError.message}`,
          "database_error",
        ),
      };
    }
    return results;
  }

  const productMap = new Map<string, ProductRow>(
    (products ?? []).map((p: ProductRow) => [p.upc, p]),
  );

  // ------------------------------------------------------------------
  // 2. Identify UPCs missing brand_id and reject them early
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
    .select("id, name, slug, official_domains")
    .in("id", brandIds);

  if (brandError) {
    for (const upc of brandedUpcs) {
      results[upc] = {
        ...buildFailureResult(
          upc,
          `Database error loading brands: ${brandError.message}`,
          "database_error",
        ),
      };
    }
    return results;
  }

  const brandMap = new Map<string, BrandRow>(
    (brands ?? []).map((b: BrandRow) => [b.id, b]),
  );

  // ------------------------------------------------------------------
  // 4. Load brand_sources for all brand IDs
  // ------------------------------------------------------------------
  const { data: brandSources, error: sourcesError } = await db
    .from("brand_sources")
    .select(
      "id, brand_id, source_type, source_slug, display_name, domains, asset_domains, crawl4ai_adapter_slug, requires_auth, credential_ref, search_mode, allowed_fields, priority, enabled",
    )
    .in("brand_id", brandIds)
    .eq("enabled", true)
    .order("priority", { ascending: true });

  if (sourcesError) {
    for (const upc of brandedUpcs) {
      results[upc] = {
        ...buildFailureResult(
          upc,
          `Database error loading brand sources: ${sourcesError.message}`,
          "database_error",
        ),
      };
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
  // 5. Build a source plan for each branded UPC
  // ------------------------------------------------------------------
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

    const sources = sourcesByBrand.get(brand.id) ?? [];

    // ---- Build entries ----
    const entries: ApprovedSourcePlanEntry[] = [];
    const allDomains: Set<string> = new Set();
    const allAssetDomains: Set<string> = new Set();

    for (const source of sources) {
      // If the product has enrichment_config.enabled_sources defined,
      // verify that this source is explicitly enabled before including it in the plan.
      const enabledSources = product.enrichment_config?.enabled_sources;
      if (Array.isArray(enabledSources)) {
        const isEnabled = enabledSources.some(es => 
          es === source.crawl4ai_adapter_slug ||
          es === source.source_slug ||
          es.replace('_crawl4ai', '').replace('_scraper', '') === source.source_slug
        );
        if (!isEnabled) {
          continue; // Skip disabled sources!
        }
      }

      // Determine domains: use source domains, fall back to brand domains
      // for official_brand entries without explicit domains
      let entryDomains: string[];
      if (
        source.source_type === "official_brand" &&
        (!source.domains || source.domains.length === 0)
      ) {
        // Fall back to official domains as seed domains
        entryDomains = [
          ...(brand.official_domains ?? []),
        ];
      } else {
        entryDomains = [...(source.domains ?? [])];
      }

      // Filter out disallowed domains
      const { clean: cleanDomains } = filterDomains(entryDomains);
      const { clean: cleanAssetDomains } = filterDomains(
        source.asset_domains ?? [],
      );

      if (cleanDomains.length === 0 && source.source_type !== "internal") {
        // Skip entries with no valid domains (except internal sources)
        continue;
      }

      for (const d of cleanDomains) allDomains.add(d);
      for (const d of cleanAssetDomains) allAssetDomains.add(d);

      const isRunFirst =
        selectedDistributorSlug !== undefined &&
        source.source_type === "distributor" &&
        normalizeDistributorSlug(source.source_slug) === selectedDistributorSlug;

      entries.push({
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
        runFirst: isRunFirst,
      });
    }

    const appendCandidateEntry = (entry: ApprovedSourcePlanEntry | null | undefined) => {
      if (!entry) {
        return;
      }

      const normalizedSourceSlug = entry.sourceType === "distributor"
        ? normalizeDistributorSlug(entry.sourceSlug)
        : entry.sourceSlug;
      const existingIndex = entries.findIndex((candidate) => {
        const candidateSlug = candidate.sourceType === "distributor"
          ? normalizeDistributorSlug(candidate.sourceSlug)
          : candidate.sourceSlug;
        return candidate.sourceType === entry.sourceType && candidateSlug === normalizedSourceSlug;
      });

      const normalizedEntry: ApprovedSourcePlanEntry = {
        ...entry,
        sourceSlug: normalizedSourceSlug,
      };

      if (existingIndex >= 0) {
        entries[existingIndex] = {
          ...entries[existingIndex],
          ...normalizedEntry,
          runFirst: entries[existingIndex].runFirst || normalizedEntry.runFirst,
        };
      } else {
        entries.push(normalizedEntry);
      }

      normalizedEntry.domains.forEach((domain) => allDomains.add(domain));
      normalizedEntry.assetDomains.forEach((domain) => allAssetDomains.add(domain));
    };

    if (extractionMode !== "ai_only" && selectedDistributorSlug) {
      const hasSelectedDistributor = entries.some((entry) => (
        entry.sourceType === "distributor"
        && normalizeDistributorSlug(entry.sourceSlug) === selectedDistributorSlug
      ));

      if (!hasSelectedDistributor) {
        const selectedCatalogEntry = findDistributorInCatalog(selectedDistributorSlug);
        if (selectedCatalogEntry) {
          appendCandidateEntry(buildDistributorPlanEntry(selectedCatalogEntry));
        }
      }
    }

    if (
      extractionMode !== "ai_only"
      && !entries.some((entry) => entry.sourceType === "distributor")
    ) {
      const enabledSources = product.enrichment_config?.enabled_sources;
      if (Array.isArray(enabledSources) && enabledSources.length > 0) {
        for (const sourceId of enabledSources) {
          const catalogEntry = findDistributorInCatalog(sourceId);
          if (catalogEntry) {
            appendCandidateEntry(buildDistributorPlanEntry(catalogEntry));
          }
        }
      }
    }

    if (
      extractionMode === "ai_only" &&
      !entries.some((entry) => entry.sourceType === "official_brand") &&
      brand.official_domains &&
      brand.official_domains.length > 0
    ) {
      appendCandidateEntry({
        sourceType: "official_brand",
        sourceSlug: brand.slug,
        displayName: brand.name,
        domains: brand.official_domains,
        assetDomains: [],
        adapterSlug: "crawl4ai_direct",
        requiresAuth: false,
        credentialRef: null,
        searchMode: "domain_search",
        allowedFields: ["title", "description", "images", "ingredients", "guaranteed_analysis", "category"],
        priority: 50,
        runFirst: false,
      });
    }

    // ---- Extraction Mode filtering ----
    let filteredEntries = entries.filter((entry) => {
      if (extractionMode === "ai_only") {
        return entry.sourceType === "official_brand";
      }

      if (extractionMode === "distributor_only") {
        return entry.sourceType === "distributor";
      }

      return true;
    });

    if (selectedDistributorSlug && extractionMode === "distributor_only") {
      filteredEntries = filteredEntries.filter((entry) => (
        entry.sourceType === "distributor"
        && normalizeDistributorSlug(entry.sourceSlug) === selectedDistributorSlug
      ));
    }

    // ---- Reorder: selected distributor first, then by priority ----
    const runFirstEntries = filteredEntries.filter((entry) => entry.runFirst);
    const otherEntries = filteredEntries.filter((entry) => !entry.runFirst);

    runFirstEntries.sort((a, b) => a.priority - b.priority);
    otherEntries.sort((a, b) => a.priority - b.priority);

    const orderedEntries = [...runFirstEntries, ...otherEntries];

    if (orderedEntries.length === 0) {
      if (extractionMode === "ai_only") {
        results[upc] = buildFailureResult(
          upc,
          `AI-only extraction requires official domains to be configured for brand ${brand.name}. Please configure official domains in the admin panel.`,
          "ai_only_no_official_domains",
        );
        continue;
      }

      const modeDesc = extractionMode === "mixed" ? "" : ` (${extractionMode} mode)`;
      results[upc] = buildFailureResult(
        upc,
        `No approved sources configured for brand ${brand.name} (${brand.slug})${modeDesc}. Configure brand sources in the admin panel before extraction.`,
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
      extractionMode,
      selectedDistributorSlug: selectedDistributorSlug ?? null,
      priority: orderedEntries,
      sourcePolicy,
    };

    results[upc] = { ok: true, plan };
  }

  return results;
}
