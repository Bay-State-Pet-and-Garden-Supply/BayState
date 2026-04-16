import { z } from "zod";
import type { PipelineProduct } from "@/lib/pipeline/types";
import {
  extractImageCandidatesFromSourcePayload,
  normalizeProductSources,
} from "@/lib/product-sources";
import { SHOPSITE_PAGES } from "@/lib/shopsite/constants";
import {
  FINALIZATION_STOCK_STATUS_VALUES,
  finalizationCopilotProductSchema,
  finalizationDraftSchema,
  type FinalizationDraft,
} from "@/lib/pipeline/finalization-draft";

export const finalizationWorkspaceProductSummarySchema = z.object({
  sku: z.string(),
  name: z.string().nullable(),
  price: z.string().nullable(),
  confidenceScore: z.number().nullable(),
  sourceKeys: z.array(z.string()),
  hasBrand: z.boolean(),
  selectedImageCount: z.number().int().min(0),
  storePageCount: z.number().int().min(0),
  selected: z.boolean(),
  dirty: z.boolean(),
});

export type FinalizationWorkspaceProductSummary = z.infer<
  typeof finalizationWorkspaceProductSummarySchema
>;

export const finalizationProductScopeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("selected"),
  }),
  z.object({
    type: z.literal("all"),
  }),
  z.object({
    type: z.literal("sku_list"),
    skus: z.array(z.string()).min(1),
  }),
  z.object({
    type: z.literal("query"),
    query: z.string().min(1),
    limit: z.number().int().min(1).max(200).optional(),
  }),
]);

export type FinalizationProductScope = z.infer<
  typeof finalizationProductScopeSchema
>;

