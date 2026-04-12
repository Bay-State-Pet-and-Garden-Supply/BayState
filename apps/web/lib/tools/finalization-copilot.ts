import { tool } from "ai";
import { z } from "zod";
import {
  extractImageCandidatesFromSourcePayload,
  normalizeProductSources,
} from "@/lib/product-sources";
import { SHOPSITE_PAGES } from "@/lib/shopsite/constants";
import {
  FINALIZATION_STOCK_STATUS_VALUES,
  finalizationCopilotContextSchema,
  finalizationDraftSchema,
  type FinalizationCopilotContext,
} from "@/lib/pipeline/finalization-draft";

const toolSummarySchema = z.object({
  summary: z.string(),
});

export type ToolSummary = z.infer<typeof toolSummarySchema>;

const brandSearchResultSchema = z.object({
  query: z.string(),
  brands: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string().nullable().optional(),
    }),
  ),
});

const productSnapshotSchema = z.object({
  sku: z.string(),
  originalName: z.string().nullable(),
  confidenceScore: z.number().nullable(),
  sourceKeys: z.array(z.string()),
  availableStorePages: z.array(z.string()),
  draft: finalizationDraftSchema,
  savedDraft: finalizationDraftSchema,
});

const inspectSourceDataOutputSchema = z.object({
  sourceKey: z.string(),
  focus: z.enum(["all", "pricing", "content", "images"]),
  imageCandidates: z.array(z.string()),
  data: z.record(z.string(), z.unknown()),
});

const listImageSourcesOutputSchema = z.object({
  selectedImages: z.array(z.string()),
  sources: z.array(
    z.object({
      sourceKey: z.string(),
      label: z.string(),
      candidateCount: z.number(),
      candidates: z.array(z.string()),
    }),
  ),
});

const noteInputSchema = z.object({
  note: z.string().optional(),
});

export const setProductFieldsInputSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    longDescription: z.string().optional(),
    price: z.number().min(0).optional(),
    weight: z.string().optional(),
    stockStatus: z.enum(FINALIZATION_STOCK_STATUS_VALUES).optional(),
    availability: z.string().optional(),
    minimumQuantity: z.number().int().min(0).optional(),
    searchKeywords: z.string().optional(),
    gtin: z.string().optional(),
    isSpecialOrder: z.boolean().optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    {
      message: "Provide at least one field to update.",
    },
  );

export type SetProductFieldsInput = z.infer<typeof setProductFieldsInputSchema>;

export const assignBrandInputSchema = z.object({
  brandId: z.string().min(1),
  brandName: z.string().min(1),
});

export type AssignBrandInput = z.infer<typeof assignBrandInputSchema>;

export const createBrandInputSchema = z.object({
  name: z.string().min(1),
});

export type CreateBrandInput = z.infer<typeof createBrandInputSchema>;

export const setStorePagesInputSchema = z.object({
  pages: z.array(z.string()).min(1),
});

export type SetStorePagesInput = z.infer<typeof setStorePagesInputSchema>;

export const addStorePagesInputSchema = z.object({
  pages: z.array(z.string()).min(1),
});

export type AddStorePagesInput = z.infer<typeof addStorePagesInputSchema>;

export const removeStorePagesInputSchema = z.object({
  pages: z.array(z.string()).min(1),
});

export type RemoveStorePagesInput = z.infer<typeof removeStorePagesInputSchema>;

export const replaceSelectedImagesInputSchema = z.object({
  images: z.array(z.string()).min(1),
});

export type ReplaceSelectedImagesInput = z.infer<
  typeof replaceSelectedImagesInputSchema
>;

export const addSelectedImagesInputSchema = z.object({
  images: z.array(z.string()).min(1),
});

export type AddSelectedImagesInput = z.infer<
  typeof addSelectedImagesInputSchema
>;

export const removeSelectedImagesInputSchema = z.object({
  images: z.array(z.string()).min(1),
});

export type RemoveSelectedImagesInput = z.infer<
  typeof removeSelectedImagesInputSchema
>;

export const restoreSavedDraftInputSchema = noteInputSchema;
export type RestoreSavedDraftInput = z.infer<
  typeof restoreSavedDraftInputSchema
>;

export const saveDraftInputSchema = noteInputSchema;
export type SaveDraftInput = z.infer<typeof saveDraftInputSchema>;

export const approveProductInputSchema = noteInputSchema;
export type ApproveProductInput = z.infer<typeof approveProductInputSchema>;

export const rejectProductInputSchema = z.object({
  reason: z.string().optional(),
});

export type RejectProductInput = z.infer<typeof rejectProductInputSchema>;

interface BrandSearchMatch {
  id: string;
  name: string;
  slug?: string | null;
}

export interface FinalizationCopilotToolServices {
  searchBrands: (query: string) => Promise<BrandSearchMatch[]>;
}

function toDisplayString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
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

