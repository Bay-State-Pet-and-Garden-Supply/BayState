import { z } from "zod";
import type { PipelineProduct } from "@/lib/pipeline/types";
import { normalizeImageUrl } from "@/lib/product-sources";

export const FINALIZATION_STOCK_STATUS_VALUES = [
  "in_stock",
  "out_of_stock",
  "pre_order",
] as const;

export type FinalizationStockStatus =
  (typeof FINALIZATION_STOCK_STATUS_VALUES)[number];

export interface FinalizationDraft {
  name: string;
  price: string;
  weight: string;
  brandId: string;
  availability: string;
  productOnPages: string[];
  isSpecialOrder: boolean;
  customImageUrl: string;
  selectedImages: string[];
}

export const EMPTY_FINALIZATION_DRAFT: FinalizationDraft = {
  name: "",
  price: "",
  weight: "",
  brandId: "none",
  availability: "in stock",
  productOnPages: [],
  isSpecialOrder: false,
  customImageUrl: "",
  selectedImages: [],
};

export const finalizationDraftSchema = z.object({
  name: z.string(),
  price: z.string(),
  weight: z.string(),
  brandId: z.string(),
  availability: z.string(),
  productOnPages: z.array(z.string()),
  isSpecialOrder: z.boolean(),
  customImageUrl: z.string(),
  selectedImages: z.array(z.string()),
});

const nullableUnknownRecordSchema = z.record(z.string(), z.unknown()).nullable();

export const finalizationCopilotProductSchema = z.object({
  sku: z.string().min(1),
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

function parseProductOnPages(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    );
  }

  if (typeof value === "string") {
    return Array.from(
      new Set(
        value
          .split("|")
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    );
  }

  return [];
}

function toFinalizationStockStatus(value: unknown): FinalizationStockStatus {
  if (
    typeof value === "string"
    && FINALIZATION_STOCK_STATUS_VALUES.includes(
      value as FinalizationStockStatus,
    )
  ) {
    return value as FinalizationStockStatus;
  }

  return "in_stock";
}

export function buildFinalizationImageDedupKey(value: string): string {
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
    price: toTrimmedString(consolidated.price ?? input.price),
    weight: toTrimmedString(consolidated.weight ?? input.weight),
    brandId: toTrimmedString(consolidated.brand_id) || "none",
    availability:
      toTrimmedString(consolidated.availability ?? input.availability)
      || "in stock",
    productOnPages: parseProductOnPages(
      consolidated.product_on_pages ?? input.product_on_pages,
    ),
    isSpecialOrder: Boolean(
      consolidated.is_special_order ?? input.is_special_order,
    ),
    customImageUrl: "",
    selectedImages:
      consolidatedImages.length > 0 ? consolidatedImages : metadataSelectedImages,
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
    price: draft.price.trim(),
    weight: draft.weight.trim(),
    brandId: draft.brandId || "none",
    availability: draft.availability.trim() || "in stock",
    productOnPages: parseProductOnPages(draft.productOnPages),
    customImageUrl: "",
    selectedImages: toFinalizationImageArray(draft.selectedImages),
  };
}

export function buildConsolidatedPayloadFromDraft(
  draft: FinalizationDraft,
): Record<string, unknown> {
  const snapshot = createPersistedFinalizationDraftSnapshot(draft);

  return {
    name: snapshot.name,
    description: snapshot.name,
    price: parseNonNegativeFloat(snapshot.price),
    brand_id: snapshot.brandId === "none" ? null : snapshot.brandId,
    is_special_order: snapshot.isSpecialOrder,
    weight: normalizeOptionalText(snapshot.weight),
    product_on_pages: snapshot.productOnPages,
    images: snapshot.selectedImages,
    availability: normalizeOptionalText(snapshot.availability) ?? "in stock",
  };
}