export const listWorkspaceProductsInputSchema = z.object({
  query: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export type ListWorkspaceProductsInput = z.infer<
  typeof listWorkspaceProductsInputSchema
>;

export const previewProductScopeInputSchema = z.object({
  scope: finalizationProductScopeSchema,
});

export type PreviewProductScopeInput = z.infer<
  typeof previewProductScopeInputSchema
>;

export const finalizationCopilotWorkspaceSchema = z.object({
  totalProducts: z.number().int().min(0),
  selectedSku: z.string().nullable(),
  dirtySkus: z.array(z.string()),
});

export const finalizationCopilotContextSchema = z.object({
  workspace: finalizationCopilotWorkspaceSchema,
  selectedProduct: finalizationCopilotProductSchema.nullable(),
  selectedDraft: finalizationDraftSchema.nullable(),
  selectedSavedDraft: finalizationDraftSchema.nullable(),
});

export type FinalizationCopilotContext = z.infer<
  typeof finalizationCopilotContextSchema
>;

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function isDraftDirty(
  draft: FinalizationDraft | undefined,
  savedDraft: FinalizationDraft | undefined,
): boolean {
  if (!draft || !savedDraft) {
    return false;
  }

  return JSON.stringify(draft) !== JSON.stringify(savedDraft);
}

function getCurrentProductName(
  product: PipelineProduct,
  draft: FinalizationDraft | undefined,
): string | null {
  return (
    toTrimmedString(draft?.name)
    ?? toTrimmedString(toRecord(product.consolidated).name)
    ?? toTrimmedString(toRecord(product.input).name)
  );
}

function getCurrentProductPrice(
  product: PipelineProduct,
  draft: FinalizationDraft | undefined,
): string | null {
  return (
    toTrimmedString(draft?.price)
    ?? toTrimmedString(toRecord(product.consolidated).price)
    ?? toTrimmedString(toRecord(product.input).price)
  );
}

function getSearchableBrandText(
  product: PipelineProduct,
  draft: FinalizationDraft | undefined,
): string {
  if (draft?.brandId && draft.brandId !== "none") {
    return draft.brandId;
  }

  const consolidated = toRecord(product.consolidated);
  const input = toRecord(product.input);

  return (
    toTrimmedString(consolidated.brand)
    ?? toTrimmedString(consolidated.brand_id)
    ?? toTrimmedString(input.brand)
    ?? ""
  );
}

export function buildWorkspaceProductSummary(
  product: PipelineProduct,
  draft: FinalizationDraft | undefined,
  savedDraft: FinalizationDraft | undefined,
  selectedSku: string | null,
): FinalizationWorkspaceProductSummary {
  const sourceKeys = Object.keys(normalizeProductSources(product.sources || {}));

  return {
    sku: product.sku,
    name: getCurrentProductName(product, draft),
    price: getCurrentProductPrice(product, draft),
    confidenceScore: product.confidence_score ?? null,
    sourceKeys,
    hasBrand: Boolean(draft?.brandId && draft.brandId !== "none"),
    selectedImageCount: draft?.selectedImages.length ?? 0,
    storePageCount: draft?.productOnPages.length ?? 0,
    selected: selectedSku === product.sku,
    dirty: isDraftDirty(draft, savedDraft),
  };
}

function matchesWorkspaceQuery(
  product: PipelineProduct,
  summary: FinalizationWorkspaceProductSummary,
  draft: FinalizationDraft | undefined,
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const searchableFields = [
    product.sku,
    summary.name ?? "",
    getSearchableBrandText(product, draft),
    ...summary.sourceKeys,
  ];

  return searchableFields.some((value) =>
    value.toLowerCase().includes(normalizedQuery),
  );
}

export function listWorkspaceProducts(
  products: PipelineProduct[],
  draftsBySku: Record<string, FinalizationDraft>,
  savedDraftsBySku: Record<string, FinalizationDraft>,
  selectedSku: string | null,
  input: ListWorkspaceProductsInput = {},
): {
  total: number;
  matched: number;
  products: FinalizationWorkspaceProductSummary[];
} {
  const summaries = products.map((product) =>
    buildWorkspaceProductSummary(
      product,
      draftsBySku[product.sku],
      savedDraftsBySku[product.sku],
      selectedSku,
    ),
  );

  const filtered = input.query
    ? products
        .map((product, index) => ({ product, summary: summaries[index] }))
        .filter(({ product, summary }) =>
          matchesWorkspaceQuery(
            product,
            summary,
            draftsBySku[product.sku],
            input.query ?? "",
          ),
        )
        .map(({ summary }) => summary)
    : summaries;

  const limit = input.limit ?? 25;

  return {
    total: summaries.length,
    matched: filtered.length,
    products: filtered.slice(0, limit),
  };
}

export function resolveFinalizationProductScope(
  products: PipelineProduct[],
  draftsBySku: Record<string, FinalizationDraft>,
  savedDraftsBySku: Record<string, FinalizationDraft>,
  selectedSku: string | null,
  scope: FinalizationProductScope,
): string[] {
  const availableSkus = new Set(products.map((product) => product.sku));

  switch (scope.type) {
    case "selected":
      return selectedSku ? [selectedSku] : [];
    case "all":
      return products.map((product) => product.sku);
    case "sku_list":
      return Array.from(
        new Set(scope.skus.filter((sku) => availableSkus.has(sku))),
      );
    case "query":
      return listWorkspaceProducts(
        products,
        draftsBySku,
        savedDraftsBySku,
        selectedSku,
        {
          query: scope.query,
          limit: scope.limit ?? 200,
        },
      ).products.map((product) => product.sku);
  }
}

export function applySetProductFieldsToDraft(
  draft: FinalizationDraft,
  input: {
    name?: string;
    description?: string;
    longDescription?: string;
    price?: number;
    weight?: string;
    availability?: string;
    isSpecialOrder?: boolean;
    minimumQuantity?: number | string;
    gtin?: string;
  },): { draft: FinalizationDraft; updatedFields: string[] } {
  const updatedFields: string[] = [];
  const next = { ...draft };

  if (input.name !== undefined) {
    next.name = input.name.trim();
    updatedFields.push("name");
  }
  if (input.description !== undefined) {
    next.description = input.description.trim();
    updatedFields.push("description");
  }
  if (input.longDescription !== undefined) {
    next.longDescription = input.longDescription.trim();
    updatedFields.push("long description");
  }
  if (input.price !== undefined) {
    next.price = String(input.price);
    updatedFields.push("price");
  }
  if (input.weight !== undefined) {
    next.weight = input.weight.trim();
    updatedFields.push("weight");
  }
  if (input.availability !== undefined) {
    next.availability = input.availability.trim();
    updatedFields.push("availability");
  }
  if (input.isSpecialOrder !== undefined) {
    next.isSpecialOrder = input.isSpecialOrder;
    updatedFields.push("special order");
  }
  if (input.minimumQuantity !== undefined) {
    next.minimumQuantity = String(input.minimumQuantity);
    updatedFields.push("minimum quantity");
  }
  if (input.gtin !== undefined) {
    next.gtin = input.gtin.trim();
    updatedFields.push("GTIN");
  }

  return { draft: next, updatedFields };
}

function joinNameSegments(left: string, right: string): string {
  return [left.trim(), right.trim()].filter(Boolean).join(" ").trim();
}

export function applyProductNameTransform(
  draft: FinalizationDraft,
  input: {
    mode: "prefix" | "suffix" | "replace";
    value: string;
    find?: string;
    skipIfContains?: string;
  },
): { draft: FinalizationDraft; changed: boolean } {
  const currentName = draft.name.trim();
  const nextValue = input.value.trim();
  const skipIfContains = input.skipIfContains?.trim().toLowerCase();

  if (!currentName) {
    return { draft, changed: false };
  }

  // Value must be provided for prefix/suffix modes; empty string is only allowed for replace mode
  if (input.mode !== "replace" && !nextValue) {
    return { draft, changed: false };
  }

  if (skipIfContains && currentName.toLowerCase().includes(skipIfContains)) {
    return { draft, changed: false };
  }

  let nextName = currentName;

  switch (input.mode) {
    case "prefix":
      if (!currentName.toLowerCase().startsWith(nextValue.toLowerCase())) {
        nextName = joinNameSegments(nextValue, currentName);
      }
      break;
    case "suffix":
      if (!currentName.toLowerCase().endsWith(nextValue.toLowerCase())) {
        nextName = joinNameSegments(currentName, nextValue);
      }
      break;
    case "replace": {
      const find = input.find?.trim();
      if (!find) {
        throw new Error("Provide the text to replace when using replace mode.");
      }
      if (!currentName.includes(find)) {
        return { draft, changed: false };
      }
      nextName = currentName.split(find).join(nextValue).trim();
      break;
    }
  }

  if (nextName === currentName) {
    return { draft, changed: false };
  }

  return {
    draft: {
      ...draft,
      name: nextName,
    },
    changed: true,
  };
}

function formatSourceLabel(sourceKey: string): string {
  return sourceKey
    .replace(/^source:/i, "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildSourceInspectionData(
  sourcePayload: Record<string, unknown>,
  focus: "all" | "pricing" | "content" | "images",
): Record<string, unknown> {
  if (focus === "images") {
    return {
      title: sourcePayload.title ?? null,
      url: sourcePayload.url ?? null,
      images: Array.isArray(sourcePayload.images) ? sourcePayload.images : [],
    };
  }

  if (focus === "pricing") {
    return {
      title: sourcePayload.title ?? null,
      brand: sourcePayload.brand ?? null,
      price: sourcePayload.price ?? null,
      weight: sourcePayload.weight ?? null,
      size: sourcePayload.size ?? null,
      availability: sourcePayload.availability ?? null,
      unit_of_measure: sourcePayload.unit_of_measure ?? null,
      case_pack: sourcePayload.case_pack ?? null,
      upc: sourcePayload.upc ?? null,
      item_number: sourcePayload.item_number ?? null,
      manufacturer_part_number: sourcePayload.manufacturer_part_number ?? null,
      url: sourcePayload.url ?? null,
    };
  }

  if (focus === "content") {
    return {
      title: sourcePayload.title ?? null,
      description: sourcePayload.description ?? null,
      features: sourcePayload.features ?? null,
      ingredients: sourcePayload.ingredients ?? null,
      specifications: sourcePayload.specifications ?? null,
      categories: sourcePayload.categories ?? null,
      category: sourcePayload.category ?? null,
      url: sourcePayload.url ?? null,
    };
  }

  return sourcePayload;
}

export function buildFinalizationProductSnapshot(
  product: PipelineProduct,
  draft: FinalizationDraft,
  savedDraft: FinalizationDraft,
) {
  return {
    sku: product.sku,
    originalName: toTrimmedString(toRecord(product.input).name),
    confidenceScore: product.confidence_score ?? null,
    sourceKeys: Object.keys(normalizeProductSources(product.sources || {})),
    availableStorePages: [...SHOPSITE_PAGES],
    draft,
    savedDraft,
  };
}

export function inspectFinalizationProductSource(
  product: PipelineProduct,
  sourceKey: string,
  focus: "all" | "pricing" | "content" | "images",
) {
  const normalizedSources = normalizeProductSources(product.sources || {});
  const sourcePayload = normalizedSources[sourceKey];

  if (!sourcePayload) {
    throw new Error(`Unknown source key: ${sourceKey}`);
  }

  return {
    sourceKey,
    focus,
    imageCandidates: extractImageCandidatesFromSourcePayload(sourcePayload, 12),
    data: buildSourceInspectionData(sourcePayload, focus),
  };
}

export function listFinalizationProductImageSources(
  product: PipelineProduct,
  draft: FinalizationDraft,
) {
  const normalizedSources = normalizeProductSources(product.sources || {});
  const sourceKeys = Object.keys(normalizedSources);

  return {
    selectedImages: draft.selectedImages,
    sources: sourceKeys
      .map((sourceKey) => {
        const candidates = extractImageCandidatesFromSourcePayload(
          normalizedSources[sourceKey],
          12,
        );
        if (candidates.length === 0) {
          return null;
        }

        return {
          sourceKey,
          label: formatSourceLabel(sourceKey),
          candidateCount: candidates.length,
          candidates,
        };
      })
      .filter(
        (
          source,
        ): source is {
          sourceKey: string;
          label: string;
          candidateCount: number;
          candidates: string[];
        } => source !== null,
      ),
  };
}
