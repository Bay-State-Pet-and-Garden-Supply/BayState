import { z } from "zod";
import type { PipelineProduct } from "@/lib/pipeline/types";
import { normalizeImageUrl } from "@/lib/product-sources";
import { collectSourceBackedFallbacks } from "@/lib/product-source-fallbacks";

export const FINALIZATION_STOCK_STATUS_VALUES = [
  "in_stock",
  "out_of_stock",
  "pre_order",
] as const;

type FinalizationStockStatus =
  (typeof FINALIZATION_STOCK_STATUS_VALUES)[number];

export interface FinalizationDraft {
  name: string;
  description: string;
  price: string;
  weight: string;
  brandId: string;
  brandName: string;
  category: string;
  stockStatus: FinalizationStockStatus;
  availability: string;
  minimumQuantity: string;
  searchKeywords: string;
  gtin: string;
  customImageUrl: string;
  selectedImages: string[];
  customSourceUrl: string;
  sources: Record<string, unknown>;
  facets: Record<string, string>;
  isSpecialOrder: boolean;
  inStorePickup: boolean;
}

export const EMPTY_FINALIZATION_DRAFT: FinalizationDraft = {
  name: "",
  description: "",
  price: "",
  weight: "",
  brandId: "none",
  brandName: "",
  category: "",
  stockStatus: "in_stock",
  availability: "in stock",
  minimumQuantity: "0",
  searchKeywords: "",
  gtin: "",
  customImageUrl: "",
  selectedImages: [],
  customSourceUrl: "",
  sources: {},
  facets: {},
  isSpecialOrder: false,
  inStorePickup: true,
};

export const finalizationDraftSchema = z.object({
  name: z.string(),
  description: z.string(),
  price: z.string(),
  weight: z.string(),
  brandId: z.string(),
  brandName: z.string(),
  category: z.string(),
  stockStatus: z.enum(["in_stock", "out_of_stock", "pre_order"]),
  availability: z.string(),
  minimumQuantity: z.string(),
  searchKeywords: z.string(),
  gtin: z.string(),
  customImageUrl: z.string(),
  selectedImages: z.array(z.string()),
  customSourceUrl: z.string(),
  sources: z.record(z.string(), z.unknown()),
  facets: z.record(z.string(), z.string()),
  isSpecialOrder: z.boolean(),
  inStorePickup: z.boolean(),
});

const nullableUnknownRecordSchema = z.record(z.string(), z.unknown()).nullable();

export const finalizationCopilotProductSchema = z.object({
  upc: z.string().min(1),
  input: nullableUnknownRecordSchema,
  consolidated: nullableUnknownRecordSchema,
  sources: z.record(z.string(), z.unknown()),
  selected_images: z.unknown().optional(),
  confidence_score: z.number().nullable().optional(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTrimmedString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  return "";
}


function toFinalizationStockStatus(value: unknown): FinalizationStockStatus {
  if (
    typeof value === "string" &&
    FINALIZATION_STOCK_STATUS_VALUES.includes(value as FinalizationStockStatus)
  ) {
    return value as FinalizationStockStatus;
  }

  return "in_stock";
}

function buildFinalizationImageDedupKey(value: string): string {
  const normalized = normalizeImageUrl(value);
  if (/amazon\./i.test(normalized) && /\/images\/I\//i.test(normalized)) {
    return normalized.replace(/^https?:\/\/[^/]+/i, "").toLowerCase();
  }

  return normalized;
}

export function toFinalizationImageArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const deduped = new Map<string, string>();

  value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => normalizeImageUrl(entry))
    .filter(Boolean)
    .forEach((entry) => {
      const key = buildFinalizationImageDedupKey(entry);
      if (!deduped.has(key)) {
        deduped.set(key, entry);
      }
    });

  return Array.from(deduped.values());
}

// fallow-ignore-next-line unused-export
export function extractSelectedImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const urls = value
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (isRecord(entry)) {
        const url = entry.url;
        return typeof url === "string" ? url : null;
      }
      return null;
    })
    .filter((entry): entry is string => typeof entry === "string");

  return toFinalizationImageArray(urls);
}

