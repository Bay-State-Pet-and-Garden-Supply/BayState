import { describe, expect, it } from "@jest/globals";
import {
  buildConsolidatedPayloadFromDraft,
  buildInitialFinalizationDraft,
  createPersistedFinalizationDraftSnapshot,
  type FinalizationDraft,
} from "@/lib/pipeline/finalization-draft";
import type { PipelineProduct } from "@/lib/pipeline/types";

function createProduct(overrides: Partial<PipelineProduct> = {}): PipelineProduct {
  const base: PipelineProduct = {
    sku: "SKU-1",
    input: {
      name: "Imported Name",
      description: "Imported description",
      long_description: "Imported long description",
      price: 12.99,
      weight: "25 lb",
      stock_status: "out_of_stock",
      product_on_pages: "DOG|DOG|CAT",
      gtin: "123456789012",
      availability: "ships in 2 days",
      minimum_quantity: 2,
      is_special_order: true,
      search_keywords: "imported keywords",
      brand: "Imported Brand",
    },
    sources: {
      retailer: {
        title: "Retailer title",
      },
    },
    consolidated: {
      name: "Consolidated Name",
      description: "Consolidated description",
      long_description: "Consolidated long description",
      price: 24.5,
      images: [
        "https://m.media-amazon.com/images/I/71hero._AC_SL1500_.jpg",
        "https://images-na.ssl-images-amazon.com/images/I/71hero._AC_US500_.jpg",
        "https://cdn.example.com/side.jpg",
      ],
      brand_id: "brand-1",
      weight: "30 lb",
      stock_status: "pre_order",
      product_on_pages: ["FEED", "FEED", "SEASONAL"],
      is_special_order: false,
      search_keywords: "premium dog food",
      gtin: "999999999999",
      availability: "pre-order now",
      minimum_quantity: 5,
    },
    pipeline_status: "finalizing",
    selected_images: [
      {
        url: "https://cdn.example.com/fallback.jpg",
        selectedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };

  return {
    ...base,
    ...overrides,
    input: overrides.input ?? base.input,
    sources: overrides.sources ?? base.sources,
    consolidated: overrides.consolidated ?? base.consolidated,
    selected_images: overrides.selected_images ?? base.selected_images,
  };
}

describe("finalization draft helpers", () => {
  it("builds the initial draft from consolidated data and deduplicates images", () => {
    const draft = buildInitialFinalizationDraft(createProduct());

    expect(draft).toMatchObject({
      name: "Consolidated Name",
      description: "Consolidated description",
      longDescription: "Consolidated long description",
      price: "24.5",
      weight: "30 lb",
      brandId: "brand-1",
      stockStatus: "pre_order",
      availability: "pre-order now",
      minimumQuantity: "5",
      searchKeywords: "premium dog food",
      gtin: "999999999999",
      productOnPages: ["FEED", "SEASONAL"],
      isSpecialOrder: false,
      customImageUrl: "",
    });

    expect(draft.selectedImages).toEqual([
      "https://m.media-amazon.com/images/I/71hero.jpg",
      "https://cdn.example.com/side.jpg",
    ]);
  });

  it("falls back to selected image metadata when consolidated images are absent", () => {
    const draft = buildInitialFinalizationDraft(
      createProduct({
        consolidated: {
          ...createProduct().consolidated,
          images: [],
        },
        selected_images: [
          {
            url: "https://cdn.example.com/fallback.jpg",
            selectedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            url: "https://cdn.example.com/fallback.jpg",
            selectedAt: "2026-01-01T00:00:01.000Z",
          },
        ],
      }),
    );

    expect(draft.selectedImages).toEqual([
      "https://cdn.example.com/fallback.jpg",
    ]);
  });

  it("creates a normalized persisted snapshot for dirty tracking and saves", () => {
    const draft: FinalizationDraft = {
      name: "  Deluxe Chow  ",
      description: "  Fresh and hearty  ",
      longDescription: "  Full details  ",
      price: " 19.50 ",
      weight: " 30 lb ",
      brandId: "",
      stockStatus: "in_stock",
      availability: "   ",
      minimumQuantity: "   ",
      searchKeywords: "  dog food, premium  ",
      gtin: " 123456789012 ",
      productOnPages: ["DOG", " DOG ", "", "DOG"],
      isSpecialOrder: true,
      customImageUrl: "https://cdn.example.com/new.jpg",
      selectedImages: [
        "https://m.media-amazon.com/images/I/71hero._AC_SL1500_.jpg",
        "https://images-na.ssl-images-amazon.com/images/I/71hero._AC_US500_.jpg",
        "https://cdn.example.com/side.jpg",
      ],
    };

    expect(createPersistedFinalizationDraftSnapshot(draft)).toEqual({
      ...draft,
      name: "Deluxe Chow",
      description: "Fresh and hearty",
      longDescription: "Full details",
      price: "19.50",
      weight: "30 lb",
      brandId: "none",
      availability: "in stock",
      minimumQuantity: "0",
      searchKeywords: "dog food, premium",
      gtin: "123456789012",
      productOnPages: ["DOG"],
      customImageUrl: "",
      selectedImages: [
        "https://m.media-amazon.com/images/I/71hero.jpg",
        "https://cdn.example.com/side.jpg",
      ],
    });
  });

  it("builds the consolidated payload expected by publish/update flows", () => {
    const draft: FinalizationDraft = {
      name: "Deluxe Chow",
      description: "   ",
      longDescription: "  Long form copy  ",
      price: "19.50",
      weight: "   ",
      brandId: "none",
      stockStatus: "out_of_stock",
      availability: "   ",
      minimumQuantity: "7",
      searchKeywords: "  dog food, premium  ",
      gtin: "   ",
      productOnPages: ["DOG", "DOG"],
      isSpecialOrder: true,
      customImageUrl: "https://cdn.example.com/ignored.jpg",
      selectedImages: ["https://cdn.example.com/side.jpg"],
    };

    expect(buildConsolidatedPayloadFromDraft(draft)).toEqual({
      name: "Deluxe Chow",
      description: null,
      long_description: "Long form copy",
      price: 19.5,
      brand_id: null,
      stock_status: "out_of_stock",
      is_special_order: true,
      weight: null,
      product_on_pages: ["DOG"],
      images: ["https://cdn.example.com/side.jpg"],
      search_keywords: "dog food, premium",
      gtin: null,
      availability: "in stock",
      minimum_quantity: 7,
    });
  });
});