export function createFinalizationCopilotTools(
  context: FinalizationCopilotContext,
  services: FinalizationCopilotToolServices,
) {
  const parsedContext = finalizationCopilotContextSchema.parse(context);
  const normalizedSources = normalizeProductSources(parsedContext.product.sources);
  const sourceKeys = Object.keys(normalizedSources);

  const imageSources = sourceKeys
    .map((sourceKey) => {
      const sourcePayload = normalizedSources[sourceKey];
      const candidates = extractImageCandidatesFromSourcePayload(sourcePayload, 12);
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
    );

  return {
    getProductSnapshot: tool({
      description:
        "Read the current draft, last saved draft, available store pages, and source keys for the selected product.",
      inputSchema: z.object({}),
      outputSchema: productSnapshotSchema,
      execute: async (input: Record<string, never>) => {
        void input;

        return {
          sku: parsedContext.product.sku,
          originalName: toDisplayString(toRecord(parsedContext.product.input).name),
          confidenceScore: parsedContext.product.confidence_score ?? null,
          sourceKeys,
          availableStorePages: [...SHOPSITE_PAGES],
          draft: parsedContext.draft,
          savedDraft: parsedContext.savedDraft,
        };
      },
    }),

    inspectSourceData: tool({
      description:
        "Inspect a specific scraped source record when you need product facts instead of guessing.",
      inputSchema: z.object({
        sourceKey: z.string(),
        focus: z.enum(["all", "pricing", "content", "images"]).default("all"),
      }),
      outputSchema: inspectSourceDataOutputSchema,
      execute: async ({ sourceKey, focus }) => {
        const sourcePayload = normalizedSources[sourceKey];
        if (!sourcePayload) {
          throw new Error(`Unknown source key: ${sourceKey}`);
        }

        return {
          sourceKey,
          focus,
          imageCandidates: extractImageCandidatesFromSourcePayload(
            sourcePayload,
            12,
          ),
          data: buildSourceInspectionData(sourcePayload, focus),
        };
      },
    }),

    listImageSources: tool({
      description:
        "List grouped image candidates from each scraped source and show which images are currently selected.",
      inputSchema: z.object({}),
      outputSchema: listImageSourcesOutputSchema,
      execute: async () => ({
        selectedImages: parsedContext.draft.selectedImages,
        sources: imageSources,
      }),
    }),

    searchBrands: tool({
      description:
        "Search Bay State's existing brands table and return matching brand ids before assigning a brand.",
      inputSchema: z.object({
        query: z.string(),
      }),
      outputSchema: brandSearchResultSchema,
      execute: async ({ query }) => ({
        query,
        brands: await services.searchBrands(query),
      }),
    }),

    setProductFields: tool({
      description:
        "Update one or more editable product fields such as the name, descriptions, price, weight, stock status, availability text, minimum quantity, search keywords, GTIN, or the special-order flag.",
      inputSchema: setProductFieldsInputSchema,
      outputSchema: toolSummarySchema,
    }),

    assignBrand: tool({
      description:
        "Assign an existing brand id to the current draft. Use searchBrands first unless you already know the exact brand id.",
      inputSchema: assignBrandInputSchema,
      outputSchema: toolSummarySchema,
    }),

    createBrand: tool({
      description:
        "Create a new brand in Bay State's brand catalog and assign it to the current draft when no existing brand matches.",
      inputSchema: createBrandInputSchema,
      outputSchema: toolSummarySchema,
    }),

    setStorePages: tool({
      description:
        "Replace the current ShopSite page assignment with an exact page list.",
      inputSchema: setStorePagesInputSchema,
      outputSchema: toolSummarySchema,
    }),

    addStorePages: tool({
      description:
        "Add one or more ShopSite pages to the current page assignment without removing existing pages.",
      inputSchema: addStorePagesInputSchema,
      outputSchema: toolSummarySchema,
    }),

    removeStorePages: tool({
      description:
        "Remove one or more ShopSite pages from the current page assignment.",
      inputSchema: removeStorePagesInputSchema,
      outputSchema: toolSummarySchema,
    }),

    replaceSelectedImages: tool({
      description:
        "Replace the currently selected images with an exact list of image URLs.",
      inputSchema: replaceSelectedImagesInputSchema,
      outputSchema: toolSummarySchema,
    }),

    addSelectedImages: tool({
      description:
        "Add one or more image URLs to the current selected images without removing existing images.",
      inputSchema: addSelectedImagesInputSchema,
      outputSchema: toolSummarySchema,
    }),

    removeSelectedImages: tool({
      description:
        "Remove one or more image URLs from the current selected images.",
      inputSchema: removeSelectedImagesInputSchema,
      outputSchema: toolSummarySchema,
    }),

    restoreSavedDraft: tool({
      description:
        "Restore the current draft back to the last saved state when the user wants to undo recent draft changes.",
      inputSchema: restoreSavedDraftInputSchema,
      outputSchema: toolSummarySchema,
    }),

    saveDraft: tool({
      description:
        "Save the current draft back to the finalizing product record without moving workflow stages.",
      inputSchema: saveDraftInputSchema,
      outputSchema: toolSummarySchema,
    }),

    approveProduct: tool({
      description:
        "Save the current draft and move the product into exporting. Only use this when the user explicitly wants approval.",
      inputSchema: approveProductInputSchema,
      outputSchema: toolSummarySchema,
    }),

    rejectProduct: tool({
      description:
        "Send the product back to the scraped stage. Only use this when the user explicitly wants to reject or send the product back.",
      inputSchema: rejectProductInputSchema,
      outputSchema: toolSummarySchema,
    }),
  };
}

export type FinalizationCopilotToolSet = ReturnType<
  typeof createFinalizationCopilotTools
>;