export function buildInitialFinalizationDraft(
  product: PipelineProduct,
): FinalizationDraft {
  const consolidated = isRecord(product.consolidated) ? product.consolidated : {};
  const input = isRecord(product.input) ? product.input : {};
  const core = isRecord(consolidated.core) ? consolidated.core : {};
  const sources = product.sources || {};

  // Collect source-backed fallbacks for when consolidated/input are blank
  const fallbacks = collectSourceBackedFallbacks(sources, input);

  let consolidatedImages: string[] = [];
  if (Array.isArray(consolidated.media)) {
    consolidatedImages = toFinalizationImageArray(consolidated.media.map((m: any) => m?.url));
  } else {
    consolidatedImages = toFinalizationImageArray(consolidated.images);
  }
  const metadataSelectedImages = extractSelectedImageUrls(product.selected_images);

  const facets: Record<string, string> = {};

  // Facets from consolidated (highest priority)
  if (Array.isArray(consolidated.facets)) {
    for (const f of consolidated.facets) {
      if (f && typeof f.definition_slug === "string" && typeof f.value === "string") {
        facets[f.definition_slug] = f.value;
      }
    }
  }

  // Legacy mappings from consolidated/input
  const legacyMappings: Record<string, string> = {
    animal_type: toTrimmedString(consolidated.pet_type ?? input.pet_type),
    life_stage: toTrimmedString(consolidated.lifestage ?? consolidated.life_stage ?? input.lifestage ?? input.life_stage),
    breed_size: toTrimmedString(consolidated.pet_size ?? input.pet_size),
    diet_type: toTrimmedString(consolidated.special_diet ?? input.special_diet),
    health_focus: toTrimmedString(consolidated.health_feature ?? input.health_feature),
    food_form: toTrimmedString(consolidated.food_form ?? input.food_form),
    flavor: toTrimmedString(consolidated.flavor ?? input.flavor),
    claims: toTrimmedString(consolidated.product_feature ?? input.product_feature),
    size: toTrimmedString(consolidated.size ?? input.size),
    color: toTrimmedString(consolidated.color ?? input.color),
    packaging_type: toTrimmedString(consolidated.packaging_type ?? input.packaging_type),
  };

  for (const [slug, val] of Object.entries(legacyMappings)) {
    if (val && !facets[slug]) {
      facets[slug] = val;
    }
  }

  // Source-backed fallback facets (lowest priority — only fill blanks)
  if (fallbacks.facets.length > 0) {
    for (const fb of fallbacks.facets) {
      if (fb.value && !facets[fb.definition_slug]) {
        facets[fb.definition_slug] = fb.value;
      }
    }
  }

  // Source-backed fallback images
  const fallbackImages = toFinalizationImageArray(
    fallbacks.media.map((m) => m.url).filter(Boolean)
  );
  const selectedImages = consolidatedImages.length > 0
    ? consolidatedImages
    : metadataSelectedImages.length > 0
      ? metadataSelectedImages
      : fallbackImages;

  return {
    name: toTrimmedString(core.name ?? consolidated.name ?? input.name ?? fallbacks.core.name),
    description: toTrimmedString(core.description ?? consolidated.description ?? input.description ?? fallbacks.core.description),
    price: toTrimmedString(core.price ?? consolidated.price ?? input.price),
    weight: toTrimmedString(core.weight_lbs ?? consolidated.weight ?? input.weight ?? fallbacks.core.weight_lbs),
    brandId: toTrimmedString(core.brand_id ?? consolidated.brand_id) || "none",
    brandName: toTrimmedString(core.brand_name ?? consolidated.brand ?? fallbacks.core.brand ?? ""),
    category: toTrimmedString(core.canonical_category_breadcrumb ?? consolidated.category ?? ""),
    stockStatus: toFinalizationStockStatus(core.stock_status ?? consolidated.stock_status ?? input.stock_status),
    availability:
      toTrimmedString(core.availability ?? consolidated.availability ?? input.availability) ||
      "in stock",
    minimumQuantity: toTrimmedString(core.minimum_quantity ?? consolidated.minimum_quantity ?? input.minimum_quantity) || "0",
    searchKeywords: toTrimmedString(core.search_keywords ?? consolidated.search_keywords ?? input.search_keywords ?? fallbacks.core.search_keywords),
    gtin: product.upc,
    customImageUrl: "",
    selectedImages,
    customSourceUrl: "",
    sources,
    facets,
    isSpecialOrder: !!(core.is_special_order ?? consolidated.is_special_order ?? input.is_special_order),
    inStorePickup: !!(consolidated.in_store_pickup ?? input.in_store_pickup ?? true),
  };
}

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNonNegativeFloat(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseNonNegativeInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function createPersistedFinalizationDraftSnapshot(
  draft: FinalizationDraft,
): FinalizationDraft {
  const facets: Record<string, string> = {};
  if (draft.facets) {
    for (const [k, v] of Object.entries(draft.facets)) {
      facets[k] = v.trim();
    }
  }

  return {
    ...draft,
    name: draft.name.trim(),
    description: draft.description.trim(),
    price: draft.price.trim(),
    weight: draft.weight.trim(),
    brandId: draft.brandId || "none",
    brandName: draft.brandName.trim(),
    category: draft.category.trim(),
    stockStatus: draft.stockStatus,
    availability: draft.availability.trim() || "in stock",
    minimumQuantity: String(parseNonNegativeInt(draft.minimumQuantity)),
    searchKeywords: draft.searchKeywords.trim(),
    gtin: draft.gtin.trim(),
    customImageUrl: "",
    selectedImages: toFinalizationImageArray(draft.selectedImages),
    customSourceUrl: "",
    sources: draft.sources,
    facets,
  };
}

export function buildConsolidatedPayloadFromDraft(
  draft: FinalizationDraft,
): Record<string, unknown> {
  const snapshot = createPersistedFinalizationDraftSnapshot(draft);

  const core = {
    name: snapshot.name,
    brand_name: normalizeOptionalText(snapshot.brandName),
    brand_id: snapshot.brandId === "none" ? null : snapshot.brandId,
    description: normalizeOptionalText(snapshot.description),
    price: parseNonNegativeFloat(snapshot.price),
    weight_lbs: parseNonNegativeFloat(snapshot.weight),
    category_id: null as string | null,
    canonical_category_breadcrumb: normalizeOptionalText(snapshot.category),
    search_keywords: normalizeOptionalText(snapshot.searchKeywords),
    confidence_score: 1.0,
    stock_status: snapshot.stockStatus,
    availability: normalizeOptionalText(snapshot.availability) ?? "in stock",
    minimum_quantity: parseNonNegativeInt(snapshot.minimumQuantity),
    is_special_order: snapshot.isSpecialOrder,
    is_taxable: true,
  };

  const facets = Object.entries(snapshot.facets || {})
    .filter(([, val]) => val.length > 0)
    .map(([slug, val]) => ({
      definition_slug: slug,
      value: val,
      confidence_score: 1.0,
      evidence_source: "manual" as const,
    }));

  const media = snapshot.selectedImages.map((url) => ({
    url,
    role: "product_image",
    source: "manual",
    confidence_score: 1.0,
  }));

  const evidence = {
    selected_images: snapshot.selectedImages,
    source_urls: snapshot.customSourceUrl ? [snapshot.customSourceUrl] : [],
  };

  const legacySlugToProp: Record<string, string> = {
    animal_type: "pet_type",
    life_stage: "life_stage",
    breed_size: "pet_size",
    diet_type: "special_diet",
    health_focus: "health_feature",
    food_form: "food_form",
    flavor: "flavor",
    claims: "product_feature",
    size: "size",
    color: "color",
    packaging_type: "packaging_type",
  };

  const payload: Record<string, unknown> = {
    core,
    facets,
    media,
    evidence,

    name: snapshot.name,
    description: normalizeOptionalText(snapshot.description),
    price: parseNonNegativeFloat(snapshot.price),
    brand_id: snapshot.brandId === "none" ? null : snapshot.brandId,
    brand: normalizeOptionalText(snapshot.brandName),
    category: normalizeOptionalText(snapshot.category),
    stock_status: snapshot.stockStatus,
    weight: normalizeOptionalText(snapshot.weight),
    images: snapshot.selectedImages,
    search_keywords: normalizeOptionalText(snapshot.searchKeywords),
    gtin: normalizeOptionalText(snapshot.gtin),
    availability: normalizeOptionalText(snapshot.availability) ?? "in stock",
    minimum_quantity: parseNonNegativeInt(snapshot.minimumQuantity),
    is_special_order: snapshot.isSpecialOrder,
    is_taxable: true,
  };

  for (const [slug, propName] of Object.entries(legacySlugToProp)) {
    payload[propName] = normalizeOptionalText(snapshot.facets[slug] ?? "");
  }

  return payload;
}
