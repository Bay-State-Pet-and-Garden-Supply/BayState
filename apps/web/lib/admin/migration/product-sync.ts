/**
 * Product Synchronization Utilities
 *
 * Handles transformation and sync of products from ShopSite to Supabase.
 */

import type { ShopSiteProduct } from "./types";
import {
  buildPipelineInputFromShopSiteProduct as buildMappedPipelineInputFromShopSiteProduct,
  transformShopSiteProductToStorefrontRecord,
  type ShopSitePipelineInput,
  type ShopSiteStorefrontProductRecord,
} from "@/lib/shopsite/mapping";

export { buildProductSlug } from "@/lib/shopsite/mapping";

/**
 * Transform a ShopSite product into the Supabase products table format.
 * Outputs the canonical products schema used by publishToStorefront.
 */
export function transformShopSiteProduct(
  product: ShopSiteProduct,
): ShopSiteStorefrontProductRecord {
  return transformShopSiteProductToStorefrontRecord(product);
}

export function buildPipelineInputFromShopSiteProduct(
  product: ShopSiteProduct,
): ShopSitePipelineInput {
  return buildMappedPipelineInputFromShopSiteProduct(product);
}

/**
 * Generate a unique slug by appending a counter if the base slug exists.
 */
export function generateUniqueSlug(
  baseSlug: string,
  existingSlugs: Set<string>,
): string {
  if (!existingSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let counter = 1;
  let uniqueSlug = `${baseSlug}-${counter}`;
  while (existingSlugs.has(uniqueSlug)) {
    counter++;
    uniqueSlug = `${baseSlug}-${counter}`;
  }

  return uniqueSlug;
}
