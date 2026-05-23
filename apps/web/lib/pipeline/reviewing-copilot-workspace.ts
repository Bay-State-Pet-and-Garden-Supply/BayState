import { z } from "zod";
import type { PipelineProduct } from "@/lib/pipeline/types";
import {
  extractImageCandidatesFromSourcePayload,
  normalizeProductSources,
} from "@/lib/product-sources";
import {
  FINALIZATION_STOCK_STATUS_VALUES,
  finalizationCopilotProductSchema,
  finalizationDraftSchema,
  type FinalizationDraft,
} from "@/lib/pipeline/reviewing-draft";

export const finalizationWorkspaceProductSummarySchema = z.object({
  upc: z.string(),
  name: z.string().nullable(),
  price: z.string().nullable(),
  confidenceScore: z.number().nullable(),
  sourceKeys: z.array(z.string()),
  hasBrand: z.boolean(),
  selectedImageCount: z.number().int().min(0),
  selected: z.boolean(),
  dirty: z.boolean(),
});

type FinalizationWorkspaceProductSummary = z.infer<
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
    type: z.literal("upc_list"),
    upcs: z.array(z.string()).min(1),
  }),
  z.object({
    type: z.literal("query"),
    query: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    brand: z.string().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }).refine(
    (data) => data.query || data.name || data.description || data.brand,
    { message: "At least one search parameter must be provided" },
  ),
]);

type FinalizationProductScope = z.infer<
  typeof finalizationProductScopeSchema
>;

