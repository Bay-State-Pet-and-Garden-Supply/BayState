/**
 * Approved Source Plan Builder
 *
 * Builds per-SKU source plans from the brand_sources table and product brand state.
 * This is the coordinator's main function for creating source plans that the
 * runner then executes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type ApprovedSourcePlan,
  type ApprovedSourcePlanEntry,
  type ApprovedSourcePolicy,
  type ApprovedSourceLLMPolicy,
  type ApprovedSourceType,
  type ApprovedSearchMode,
  type SourcePlanResult,
  DISALLOWED_DOMAINS,
  DEFAULT_LLM_POLICY,
} from "./types";

// =============================================================================
// Database row shapes (minimal, not full DB types)
// =============================================================================

interface ProductRow {
  sku: string;
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
  preferred_domains: string[];
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
   * Override the default LLM policy per-SKU or globally.
   */
  llmPolicy?: Partial<ApprovedSourceLLMPolicy>;
}

// =============================================================================
// Main builder
// =============================================================================

/**
 * Build ApprovedSourcePlan objects for one or more SKUs.
 *
 * Returns a map keyed by SKU. Each value is either an ApprovedSourcePlan
 * (ok: true) or a structured error (ok: false).
 */
export async function buildApprovedSourcePlans(
  db: SupabaseClient,
  skus: string[],
  options?: BuildSourcePlanOptions,
): Promise<Record<string, SourcePlanResult>> {
  const results: Record<string, SourcePlanResult> = {};
  const selectedDistributorSlug = options?.selectedDistributorSlug;
  const llmPolicyOverride = options?.llmPolicy;

  if (!skus.length) {
    return results;
  }

  // ------------------------------------------------------------------
  // 1. Load products with brand_id and input
  // ------------------------------------------------------------------
  const { data: products, error: productError } = await db
    .from("products_ingestion")
    .select("sku, brand_id, input")
    .in("sku", skus);

  if (productError) {
    for (const sku of skus) {
      results[sku] = {
        ok: false,
        sku,
        error: `Database error loading products: ${productError.message}`,
      };
    }
    return results;
  }

  const productMap = new Map<string, ProductRow>(
    (products ?? []).map((p: ProductRow) => [p.sku, p]),
  );

  // ------------------------------------------------------------------
  // 2. Identify SKUs missing brand_id and reject them early
  // ------------------------------------------------------------------
  const brandedSkus: string[] = [];
  for (const sku of skus) {
    const product = productMap.get(sku);
    if (!product) {
      results[sku] = { ok: false, sku, error: "Product not found" };
      continue;
    }
    if (!product.brand_id) {
      results[sku] = {
        ok: false,
        sku,
        error:
          "Product has no assigned brand. Assign a brand before extraction.",
      };
      continue;
    }
    brandedSkus.push(sku);
  }

  if (!brandedSkus.length) {
    return results;
  }

  // ------------------------------------------------------------------
  // 3. Collect unique brand IDs and load brand info
  // ------------------------------------------------------------------
  const brandIds = [
    ...new Set(
      brandedSkus
        .map((sku) => productMap.get(sku)?.brand_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  const { data: brands, error: brandError } = await db
    .from("brands")
    .select("id, name, slug, official_domains, preferred_domains")
    .in("id", brandIds);

  if (brandError) {
    for (const sku of brandedSkus) {
      results[sku] = {
        ok: false,
        sku,
        error: `Database error loading brands: ${brandError.message}`,
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
    for (const sku of brandedSkus) {
      results[sku] = {
        ok: false,
        sku,
        error: `Database error loading brand sources: ${sourcesError.message}`,
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
  // 5. Build a source plan for each branded SKU
  // ------------------------------------------------------------------
  for (const sku of brandedSkus) {
    const product = productMap.get(sku)!;
    const brand = brandMap.get(product.brand_id!);

    if (!brand) {
      results[sku] = {
        ok: false,
        sku,
        error: `Brand record not found for brand_id ${product.brand_id}`,
      };
      continue;
    }

    const sources = sourcesByBrand.get(brand.id) ?? [];

    // ---- Build entries ----
    const entries: ApprovedSourcePlanEntry[] = [];
    const allDomains: Set<string> = new Set();
    const allAssetDomains: Set<string> = new Set();

    for (const source of sources) {
      // Determine domains: use source domains, fall back to brand domains
      // for official_brand entries without explicit domains
      let entryDomains: string[];
      if (
        source.source_type === "official_brand" &&
        (!source.domains || source.domains.length === 0)
      ) {
        // Merge official + preferred as seed domains
        entryDomains = [
          ...(brand.official_domains ?? []),
          ...(brand.preferred_domains ?? []),
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
        source.source_slug === selectedDistributorSlug;

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

    // ---- Reorder: selected distributor first, then by priority ----
    const runFirstEntries = entries.filter((e) => e.runFirst);
    const otherEntries = entries.filter((e) => !e.runFirst);

    // Sort other entries by priority ascending
    otherEntries.sort((a, b) => a.priority - b.priority);

    // Run-first entries sorted by priority among themselves
    runFirstEntries.sort((a, b) => a.priority - b.priority);

    const orderedEntries = [...runFirstEntries, ...otherEntries];

    // ---- Empty plan guard ----
    if (orderedEntries.length === 0) {
      results[sku] = {
        ok: false,
        sku,
        error: `No approved sources configured for brand ${brand.name} (${brand.slug}). ` +
          "Configure brand sources in the admin panel before extraction.",
      };
      continue;
    }

    // ---- Build source policy ----
    const sourcePolicy: ApprovedSourcePolicy = {
      allowedDomains: Array.from(allDomains),
      allowedAssetDomains: Array.from(allAssetDomains),
      disallowedDomains: [...DISALLOWED_DOMAINS],
      approvedSourcesOnly: true,
    };

    // ---- Merge LLM policy ----
    const llmPolicy: ApprovedSourceLLMPolicy = {
      ...DEFAULT_LLM_POLICY,
      ...llmPolicyOverride,
    };

    // ---- Assemble plan ----
    const plan: ApprovedSourcePlan = {
      schemaVersion: "v1",
      sku,
      input: {
        name: product.input?.name ?? null,
        price: product.input?.price ?? null,
      },
      brand: {
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
      },
      selectedDistributorSlug: selectedDistributorSlug ?? null,
      priority: orderedEntries,
      sourcePolicy,
      llmPolicy,
    };

    results[sku] = { ok: true, plan };
  }

  return results;
}
