import { describe, expect, it } from "@jest/globals";
import {
  buildConsolidatedPayloadFromDraft,
  buildInitialFinalizationDraft,
  createPersistedFinalizationDraftSnapshot,
  type FinalizationDraft,
} from "@/lib/pipeline/reviewing-draft";
import type { PipelineProduct } from "@/lib/pipeline/types";

function createProduct(overrides: Partial<PipelineProduct> = {}): PipelineProduct {
  const base: PipelineProduct = {
    upc: "UPC-1",
    input: {
      name: "Imported Name",
      description: "Imported description",
      price: 12.99,
      weight: "25 lb",
      stock_status: "out_of_stock",
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
      price: 24.5,
      images: [
        "https://m.media-amazon.com/images/I/71hero._AC_SL1500_.jpg",
        "https://images-na.ssl-images-amazon.com/images/I/71hero._AC_US500_.jpg",
        "https://cdn.example.com/side.jpg",
      ],
      brand_id: "brand-1",
      weight: "30 lb",
      stock_status: "pre_order",
      is_special_order: false,
      search_keywords: "premium dog food",
      gtin: "999999999999",
      availability: "pre-order now",
      minimum_quantity: 5,
    },
    pipeline_status: "reviewing",
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
      price: "24.5",
      weight: "30 lb",
      brandId: "brand-1",
      stockStatus: "pre_order",
      availability: "pre-order now",
      minimumQuantity: "5",
      searchKeywords: "premium dog food",
      gtin: "UPC-1",
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
      price: " 19.50 ",
      weight: " 30 lb ",
      brandId: "",
      brandName: "",
      category: "",
      customSourceUrl: "",
      sources: {},
      stockStatus: "in_stock",
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
      inStorePickup: false,
      availability: "   ",
      minimumQuantity: "   ",
      searchKeywords: "  dog food, premium  ",
      gtin: " 123456789012 ",
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
      price: "19.50",
      weight: "30 lb",
      brandId: "none",
      brandName: "",
      category: "",
      availability: "in stock",
      minimumQuantity: "0",
      searchKeywords: "dog food, premium",
      gtin: "123456789012",
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
      price: "19.50",
      weight: "   ",
      brandId: "none",
      brandName: "",
      category: "",
      stockStatus: "out_of_stock",
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
      inStorePickup: false,
      availability: "   ",
      minimumQuantity: "7",
      searchKeywords: "  dog food, premium  ",
      gtin: "   ",
      isSpecialOrder: true,
      customImageUrl: "https://cdn.example.com/ignored.jpg",
      selectedImages: ["https://cdn.example.com/side.jpg"],
      customSourceUrl: "",
      sources: {},
    };

    expect(buildConsolidatedPayloadFromDraft(draft)).toEqual({
      name: "Deluxe Chow",
      description: null,
      price: 19.5,
      brand_id: null,
      brand: null,
      category: null,
      stock_status: "out_of_stock",
      weight: null,
      images: ["https://cdn.example.com/side.jpg"],
      search_keywords: "dog food, premium",
      gtin: null,
      availability: "in stock",
      minimum_quantity: 7,
      color: null,
      flavor: null,
      food_form: null,
      health_feature: null,
      life_stage: null,
      packaging_type: null,
      pet_size: null,
      pet_type: null,
      product_feature: null,
      size: null,
      special_diet: null,
    });
  });
});
