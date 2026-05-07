import type { ShopSiteProduct } from "@/lib/admin/migration/types";
import { normalizePetTypeValue } from "@/lib/admin/migration/pet-type-inference";
import { normalizeGenericFacetValue } from "@/lib/facets/generic-normalization";
import {
  buildFacetSlug,
  normalizeBrandName,
  normalizeCategoryValue,
  normalizeProductTypeValue,
} from "@/lib/facets/normalization";
import { parseShopSitePages } from "./constants";
import type { ShopSiteExportProduct } from "./xml-generator";

export interface ShopSiteExportSourceRow {
  sku: string;
  input: unknown;
  consolidated: unknown;
  selected_images: unknown;
}

export interface ShopSiteExportBrandRow {
  id: string;
  name: string;
  slug: string | null;
}

export interface PreparedShopSiteExportProduct extends ShopSiteExportProduct {
  brand_folder: string;
  image_sources: string[];
}

export interface ShopSiteStorefrontProductRecord {
  sku: string;
  name: string;
  slug: string;
  price: number;
  description: string | null;
  stock_status: "in_stock" | "out_of_stock" | "pre_order";
  images: string[];
  short_name: string | null;
  is_special_order: boolean;
  in_store_pickup: boolean;
  shopsite_pages: string[];
  weight: number | null;
  quantity: number;
  low_stock_threshold: number | null;
  is_taxable: boolean;
  minimum_quantity: number;
  long_description: string | null;
  product_type: string | null;
  search_keywords: string | null;
  brand_name: string | null;
  pet_type_name: string | null;
  life_stage: string | null;
  pet_size: string | null;
  special_diet: string | null;
  health_feature: string | null;
  food_form: string | null;
  flavor: string | null;
  category_name: string | null;
  product_feature: string | null;
  size: string | null;
  color: string | null;
  packaging_type: string | null;
}

export interface ShopSitePipelineInput {
  name: string;
  price: number;
  product_on_pages: string[];
  shopsite_pages: string[];
  description?: string | null;
  long_description?: string | null;
  short_name?: string | null;
  category?: string | null;
  product_type?: string | null;
  brand?: string | null;
  pet_type?: string | null;
  lifestage?: string | null;
  pet_size?: string | null;
  special_diet?: string | null;
  health_feature?: string | null;
  food_form?: string | null;
  flavor?: string | null;
  product_feature?: string | null;
  size?: string | null;
  color?: string | null;
  packaging_type?: string | null;
  weight?: string | null;
  search_keywords?: string | null;
  minimum_quantity?: number;
  is_special_order?: boolean;
  in_store_pickup?: boolean;
  legacy_filename?: string | null;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }

  return {};
}

function asString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function coalesceString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = asString(value);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return null;
}

function coalescePrice(...values: unknown[]): number | string {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const numeric = Number.parseFloat(value);
      return Number.isFinite(numeric) ? numeric : value.trim();
    }
  }

  return 0;
}

function coalesceInteger(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.trunc(value));
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const numeric = Number.parseInt(value, 10);
      if (Number.isFinite(numeric)) {
        return Math.max(0, numeric);
      }
    }
  }

  return null;
}

function coalesceBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "checked", "check"].includes(normalized)) {
        return true;
      }

      if (["false", "0", "no", "uncheck", "unchecked"].includes(normalized)) {
        return false;
      }
    }
  }

  return null;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value): value is string => value.length > 0),
    ),
  );
}

function extractSelectedImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueStrings(
    value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }

        if (entry && typeof entry === "object" && "url" in entry) {
          return asString((entry as { url?: unknown }).url);
        }

        return "";
      }),
  );
}

function toImageUrlArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueStrings(value.map((entry) => asString(entry)));
}

function normalizeFileStem(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const stem = value.replace(/\.html?$/i, "");
  const normalized = buildProductSlug(stem);
  return normalized.length > 0 ? normalized : null;
}

function getNameForSorting(row: ShopSiteExportSourceRow): string {
  const consolidated = asRecord(row.consolidated);
  const input = asRecord(row.input);
  return coalesceString(consolidated.name, input.name, row.sku) ?? row.sku;
}

