import { tool } from "ai";
import { z } from "zod";
import {
  FINALIZATION_STOCK_STATUS_VALUES,
  finalizationDraftSchema,
} from "@/lib/pipeline/finalization-draft";
import {
  finalizationProductScopeSchema,
  finalizationWorkspaceProductSummarySchema,
  listWorkspaceProductsInputSchema,
  previewProductScopeInputSchema,
} from "@/lib/pipeline/finalization-copilot-workspace";

export type {
  FinalizationProductScope,
  ListWorkspaceProductsInput,
  PreviewProductScopeInput,
} from "@/lib/pipeline/finalization-copilot-workspace";

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

export const productSnapshotInputSchema = z.object({
  sku: z.string().optional(),
});

export type ProductSnapshotInput = z.infer<typeof productSnapshotInputSchema>;
export type ProductSnapshotOutput = z.infer<typeof productSnapshotSchema>;

const inspectSourceDataOutputSchema = z.object({
  sourceKey: z.string(),
  focus: z.enum(["all", "pricing", "content", "images"]),
  imageCandidates: z.array(z.string()),
  data: z.record(z.string(), z.unknown()),
});

export const inspectSourceDataInputSchema = z.object({
  sku: z.string().optional(),
  sourceKey: z.string(),
  focus: z.enum(["all", "pricing", "content", "images"]).default("all"),
});

export type InspectSourceDataInput = z.infer<typeof inspectSourceDataInputSchema>;
export type InspectSourceDataOutput = z.infer<typeof inspectSourceDataOutputSchema>;

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

export const listImageSourcesInputSchema = z.object({
  sku: z.string().optional(),
});

export type ListImageSourcesInput = z.infer<typeof listImageSourcesInputSchema>;
export type ListImageSourcesOutput = z.infer<typeof listImageSourcesOutputSchema>;

const listWorkspaceProductsOutputSchema = z.object({
  summary: z.string(),
  total: z.number().int().min(0),
  matched: z.number().int().min(0),
  products: z.array(finalizationWorkspaceProductSummarySchema),
});

const previewProductScopeOutputSchema = z.object({
  summary: z.string(),
  matched: z.number().int().min(0),
  products: z.array(finalizationWorkspaceProductSummarySchema),
});

export type ListWorkspaceProductsOutput = z.infer<
  typeof listWorkspaceProductsOutputSchema
>;
export type PreviewProductScopeOutput = z.infer<
  typeof previewProductScopeOutputSchema
>;

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

export const bulkSetProductFieldsInputSchema = z.object({
  scope: finalizationProductScopeSchema,
  changes: setProductFieldsInputSchema,
});

export type BulkSetProductFieldsInput = z.infer<
  typeof bulkSetProductFieldsInputSchema
>;

