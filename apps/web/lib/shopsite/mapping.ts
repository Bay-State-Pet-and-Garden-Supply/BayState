import type { ShopSiteProduct } from "@/lib/admin/migration/types";
import { normalizePetTypeValue } from "@/lib/admin/migration/pet-type-inference";
import { normalizeGenericFacetValue } from "@/lib/facets/generic-normalization";
import {
  buildFacetSlug,
  normalizeBrandName,
  normalizeCategoryValue,
  normalizeProductTypeValue,
} from "@/lib/facets/normalization";
import { parseShopSitePages, SHOPSITE_PAGES } from "./constants";
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
  weight: number | null;
  quantity: number;
  low_stock_threshold: number | null;
  is_taxable: boolean;
  minimum_quantity: number;
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
  subproducts: string[];
}

export interface ShopSitePipelineInput {
  name: string;
  price: number;
  description?: string | null;
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
  subproduct_skus?: string[];
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
      images,
      image_sources: imageSources,
      brand_folder: brandFolder,
      category: coalesceString(consolidated.category, input.category),
      product_type: coalesceString(
        consolidated.product_type,
        input.product_type,
      ),
      shopsite_pages: (() => {
        const manualPages = parseShopSitePages(
          consolidated.shopsite_pages ??
            input.shopsite_pages,
        );
        if (manualPages.length > 0) return manualPages;
        
        return inferShopSitePagesFromCategory(
          coalesceString(consolidated.category, input.category)
        );
      })(),
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

/**
 * Infers ShopSite pages from a category breadcrumb.
 * Mapping logic based on category names and structures to automate page assignment.
 */
export function inferShopSitePagesFromCategory(category: string | null): string[] {
  if (!category) {
    return [];
  }

  const pages: string[] = [];
  const normalized = category.toLowerCase().trim();
  
  // Split into segments (e.g. "Cat Food > Dry" -> ["cat food", "dry"])
  const segments = normalized.split(/\s*>\s*/).map(s => s.trim());
  const mainCategory = segments[0];
  const subCategory = segments.length > 1 ? segments[1] : null;
  
  // Mapping logic based on new retail taxonomy departments+subcategories
  // New breadcrumbs: "Dog > Food", "Cat > Litter", "Pet Bird > Food", "Horse > Feed", etc.
  if (mainCategory.includes('dog food')) {
    pages.push('Dog Food Shop All');
    if (subCategory?.includes('dry')) pages.push('Dog Food Dry');
    if (subCategory?.includes('wet')) pages.push('Dog Food Wet');
    if (subCategory?.includes('raw')) pages.push('Dog Food Raw');
    if (subCategory?.includes('treat')) pages.push('Dog Treats Shop All');
  } else if (mainCategory.includes('cat food')) {
    pages.push('Cat Food Shop All');
    if (subCategory?.includes('dry')) pages.push('Cat Food Dry');
    if (subCategory?.includes('wet')) pages.push('Cat Food Wet');
    if (subCategory?.includes('raw')) pages.push('Cat Food Raw');
    if (subCategory?.includes('treat')) pages.push('Cat Treats');
  } else if (mainCategory.includes('dog treats') || (mainCategory === 'dog' && subCategory?.includes('treat'))) {
    pages.push('Dog Treats Shop All');
    if (subCategory?.includes('biscuits')) pages.push('Dog Treats Biscuits Cookies & Crunchy Treats');
    if (subCategory?.includes('bones') || subCategory?.includes('chews')) pages.push('Dog Treats Bones Bully Sticks & Natural Chews');
    if (subCategory?.includes('soft') || subCategory?.includes('chewy')) pages.push('Dog Treats Soft & Chewy');
    if (subCategory?.includes('dental')) pages.push('Dog Dental Treats');
    if (subCategory?.includes('jerky')) pages.push('Jerky Dog Treats');
  } else if (mainCategory === 'horse' || mainCategory.includes('horse feed') || mainCategory.includes('horse treats')) {
    pages.push('Horse Feed & Treats Shop All');
    if (subCategory?.includes('feed') || normalized.includes('horse feed')) pages.push('Horse Feed');
    if (subCategory?.includes('treat') || normalized.includes('horse treats')) pages.push('Horse Treats');
  } else if (mainCategory.includes('wild bird')) {
    pages.push('Wild Bird Food Shop All');
    if (subCategory?.includes('seed') || subCategory?.includes('wild bird food')) pages.push('Wild Bird Seed & Seed Mixes');
    if (subCategory?.includes('suet') || subCategory?.includes('mealworm')) pages.push('Wild Bird Suet & Mealworms');
  } else if (mainCategory.includes('pet bird') || mainCategory.includes('caged bird')) {
    pages.push('Caged Bird Food & Supplies Shop All');
    if (subCategory?.includes('food')) pages.push('Caged Bird Food');
    if (subCategory?.includes('toys')) pages.push('Caged Bird Toys');
    if (subCategory?.includes('treat')) pages.push('Caged Bird Treats');
  } else if (mainCategory.includes('small pet')) {
    pages.push('Small Pet Food & Supplies Shop All');
    if (subCategory?.includes('food')) pages.push('Small Pet Food');
    if (subCategory?.includes('bedding')) pages.push('Small Pet Bedding & Litter');
    if (subCategory?.includes('hay')) pages.push('Small Pet Hay');
    if (subCategory?.includes('treat')) pages.push('Small Pet Treats');
  } else if (mainCategory === 'chicken' || mainCategory.includes('poultry')) {
    pages.push('Farm Animal Chicken & Poultry');
    if (subCategory?.includes('feed')) pages.push('Farm Animal Shop All');
  } else if (mainCategory.includes('farm') || mainCategory.includes('livestock') || mainCategory.includes('barn supplies')) {
    pages.push('Barn Supplies Shop All');
    if (subCategory?.includes('buckets') || subCategory?.includes('feeder') || subCategory?.includes('water')) pages.push('Barn Supplies Buckets & Feeders');
    if (subCategory?.includes('fence') || subCategory?.includes('gate') || subCategory?.includes('handling')) pages.push('Barn Supplies Farm Gates & Fencing');
    if (subCategory?.includes('tools')) pages.push('Barn Supplies Tools & Equipment');
  } else if (mainCategory.includes('lawn') || mainCategory.includes('garden')) {
    pages.push('Lawn & Garden Shop All');
    if (subCategory?.includes('care')) pages.push('Lawn Care');
    if (subCategory?.includes('pest')) pages.push('Pest Control & Animal Repellents');
    if (subCategory?.includes('seed')) pages.push('Seeds & Seed Starting');
  } else if (mainCategory.includes('home') || mainCategory.includes('heating')) {
    pages.push('Home Shop All');
    if (subCategory?.includes('heating') || subCategory?.includes('fuel') || subCategory?.includes('pellet')) pages.push('Heating');
    if (subCategory?.includes('pest')) pages.push('Pest Control');
  } else if (mainCategory.includes('tool') || mainCategory.includes('hardware')) {
    pages.push('Hardware');
  }

  // Fallback: If no pages inferred yet, try to find a direct case-insensitive match in SHOPSITE_PAGES
  if (pages.length === 0) {
    const directMatch = SHOPSITE_PAGES.find(p => p.toLowerCase() === normalized);
    if (directMatch) {
      pages.push(directMatch);
    }
  }

  // Deduplicate and filter against SHOPSITE_PAGES to ensure valid output
  const validPages = new Set<string>(SHOPSITE_PAGES);
  return Array.from(new Set(pages)).filter(p => validPages.has(p));
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
    weight: product.weight || null,
    quantity: product.quantityOnHand || 0,
    low_stock_threshold: product.lowStockThreshold ?? 5,
    is_taxable: true,
    minimum_quantity: Math.max(product.minimumQuantity ?? 0, 0),
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
    subproducts: (product.subproducts || [])
      .map((sp) => sp.sku)
      .filter((sku): sku is string => !!sku),
  };
}

export function buildPipelineInputFromTransformedShopSiteProduct(
  transformed: ShopSiteStorefrontProductRecord,
  options: { legacyFilename?: string | null } = {},
): ShopSitePipelineInput {
  return {
    name: transformed.name,
    price: transformed.price,
    description: transformed.description,
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
    subproduct_skus: transformed.subproducts.length > 0 ? transformed.subproducts : undefined,
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