function buildUniqueStem(base: string, usedStems: Set<string>, sku: string): string {
  if (!usedStems.has(base)) {
    usedStems.add(base);
    return base;
  }

  const skuStem = buildFacetSlug(sku) || "sku";
  const skuCandidate = `${base}-${skuStem}`;
  if (!usedStems.has(skuCandidate)) {
    usedStems.add(skuCandidate);
    return skuCandidate;
  }

  let counter = 2;
  while (usedStems.has(`${skuCandidate}-${counter}`)) {
    counter += 1;
  }

  const finalCandidate = `${skuCandidate}-${counter}`;
  usedStems.add(finalCandidate);
  return finalCandidate;
}

function formatOptionalNumber(value: number | null): string | undefined {
  if (value === null || Number.isNaN(value)) {
    return undefined;
  }

  return String(value);
}

export function buildProductSlug(name: string, sku?: string): string {
  let slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();

  if (sku) {
    const normalizedSku = sku.toLowerCase().replace(/[^a-z0-9-]/g, "");
    slug = slug.length > 0 ? `${slug}-${normalizedSku}` : normalizedSku;
  }

  return slug;
}

export function preparePipelineRowsForShopSiteExport(
  rows: ShopSiteExportSourceRow[],
  brandsById: Map<string, ShopSiteExportBrandRow> = new Map(),
): PreparedShopSiteExportProduct[] {
  const sortedRows = [...rows].sort((left, right) => {
    const nameComparison = getNameForSorting(left).localeCompare(
      getNameForSorting(right),
    );
    if (nameComparison !== 0) {
      return nameComparison;
    }

    return left.sku.localeCompare(right.sku);
  });

  const usedFileStems = new Set<string>();
  const usedImageStemsByFolder = new Map<string, Set<string>>();

  return sortedRows.map((row) => {
    const input = asRecord(row.input);
    const consolidated = asRecord(row.consolidated);
    const name = coalesceString(consolidated.name, input.name, row.sku) ?? row.sku;
    const brandId = coalesceString(consolidated.brand_id);
    const brandRow = brandId ? brandsById.get(brandId) : undefined;
    const brandName = normalizeBrandName(
      coalesceString(
        brandRow?.name,
        consolidated.brand_name,
        consolidated.brand,
        input.brand_name,
        input.brand,
      ),
    );
    const brandFolder =
      buildFacetSlug(brandRow?.slug ?? brandName ?? "unbranded") || "unbranded";
    const preferredFileStem = normalizeFileStem(
      coalesceString(
        consolidated.legacy_filename,
        consolidated.file_name,
        consolidated.fileName,
        input.legacy_filename,
        input.file_name,
        input.fileName,
      ),
    );
    const generatedStem = buildProductSlug(name) || buildFacetSlug(row.sku) || "product";
    const baseStem = preferredFileStem ?? generatedStem;
    const fileStem = buildUniqueStem(baseStem, usedFileStems, row.sku);

    const usedImageStems =
      usedImageStemsByFolder.get(brandFolder) ?? new Set<string>();
    usedImageStemsByFolder.set(brandFolder, usedImageStems);
    const imageStem = buildUniqueStem(baseStem, usedImageStems, row.sku);

    const consolidatedImages = toImageUrlArray(consolidated.images);
    const selectedImages = extractSelectedImageUrls(row.selected_images);
    const imageSources =
      consolidatedImages.length > 0 ? consolidatedImages : selectedImages;
    const images = imageSources.map(
      (_, index) =>
        `${brandFolder}/${imageStem}${index === 0 ? "" : `-${index + 1}`}.jpg`,
    );

    const gtin = row.sku;

    return {
      sku: row.sku,
      name,
      price: coalescePrice(consolidated.price, input.price),
      weight: coalesceString(consolidated.weight, input.weight),
      brand_name: brandName,
      description: coalesceString(consolidated.description, input.description),
      long_description: coalesceString(
        consolidated.long_description,
        input.long_description,
      ),
      images,
      image_sources: imageSources,
      brand_folder: brandFolder,
      category: coalesceString(consolidated.category, input.category),
      product_type: coalesceString(
        consolidated.product_type,
        input.product_type,
      ),
      shopsite_pages: parseShopSitePages(
        consolidated.shopsite_pages ??
          consolidated.product_on_pages ??
          input.shopsite_pages ??
          input.product_on_pages,
      ),
      search_keywords: coalesceString(
        consolidated.search_keywords,
        input.search_keywords,
      ),
      is_special_order:
        coalesceBoolean(consolidated.is_special_order, input.is_special_order) ??
        false,
      is_taxable:
        coalesceBoolean(consolidated.is_taxable, input.is_taxable) ?? true,
      file_name: `${fileStem}.html`,
      gtin,
      availability:
        coalesceString(consolidated.availability, input.availability) ??
        "in stock",
      minimum_quantity:
        coalesceInteger(
          consolidated.minimum_quantity,
          input.minimum_quantity,
        ) ?? 0,
    };
  });
}