export const bulkTransformProductNamesInputSchema = z
  .object({
    scope: finalizationProductScopeSchema,
    mode: z.enum(["prefix", "suffix", "replace"]),
    value: z.string(),
    find: z.string().optional(),
    skipIfContains: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === "replace" && !data.find?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide the text to replace when using replace mode.",
        path: ["find"],
      });
    }

    if ((data.mode === "prefix" || data.mode === "suffix") && !data.value.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Provide the text to add when using ${data.mode} mode.`,
        path: ["value"],
      });
    }
  });

export type BulkTransformProductNamesInput = z.infer<
  typeof bulkTransformProductNamesInputSchema
>;

export const assignBrandInputSchema = z.object({
  brandId: z.string().min(1),
  brandName: z.string().min(1),
});

export type AssignBrandInput = z.infer<typeof assignBrandInputSchema>;

export const bulkAssignBrandInputSchema = z.object({
  scope: finalizationProductScopeSchema,
  brandId: z.string().min(1),
  brandName: z.string().min(1),
});

export type BulkAssignBrandInput = z.infer<typeof bulkAssignBrandInputSchema>;

export const createBrandInputSchema = z.object({
  name: z.string().min(1),
});

export type CreateBrandInput = z.infer<typeof createBrandInputSchema>;

export const setStorePagesInputSchema = z.object({
  pages: z.array(z.string()).min(1),
});

export type SetStorePagesInput = z.infer<typeof setStorePagesInputSchema>;

export const bulkStorePagesInputSchema = z.object({
  scope: finalizationProductScopeSchema,
  mode: z.enum(["replace", "add", "remove"]),
  pages: z.array(z.string()).min(1),
});

export type BulkStorePagesInput = z.infer<typeof bulkStorePagesInputSchema>;

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

export const scopedProductActionInputSchema = z.object({
  scope: finalizationProductScopeSchema,
  note: z.string().optional(),
});

export type ScopedProductActionInput = z.infer<
  typeof scopedProductActionInputSchema
>;

export const rejectProductInputSchema = z.object({
  reason: z.string().optional(),
});

export type RejectProductInput = z.infer<typeof rejectProductInputSchema>;

export const scopedRejectProductInputSchema = z.object({
  scope: finalizationProductScopeSchema,
  reason: z.string().optional(),
});

export type ScopedRejectProductInput = z.infer<
  typeof scopedRejectProductInputSchema
>;

interface BrandSearchMatch {
  id: string;
  name: string;
  slug?: string | null;
}

export interface FinalizationCopilotToolServices {
  searchBrands: (query: string) => Promise<BrandSearchMatch[]>;
}
export function createFinalizationCopilotTools(
  services: FinalizationCopilotToolServices,
) {
  return {
    listWorkspaceProducts: tool({
      description:
        "List products currently loaded in the finalizing workspace. Use this before any multi-product action to inspect candidates or narrow scope.",
      inputSchema: listWorkspaceProductsInputSchema,
      outputSchema: listWorkspaceProductsOutputSchema,
    }),

    previewProductScope: tool({
      description:
        "Preview which products a bulk operation would target. Always use this before bulk editing, bulk saving, bulk approval, or bulk rejection.",
      inputSchema: previewProductScopeInputSchema,
      outputSchema: previewProductScopeOutputSchema,
    }),

    getProductSnapshot: tool({
      description:
        "Read the current draft, last saved draft, available store pages, and source keys for a specific product. If sku is omitted, use the currently selected product.",
      inputSchema: productSnapshotInputSchema,
      outputSchema: productSnapshotSchema,
    }),

    inspectSourceData: tool({
      description:
        "Inspect a specific scraped source record for a product when you need facts instead of guessing. If sku is omitted, inspect the currently selected product.",
      inputSchema: inspectSourceDataInputSchema,
      outputSchema: inspectSourceDataOutputSchema,
    }),

    listImageSources: tool({
      description:
        "List grouped image candidates from each scraped source and show which images are selected for a product. If sku is omitted, use the currently selected product.",
      inputSchema: listImageSourcesInputSchema,
      outputSchema: listImageSourcesOutputSchema,
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

    bulkSetProductFields: tool({
      description:
        "Apply the same exact final field values to multiple products in the finalizing workspace. Use this only when every targeted product should receive the identical final value. Never use this to rewrite product names based on their current text.",
      inputSchema: bulkSetProductFieldsInputSchema,
      outputSchema: toolSummarySchema,
    }),

    bulkTransformProductNames: tool({
      description:
        "Transform current product names relative to their existing text across multiple products. Use this for safe prefix, suffix, or find-and-replace operations such as appending a term only when it is missing, instead of overwriting every name with the same literal value.",
      inputSchema: bulkTransformProductNamesInputSchema,
      outputSchema: toolSummarySchema,
    }),

    assignBrand: tool({
      description:
        "Assign an existing brand id to the current draft. Use searchBrands first unless you already know the exact brand id.",
      inputSchema: assignBrandInputSchema,
      outputSchema: toolSummarySchema,
    }),

    bulkAssignBrand: tool({
      description:
        "Assign the same existing brand id to multiple products in the finalizing workspace. Use previewProductScope first and searchBrands unless you already know the exact brand id.",
      inputSchema: bulkAssignBrandInputSchema,
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

    bulkUpdateStorePages: tool({
      description:
        "Replace, add, or remove ShopSite page assignments across multiple products. Use previewProductScope first and prefer exact sku_list scope for narrow edits.",
      inputSchema: bulkStorePagesInputSchema,
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

    saveProducts: tool({
      description:
        "Persist draft changes for multiple products without moving workflow stages. Use previewProductScope first for bulk scopes.",
      inputSchema: scopedProductActionInputSchema,
      outputSchema: toolSummarySchema,
    }),

    approveProduct: tool({
      description:
        "Save the current draft and move the product into exporting. Only use this when the user explicitly wants approval.",
      inputSchema: approveProductInputSchema,
      outputSchema: toolSummarySchema,
    }),

    approveProducts: tool({
      description:
        "Save drafts and approve multiple products. Only use this for bulk scopes when the user explicitly wants those products approved.",
      inputSchema: scopedProductActionInputSchema,
      outputSchema: toolSummarySchema,
    }),

    rejectProduct: tool({
      description:
        "Send the product back to the scraped stage. Only use this when the user explicitly wants to reject or send the product back.",
      inputSchema: rejectProductInputSchema,
      outputSchema: toolSummarySchema,
    }),

    rejectProducts: tool({
      description:
        "Send multiple products back to the scraped stage. Only use this for bulk scopes when the user explicitly wants those products rejected or sent back.",
      inputSchema: scopedRejectProductInputSchema,
      outputSchema: toolSummarySchema,
    }),
  };
}

export type FinalizationCopilotToolSet = ReturnType<
  typeof createFinalizationCopilotTools
>;
