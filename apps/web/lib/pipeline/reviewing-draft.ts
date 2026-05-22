import { z } from "zod";
import type { PipelineProduct } from "@/lib/pipeline/types";
import { normalizeImageUrl } from "@/lib/product-sources";

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
  // Product Details
  petType: string;
  lifeStage: string;
  petSize: string;
  specialDiet: string;
  healthFeature: string;
  foodForm: string;
  flavor: string;
  productFeature: string;
  size: string;
  color: string;
  packagingType: string;
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
  // Product Details
  petType: "",
  lifeStage: "",
  petSize: "",
  specialDiet: "",
  healthFeature: "",
  foodForm: "",
  flavor: "",
  productFeature: "",
  size: "",
  color: "",
  packagingType: "",
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
  petType: z.string(),
  lifeStage: z.string(),
  petSize: z.string(),
  specialDiet: z.string(),
  healthFeature: z.string(),
  foodForm: z.string(),
  flavor: z.string(),
  productFeature: z.string(),
  size: z.string(),
  color: z.string(),
  packagingType: z.string(),
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
  const consolidatedImages = toFinalizationImageArray(consolidated.images);
  const metadataSelectedImages = extractSelectedImageUrls(product.selected_images);

  return {
    name: toTrimmedString(consolidated.name ?? input.name),
    description: toTrimmedString(consolidated.description ?? input.description),
    price: toTrimmedString(consolidated.price ?? input.price),
    weight: toTrimmedString(consolidated.weight ?? input.weight),
    brandId: toTrimmedString(consolidated.brand_id) || "none",
    brandName: toTrimmedString(consolidated.brand ?? ""),
    category: toTrimmedString(consolidated.category ?? ""),
    stockStatus: toFinalizationStockStatus(consolidated.stock_status ?? input.stock_status),
    availability:
      toTrimmedString(consolidated.availability ?? input.availability) ||
      "in stock",
    minimumQuantity: toTrimmedString(consolidated.minimum_quantity ?? input.minimum_quantity) || "0",
    searchKeywords: toTrimmedString(consolidated.search_keywords ?? input.search_keywords),
    gtin: product.upc,
    customImageUrl: "",
    selectedImages:
      consolidatedImages.length > 0 ? consolidatedImages : metadataSelectedImages,
    customSourceUrl: "",
    sources: product.sources || {},
    // Product Details
    petType: toTrimmedString(consolidated.pet_type ?? input.pet_type),
    lifeStage: toTrimmedString(consolidated.lifestage ?? consolidated.life_stage ?? input.lifestage ?? input.life_stage),
    petSize: toTrimmedString(consolidated.pet_size ?? input.pet_size),
    specialDiet: toTrimmedString(consolidated.special_diet ?? input.special_diet),
    healthFeature: toTrimmedString(consolidated.health_feature ?? input.health_feature),
    foodForm: toTrimmedString(consolidated.food_form ?? input.food_form),
    flavor: toTrimmedString(consolidated.flavor ?? input.flavor),
    productFeature: toTrimmedString(consolidated.product_feature ?? input.product_feature),
    size: toTrimmedString(consolidated.size ?? input.size),
    color: toTrimmedString(consolidated.color ?? input.color),
    packagingType: toTrimmedString(consolidated.packaging_type ?? input.packaging_type),
    isSpecialOrder: !!(consolidated.is_special_order ?? input.is_special_order),
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
    petType: draft.petType.trim(),
    lifeStage: draft.lifeStage.trim(),
    petSize: draft.petSize.trim(),
    specialDiet: draft.specialDiet.trim(),
    healthFeature: draft.healthFeature.trim(),
    foodForm: draft.foodForm.trim(),
    flavor: draft.flavor.trim(),
    productFeature: draft.productFeature.trim(),
    size: draft.size.trim(),
    color: draft.color.trim(),
    packagingType: draft.packagingType.trim(),
  };
}

export function buildConsolidatedPayloadFromDraft(
  draft: FinalizationDraft,
): Record<string, unknown> {
  const snapshot = createPersistedFinalizationDraftSnapshot(draft);

  return {
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
    // Product Details
    pet_type: normalizeOptionalText(snapshot.petType),
    life_stage: normalizeOptionalText(snapshot.lifeStage),
    pet_size: normalizeOptionalText(snapshot.petSize),
    special_diet: normalizeOptionalText(snapshot.specialDiet),
    health_feature: normalizeOptionalText(snapshot.healthFeature),
    food_form: normalizeOptionalText(snapshot.foodForm),
    flavor: normalizeOptionalText(snapshot.flavor),
    product_feature: normalizeOptionalText(snapshot.productFeature),
    size: normalizeOptionalText(snapshot.size),
    color: normalizeOptionalText(snapshot.color),
    packaging_type: normalizeOptionalText(snapshot.packagingType),
  };
}