export function transformShopSiteProductToStorefrontRecord(
  product: ShopSiteProduct,
): ShopSiteStorefrontProductRecord {
  const images: string[] = [];
  if (product.imageUrl) {
    images.push(product.imageUrl);
  }
  if (product.additionalImages) {
    images.push(...product.additionalImages);
  }

  let stockStatus: ShopSiteStorefrontProductRecord["stock_status"] =
    "out_of_stock";
  if (product.isDisabled) {
    stockStatus = "out_of_stock";
  } else if (product.quantityOnHand > 0) {
    stockStatus = "in_stock";
  }

  return {
    sku: product.sku,
    name: product.name,
    slug: buildProductSlug(product.name),
    price: product.price,
    description: product.description || null,
    stock_status: stockStatus,
    images,
    short_name: product.shortName?.trim() || null,
    is_special_order: !!product.isSpecialOrder,
    in_store_pickup: !!product.inStorePickup,
    shopsite_pages: parseShopSitePages(product.shopsitePages || []),
    weight: product.weight || null,
    quantity: product.quantityOnHand || 0,
    low_stock_threshold: product.lowStockThreshold ?? 5,
    is_taxable: true,
    minimum_quantity: Math.max(product.minimumQuantity ?? 0, 0),
    long_description: product.moreInfoText || null,
    product_type: normalizeProductTypeValue(product.productTypeName),
    search_keywords: product.searchKeywords || null,
    brand_name: normalizeBrandName(product.brandName),
    pet_type_name: normalizePetTypeValue(product.petTypeName),
    life_stage: normalizeGenericFacetValue(product.lifeStage),
    pet_size: normalizeGenericFacetValue(product.petSize),
    special_diet: normalizeGenericFacetValue(product.specialDiet),
    health_feature: normalizeGenericFacetValue(product.healthFeature),
    food_form: normalizeGenericFacetValue(product.foodForm),
    flavor: normalizeGenericFacetValue(product.flavor),
    category_name: normalizeCategoryValue(product.categoryName),
    product_feature: normalizeGenericFacetValue(product.productFeature),
    size: normalizeGenericFacetValue(product.size),
    color: normalizeGenericFacetValue(product.color),
    packaging_type: normalizeGenericFacetValue(product.packagingType),
  };
}

export function buildPipelineInputFromTransformedShopSiteProduct(
  transformed: ShopSiteStorefrontProductRecord,
  options: { legacyFilename?: string | null } = {},
): ShopSitePipelineInput {
  return {
    name: transformed.name,
    price: transformed.price,
    product_on_pages: transformed.shopsite_pages,
    shopsite_pages: transformed.shopsite_pages,
    description: transformed.description,
    long_description: transformed.long_description,
    short_name: transformed.short_name,
    category: transformed.category_name,
    product_type: transformed.product_type,
    brand: transformed.brand_name,
    pet_type: transformed.pet_type_name,
    lifestage: transformed.life_stage,
    pet_size: transformed.pet_size,
    special_diet: transformed.special_diet,
    health_feature: transformed.health_feature,
    food_form: transformed.food_form,
    flavor: transformed.flavor,
    product_feature: transformed.product_feature,
    size: transformed.size,
    color: transformed.color,
    packaging_type: transformed.packaging_type,
    weight: formatOptionalNumber(transformed.weight) ?? null,
    search_keywords: transformed.search_keywords,
    minimum_quantity: transformed.minimum_quantity,
    is_special_order: transformed.is_special_order,
    in_store_pickup: transformed.in_store_pickup,
    legacy_filename: options.legacyFilename?.trim() || null,
  };
}

export function buildPipelineInputFromShopSiteProduct(
  product: ShopSiteProduct,
): ShopSitePipelineInput {
  return buildPipelineInputFromTransformedShopSiteProduct(
    transformShopSiteProductToStorefrontRecord(product),
    {
      legacyFilename: product.fileName ?? null,
    },
  );
}
