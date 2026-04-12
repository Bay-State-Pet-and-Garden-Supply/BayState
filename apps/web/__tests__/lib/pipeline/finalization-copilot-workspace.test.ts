import { describe, expect, it } from "@jest/globals";
import {
  applyProductNameTransform,
  applySetProductFieldsToDraft,
  inspectFinalizationProductSource,
  listFinalizationProductImageSources,
  listWorkspaceProducts,
  resolveFinalizationProductScope,
} from "@/lib/pipeline/finalization-copilot-workspace";
import {
  buildInitialFinalizationDraft,
  type FinalizationDraft,
} from "@/lib/pipeline/finalization-draft";
import type { PipelineProduct } from "@/lib/pipeline/types";

function createProduct(
  sku: string,
  overrides: Partial<PipelineProduct> = {},
): PipelineProduct {
  const base: PipelineProduct = {
    sku,
    input: {
      name: `${sku} Imported`,
      description: `${sku} short description`,
      long_description: `${sku} long description`,
      price: 19.99,
      weight: "30 lb",
      stock_status: "in_stock",
      product_on_pages: ["Dog Food Dry"],
      availability: "usually ships in 24 hours",
      minimum_quantity: 1,
      is_special_order: false,
      search_keywords: `${sku.toLowerCase()} pet food`,
      brand: "Acme",
    },
    sources: {
      "source:primary": {
        title: `${sku} Primary Title`,
        description: `${sku} source description`,
        brand: "Acme",
        price: "21.99",
        availability: "in stock",
        images: [
          `https://cdn.example.com/${sku.toLowerCase()}-hero.jpg`,
          `https://cdn.example.com/${sku.toLowerCase()}-detail.jpg`,
        ],
        url: `https://example.com/products/${sku.toLowerCase()}`,
      },
      "source:backup": {
        title: `${sku} Backup Title`,
        images: [`https://cdn.example.com/${sku.toLowerCase()}-backup.jpg`],
        url: `https://backup.example.com/products/${sku.toLowerCase()}`,
      },
    },
    consolidated: {
      name: `${sku} Consolidated`,
      description: `${sku} consolidated description`,
      long_description: `${sku} consolidated long description`,
      price: 24.5,
      images: [`https://cdn.example.com/${sku.toLowerCase()}-hero.jpg`],
      brand_id: "brand-acme",
      weight: "35 lb",
      stock_status: "pre_order",
      product_on_pages: ["Dog Food Dry", "Dog Treats Shop All"],
      is_special_order: false,
      search_keywords: `${sku.toLowerCase()} premium food`,
      gtin: "0123456789012",
      availability: "pre-order now",
      minimum_quantity: 2,
    },
    pipeline_status: "finalizing",
    selected_images: [
      {
        url: `https://cdn.example.com/${sku.toLowerCase()}-metadata.jpg`,
        selectedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    confidence_score: 0.87,
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

describe("finalization copilot workspace helpers", () => {
  it("lists workspace products with query filtering, selection, and dirty state", () => {
    const alpha = createProduct("SKU-ALPHA");
    const beta = createProduct("SKU-BETA", {
      input: {
        ...createProduct("SKU-BETA").input,
        brand: "Barn Co",
      },
      consolidated: {
        ...createProduct("SKU-BETA").consolidated,
        name: "Barn Hay Cubes",
      },
      confidence_score: 0.42,
    });

    const alphaSavedDraft = buildInitialFinalizationDraft(alpha);
    const alphaDraft: FinalizationDraft = {
      ...alphaSavedDraft,
      name: "Premium Chicken Feed",
    };
    const betaDraft = buildInitialFinalizationDraft(beta);

    const result = listWorkspaceProducts(
      [alpha, beta],
      {
        [alpha.sku]: alphaDraft,
        [beta.sku]: betaDraft,
      },
      {
        [alpha.sku]: alphaSavedDraft,
        [beta.sku]: betaDraft,
      },
      alpha.sku,
      {
        query: "premium",
        limit: 10,
      },
    );

    expect(result).toMatchObject({
      total: 2,
      matched: 1,
    });
    expect(result.products).toEqual([
      expect.objectContaining({
        sku: "SKU-ALPHA",
        name: "Premium Chicken Feed",
        selected: true,
        dirty: true,
        hasBrand: true,
        selectedImageCount: 1,
        storePageCount: 2,
      }),
    ]);
  });

  it("resolves selected, explicit, and query scopes against the live workspace", () => {
    const alpha = createProduct("SKU-ALPHA");
    const beta = createProduct("SKU-BETA", {
      consolidated: {
        ...createProduct("SKU-BETA").consolidated,
        name: "Farm Bedding",
        brand_id: "brand-barn",
      },
      input: {
        ...createProduct("SKU-BETA").input,
        brand: "Barn Co",
      },
    });
    const gamma = createProduct("SKU-GAMMA", {
      consolidated: {
        ...createProduct("SKU-GAMMA").consolidated,
        name: "Acme Goat Feed",
      },
    });

    const drafts = {
      [alpha.sku]: buildInitialFinalizationDraft(alpha),
      [beta.sku]: buildInitialFinalizationDraft(beta),
      [gamma.sku]: buildInitialFinalizationDraft(gamma),
    };

    expect(
      resolveFinalizationProductScope(
        [alpha, beta, gamma],
        drafts,
        drafts,
        beta.sku,
        { type: "selected" },
      ),
    ).toEqual([beta.sku]);

    expect(
      resolveFinalizationProductScope(
        [alpha, beta, gamma],
        drafts,
        drafts,
        beta.sku,
        { type: "sku_list", skus: [gamma.sku, "missing", gamma.sku] },
      ),
    ).toEqual([gamma.sku]);

    expect(
      resolveFinalizationProductScope(
        [alpha, beta, gamma],
        drafts,
        drafts,
        beta.sku,
        { type: "query", query: "acme", limit: 2 },
      ),
    ).toEqual([alpha.sku, gamma.sku]);
  });

  it("applies field patches using persisted finalization draft formats", () => {
    const product = createProduct("SKU-ALPHA");
    const draft = buildInitialFinalizationDraft(product);

    const result = applySetProductFieldsToDraft(draft, {
      name: "  Updated Feed Name  ",
      longDescription: "  Better long-form copy  ",
      price: 27.5,
      minimumQuantity: 6,
      gtin: "  999999999999  ",
      isSpecialOrder: true,
    });

    expect(result.updatedFields).toEqual([
      "name",
      "long description",
      "price",
      "minimum quantity",
      "GTIN",
      "special order",
    ]);
    expect(result.draft).toMatchObject({
      name: "Updated Feed Name",
      longDescription: "Better long-form copy",
      price: "27.5",
      minimumQuantity: "6",
      gtin: "999999999999",
      isSpecialOrder: true,
    });
  });

  it("transforms product names without collapsing them to a shared literal", () => {
    const product = createProduct("SKU-ALPHA");
    const draft = buildInitialFinalizationDraft(product);

    expect(
      applyProductNameTransform(draft, {
        mode: "suffix",
        value: "Seed Packet",
        skipIfContains: "Seed Packet",
      }),
    ).toEqual({
      changed: true,
      draft: {
        ...draft,
        name: "SKU-ALPHA Consolidated Seed Packet",
      },
    });

    expect(
      applyProductNameTransform(
        {
          ...draft,
          name: "Tomato Seed Packet",
        },
        {
          mode: "suffix",
          value: "Seed Packet",
          skipIfContains: "Seed Packet",
        },
      ),
    ).toEqual({
      changed: false,
      draft: {
        ...draft,
        name: "Tomato Seed Packet",
      },
    });
  });

  it("returns focused source inspection data and grouped image sources", () => {
    const product = createProduct("SKU-ALPHA");
    const draft = buildInitialFinalizationDraft(product);

    expect(
      inspectFinalizationProductSource(product, "source:primary", "pricing"),
    ).toEqual(
      expect.objectContaining({
        sourceKey: "source:primary",
        focus: "pricing",
        imageCandidates: [
          "https://cdn.example.com/sku-alpha-hero.jpg",
          "https://cdn.example.com/sku-alpha-detail.jpg",
        ],
        data: expect.objectContaining({
          title: "SKU-ALPHA Primary Title",
          brand: "Acme",
          price: "21.99",
          availability: "in stock",
        }),
      }),
    );

    expect(listFinalizationProductImageSources(product, draft)).toEqual({
      selectedImages: ["https://cdn.example.com/sku-alpha-hero.jpg"],
      sources: [
        {
          sourceKey: "source:primary",
          label: "Primary",
          candidateCount: 2,
          candidates: [
            "https://cdn.example.com/sku-alpha-hero.jpg",
            "https://cdn.example.com/sku-alpha-detail.jpg",
          ],
        },
        {
          sourceKey: "source:backup",
          label: "Backup",
          candidateCount: 1,
          candidates: ["https://cdn.example.com/sku-alpha-backup.jpg"],
        },
      ],
    });

    expect(() =>
      inspectFinalizationProductSource(product, "source:missing", "all"),
    ).toThrow("Unknown source key: source:missing");
  });
});
