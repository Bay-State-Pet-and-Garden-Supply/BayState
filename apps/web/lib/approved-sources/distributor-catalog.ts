/**
 * Fixed approved distributor catalog for v1 selected-distributor fallback.
 *
 * When a user selects a distributor slug and the brand_sources table has no
 * matching distributor entry, this catalog synthesizes the entry into the
 * source plan at runtime.
 *
 * Long-term, distributor source config should live in brand_sources admin data.
 * This catalog is strictly a v1 bridge to get the five approved distributors
 * working without blocking on admin seeding.
 */

import type {
  ApprovedSourcePlanEntry,
  ApprovedSourcePolicy,
} from "@/lib/approved-sources/types";

/**
 * Canonical catalog of approved distributors and their source metadata.
 */
export interface FixedDistributorEntry {
  /** Slug used for matching and in the source plan */
  sourceSlug: string;
  /** Adapter slug sent to the runner */
  adapterSlug: string;
  /** Human-readable name */
  displayName: string;
  /** Approved domains for crawling */
  domains: string[];
  /** Approved asset/image domains */
  assetDomains: string[];
  /** Whether login/auth is required */
  requiresAuth: boolean;
  /** Credential reference for auth resolution */
  credentialRef: string | null;
  /** Search mode */
  searchMode: "sku_search" | "domain_search" | "direct_url" | "feed_lookup";
  /** Allowed extraction fields */
  allowedFields: string[];
  /** Default priority (lower = higher priority) */
  priority: number;
  /** Source type (always "distributor") */
  sourceType: "distributor";
  /** Aliases accepted as selectedDistributorSlug */
  aliases: string[];
}

export const FIXED_DISTRIBUTOR_CATALOG: FixedDistributorEntry[] = [
  {
    sourceSlug: "bradley",
    adapterSlug: "bradley_crawl4ai",
    displayName: "Bradley Caldwell",
    domains: ["bradleycaldwell.com"],
    assetDomains: ["bradleycaldwell.com"],
    requiresAuth: false,
    credentialRef: null,
    searchMode: "sku_search",
    allowedFields: [
      "name",
      "brand",
      "sku",
      "upc",
      "bci_item_number",
      "case_pack",
      "weight",
      "dimensions",
      "image_urls",
      "description",
      "ingredients",
    ],
    priority: 10,
    sourceType: "distributor",
    aliases: ["bradley", "bradley_crawl4ai"],
  },
  {
    sourceSlug: "central_pet",
    adapterSlug: "central_pet_crawl4ai",
    displayName: "Central Pet",
    domains: ["centralpet.com"],
    assetDomains: ["centralpet.com"],
    requiresAuth: false,
    credentialRef: "central-pet",
    searchMode: "sku_search",
    allowedFields: [
      "name",
      "brand",
      "upc",
      "manufacturer_number",
      "image_urls",
      "description",
      "features",
      "weight",
      "dimensions",
    ],
    priority: 20,
    sourceType: "distributor",
    aliases: ["central-pet", "central_pet", "central_pet_crawl4ai"],
  },
  {
    sourceSlug: "orgill",
    adapterSlug: "orgill_crawl4ai",
    displayName: "Orgill",
    domains: ["orgill.com"],
    assetDomains: ["orgill.com"],
    requiresAuth: true,
    credentialRef: "orgill",
    searchMode: "sku_search",
    allowedFields: [
      "name",
      "brand",
      "model_number",
      "upc",
      "image_urls",
      "description",
      "features",
      "weight",
      "dimensions",
      "category",
    ],
    priority: 30,
    sourceType: "distributor",
    aliases: ["orgill", "orgill_crawl4ai"],
  },
  {
    sourceSlug: "phillips",
    adapterSlug: "phillips_crawl4ai",
    displayName: "Phillips Pet",
    domains: ["shop.phillipspet.com"],
    assetDomains: ["shop.phillipspet.com", "d56ygyjv466yj.cloudfront.net"],
    requiresAuth: true,
    credentialRef: "phillips",
    searchMode: "sku_search",
    allowedFields: [
      "name",
      "brand",
      "upc",
      "item_number",
      "image_urls",
      "description",
      "weight",
      "features",
    ],
    priority: 40,
    sourceType: "distributor",
    aliases: ["phillips", "phillips_crawl4ai"],
  },
  {
    sourceSlug: "pet_food_experts",
    adapterSlug: "pet_food_experts_crawl4ai",
    displayName: "Pet Food Experts",
    domains: ["orders.petfoodexperts.com", "petfoodexperts.com"],
    assetDomains: [
      "orders.petfoodexperts.com",
      "petfoodexperts.com",
      "cdn.insitecloud.net",
    ],
    requiresAuth: true,
    credentialRef: "petfoodex",
    searchMode: "sku_search",
    allowedFields: [
      "name",
      "brand",
      "item_number",
      "upc",
      "unit_of_measure",
      "image_urls",
      "description",
      "weight",
      "features",
      "ingredients",
    ],
    priority: 50,
    sourceType: "distributor",
    aliases: [
      "petfoodex",
      "pet_food_experts",
      "pet-food-experts",
      "pet_food_experts_crawl4ai",
    ],
  },
];

/**
 * Normalize a distributor slug to its canonical sourceSlug.
 * Returns the canonical slug, or the original slug if not found.
 */
export function normalizeDistributorSlug(slug: string): string {
  for (const entry of FIXED_DISTRIBUTOR_CATALOG) {
    if (
      entry.sourceSlug === slug ||
      entry.adapterSlug === slug ||
      entry.aliases.includes(slug)
    ) {
      return entry.sourceSlug;
    }
  }
  return slug;
}

/**
 * Find a fixed catalog entry by any known slug or alias.
 */
export function findDistributorInCatalog(
  slug: string,
): FixedDistributorEntry | undefined {
  const normalized = normalizeDistributorSlug(slug);
  return FIXED_DISTRIBUTOR_CATALOG.find(
    (e) => e.sourceSlug === normalized,
  );
}

/**
 * Build a distributor ApprovedSourcePlanEntry from a catalog entry.
 */
export function buildDistributorPlanEntry(
  catalogEntry: FixedDistributorEntry,
): ApprovedSourcePlanEntry {
  return {
    sourceType: catalogEntry.sourceType,
    sourceSlug: catalogEntry.sourceSlug,
    displayName: catalogEntry.displayName,
    domains: catalogEntry.domains,
    assetDomains: catalogEntry.assetDomains,
    adapterSlug: catalogEntry.adapterSlug,
    requiresAuth: catalogEntry.requiresAuth,
    credentialRef: catalogEntry.credentialRef,
    searchMode: catalogEntry.searchMode,
    allowedFields: catalogEntry.allowedFields,
    priority: catalogEntry.priority,
    runFirst: true,
  };
}

/**
 * Build a source policy that allows all catalog distributor domains.
 */
export function buildDistributorSourcePolicy(): ApprovedSourcePolicy {
  return {
    allowedDomains: FIXED_DISTRIBUTOR_CATALOG.flatMap((e) => e.domains),
    allowedAssetDomains: FIXED_DISTRIBUTOR_CATALOG.flatMap(
      (e) => e.assetDomains,
    ),
    disallowedDomains: [
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
    ],
    approvedSourcesOnly: true,
  };
}