export const listWorkspaceProductsInputSchema = z.object({
  query: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  brand: z.string().optional(),
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

const finalizationCopilotWorkspaceSchema = z.object({
  totalProducts: z.number().int().min(0),
  selectedUpc: z.string().nullable(),
  dirtyUpcs: z.array(z.string()),
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
  selectedUpc: string | null,
): FinalizationWorkspaceProductSummary {
  const sourceKeys = Object.keys(normalizeProductSources(product.sources || {}));

  return {
    upc: product.upc,
    name: getCurrentProductName(product, draft),
    price: getCurrentProductPrice(product, draft),
    confidenceScore: product.confidence_score ?? null,
    sourceKeys,
    hasBrand: Boolean(draft?.brandId && draft.brandId !== "none"),
    selectedImageCount: draft?.selectedImages.length ?? 0,
    selected: selectedUpc === product.upc,
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
    product.upc,
    summary.name ?? "",
    getSearchableBrandText(product, draft),
    draft?.description ?? "",
    draft?.gtin ?? "",
    ...summary.sourceKeys,
  ];

  return searchableFields.some((value) =>
    value.toLowerCase().includes(normalizedQuery),
  );
}

export function listWorkspaceProducts(
  products: PipelineProduct[],
  draftsByUpc: Record<string, FinalizationDraft>,
  savedDraftsByUpc: Record<string, FinalizationDraft>,
  selectedUpc: string | null,
  input: ListWorkspaceProductsInput = {},
): {
  total: number;
  matched: number;
  products: FinalizationWorkspaceProductSummary[];
} {
  const summaries = products.map((product) =>
    buildWorkspaceProductSummary(
      product,
      draftsByUpc[product.upc],
      savedDraftsByUpc[product.upc],
      selectedUpc,
    ),
  );

  const filtered = summaries.filter((summary, index) => {
    const product = products[index];
    const draft = draftsByUpc[product.upc];

    // Broad query check
    if (
      input.query &&
      !matchesWorkspaceQuery(product, summary, draft, input.query)
    ) {
      return false;
    }

    // Targeted filters (AND logic)
    if (
      input.name &&
      !summary.name?.toLowerCase().includes(input.name.toLowerCase())
    ) {
      return false;
    }

    if (
      input.brand &&
      !getSearchableBrandText(product, draft)
        .toLowerCase()
        .includes(input.brand.toLowerCase())
    ) {
      return false;
    }

    if (input.description) {
      const desc = draft?.description ?? "";
      if (!desc.toLowerCase().includes(input.description.toLowerCase())) {
        return false;
      }
    }

    return true;
  });

  const limit = input.limit ?? 25;

  return {
    total: summaries.length,
    matched: filtered.length,
    products: filtered.slice(0, limit),
  };
}

export function resolveFinalizationProductScope(
  products: PipelineProduct[],
  draftsByUpc: Record<string, FinalizationDraft>,
  savedDraftsByUpc: Record<string, FinalizationDraft>,
  selectedUpc: string | null,
  scope: FinalizationProductScope,
): string[] {
  const availableUpcs = new Set(products.map((product) => product.upc));

  switch (scope.type) {
    case "selected":
      return selectedUpc ? [selectedUpc] : [];
    case "all":
      return products.map((product) => product.upc);
    case "upc_list":
      return Array.from(
        new Set(scope.upcs.filter((upc) => availableUpcs.has(upc))),
      );
    case "query":
      return listWorkspaceProducts(
        products,
        draftsByUpc,
        savedDraftsByUpc,
        selectedUpc,
        {
          query: scope.query,
          name: scope.name,
          description: scope.description,
          brand: scope.brand,
          limit: scope.limit ?? 200,
        },
      ).products.map((product) => product.upc);
  }
}

export function applySetProductFieldsToDraft(
  draft: FinalizationDraft,
  input: {
    name?: string;
    description?: string;
    price?: number;
    weight?: string;
    category?: string;
    stockStatus?: "in_stock" | "out_of_stock" | "pre_order";
    availability?: string;
    isSpecialOrder?: boolean;
    minimumQuantity?: number | string;
    searchKeywords?: string;
    gtin?: string;
    petType?: string;
    lifeStage?: string;
    petSize?: string;
    specialDiet?: string;
    healthFeature?: string;
    foodForm?: string;
    flavor?: string;
    productFeature?: string;
    size?: string;
    color?: string;
    packagingType?: string;
    facets?: Record<string, string>;
  },
): { draft: FinalizationDraft; updatedFields: string[] } {
  const updatedFields: string[] = [];
  const next = { ...draft };
  next.facets = { ...draft.facets };

  if (input.name !== undefined) {
    next.name = input.name.trim();
    updatedFields.push("name");
  }
  if (input.description !== undefined) {
    next.description = input.description.trim();
    updatedFields.push("description");
  }
  if (input.price !== undefined) {
    next.price = String(input.price);
    updatedFields.push("price");
  }
  if (input.weight !== undefined) {
    next.weight = input.weight.trim();
    updatedFields.push("weight");
  }
  if (input.category !== undefined) {
    next.category = input.category.trim();
    updatedFields.push("category");
  }
  if (input.stockStatus !== undefined) {
    next.stockStatus = input.stockStatus;
    updatedFields.push("stock status");
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
  if (input.searchKeywords !== undefined) {
    next.searchKeywords = input.searchKeywords.trim();
    updatedFields.push("search keywords");
  }
  if (input.gtin !== undefined) {
    next.gtin = input.gtin.trim();
    updatedFields.push("GTIN");
  }

  const legacyMappings: Record<string, keyof typeof input & string> = {
    animal_type: "petType",
    life_stage: "lifeStage",
    breed_size: "petSize",
    diet_type: "specialDiet",
    health_focus: "healthFeature",
    food_form: "foodForm",
    flavor: "flavor",
    claims: "productFeature",
    size: "size",
    color: "color",
    packaging_type: "packagingType",
  };

  for (const [slug, inputKey] of Object.entries(legacyMappings)) {
    const val = input[inputKey as keyof typeof input];
    if (val !== undefined) {
      const valStr = typeof val === "string" ? val.trim() : String(val).trim();
      next.facets[slug] = valStr;
      updatedFields.push(inputKey);
    }
  }

  if (input.facets !== undefined) {
    for (const [slug, val] of Object.entries(input.facets)) {
      next.facets[slug] = (val ?? "").trim();
      updatedFields.push(`facet:${slug}`);
    }
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
    upc: product.upc,
    originalName: toTrimmedString(toRecord(product.input).name),
    confidenceScore: product.confidence_score ?? null,
    sourceKeys: Object.keys(normalizeProductSources(product.sources || {})),
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
