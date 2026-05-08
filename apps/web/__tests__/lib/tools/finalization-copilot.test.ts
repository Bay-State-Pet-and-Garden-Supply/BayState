import { describe, expect, it } from "@jest/globals";
import { createFinalizationCopilotTools } from "@/lib/tools/finalization-copilot";

const mockServices: any = {
  searchBrands: jest.fn(async () => []),
};

describe("finalization copilot tool definitions", () => {
  const tools = createFinalizationCopilotTools(mockServices);

  describe("setProductFields", () => {
    it("accepts a valid field update", () => {
      const schema = tools.setProductFields.inputSchema as any;
      const result = schema.safeParse({ name: "New Product Name" });
      expect(result.success).toBe(true);
    });

    it("accepts stockStatus field", () => {
      const schema = tools.setProductFields.inputSchema as any;
      const result = schema.safeParse({ stockStatus: "out_of_stock" });
      expect(result.success).toBe(true);
    });

    it("accepts searchKeywords field", () => {
      const schema = tools.setProductFields.inputSchema as any;
      const result = schema.safeParse({ searchKeywords: "pet food organic" });
      expect(result.success).toBe(true);
    });

    it("accepts category field", () => {
      const schema = tools.setProductFields.inputSchema as any;
      const result = schema.safeParse({ category: "Dog > Food > Dry Food" });
      expect(result.success).toBe(true);
    });

    it("accepts multiple fields at once", () => {
      const schema = tools.setProductFields.inputSchema as any;
      const result = schema.safeParse({
        name: "Updated Feed",
        price: 29.99,
        category: "Dog > Food > Dry Food",
        stockStatus: "in_stock",
        searchKeywords: "feed organic natural",
        isSpecialOrder: true,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty updates (no fields provided)", () => {
      const schema = tools.setProductFields.inputSchema as any;
      const result = schema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects invalid stockStatus values", () => {
      const schema = tools.setProductFields.inputSchema as any;
      const result = schema.safeParse({ stockStatus: "discontinued" });
      expect(result.success).toBe(false);
    });

    it("rejects negative prices", () => {
      const schema = tools.setProductFields.inputSchema as any;
      const result = schema.safeParse({ price: -5 });
      expect(result.success).toBe(false);
    });
  });

  describe("replaceSelectedImages", () => {
    it("accepts a valid image URL list", () => {
      const schema = tools.replaceSelectedImages.inputSchema as any;
      const result = schema.safeParse({
        images: ["https://cdn.example.com/img1.jpg", "https://cdn.example.com/img2.jpg"],
      });
      expect(result.success).toBe(true);
    });

    it("rejects an empty image list", () => {
      const schema = tools.replaceSelectedImages.inputSchema as any;
      const result = schema.safeParse({ images: [] });
      expect(result.success).toBe(false);
    });
  });

  describe("source tools", () => {
    it("accepts a valid source URL", () => {
      const schema = tools.addSourceUrl.inputSchema as any;
      const result = schema.safeParse({ url: "https://example.com/product/source" });
      expect(result.success).toBe(true);
    });

    it("rejects an invalid source URL", () => {
      const schema = tools.addSourceUrl.inputSchema as any;
      const result = schema.safeParse({ url: "not-a-url" });
      expect(result.success).toBe(false);
    });

    it("accepts a source key for removal", () => {
      const schema = tools.removeSource.inputSchema as any;
      const result = schema.safeParse({ sourceKey: "custom:example.com" });
      expect(result.success).toBe(true);
    });
  });

  describe("bulkTransformProductNames", () => {
    it("accepts a valid suffix transform", () => {
      const schema = tools.bulkTransformProductNames.inputSchema as any;
      const result = schema.safeParse({
        scope: { type: "all" },
        mode: "suffix",
        value: "Seed Packet",
      });
      expect(result.success).toBe(true);
    });

    it("rejects replace mode without find text", () => {
      const schema = tools.bulkTransformProductNames.inputSchema as any;
      const result = schema.safeParse({
        scope: { type: "all" },
        mode: "replace",
        value: "new",
        find: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects prefix mode with empty value", () => {
      const schema = tools.bulkTransformProductNames.inputSchema as any;
      const result = schema.safeParse({
        scope: { type: "all" },
        mode: "prefix",
        value: "   ",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("searchBrands", () => {
    it("executes the server-side brand search", async () => {
      const mockBrands = [
        { id: "brand-1", name: "Acme", slug: "acme" },
        { id: "brand-2", name: "Acme Pro", slug: "acme-pro" },
      ];
      mockServices.searchBrands.mockResolvedValueOnce(mockBrands);

      const result = await tools.searchBrands.execute!(
        { query: "acme" },
        { messages: [], toolCallId: "test-call", abortSignal: new AbortController().signal },
      );

      expect(result).toEqual({
        query: "acme",
        brands: mockBrands,
      });
      expect(mockServices.searchBrands).toHaveBeenCalledWith("acme");
    });
  });

  describe("scope schemas", () => {
    it("accepts selected scope", () => {
      const schema = tools.previewProductScope.inputSchema as any;
      const result = schema.safeParse({ scope: { type: "selected" } });
      expect(result.success).toBe(true);
    });

    it("accepts sku_list scope", () => {
      const schema = tools.previewProductScope.inputSchema as any;
      const result = schema.safeParse({
        scope: { type: "sku_list", skus: ["SKU-1", "SKU-2"] },
      });
      expect(result.success).toBe(true);
    });

    it("rejects sku_list scope with empty list", () => {
      const schema = tools.previewProductScope.inputSchema as any;
      const result = schema.safeParse({
        scope: { type: "sku_list", skus: [] },
      });
      expect(result.success).toBe(false);
    });

    it("rejects query scope with no search parameters", () => {
      const schema = tools.previewProductScope.inputSchema as any;
      const result = schema.safeParse({
        scope: { type: "query" },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("tool registration completeness", () => {
    const expectedToolNames = [
      "listWorkspaceProducts",
      "previewProductScope",
      "getProductSnapshot",
      "inspectSourceData",
      "listImageSources",
      "searchBrands",
      "setProductFields",
      "bulkSetProductFields",
      "bulkTransformProductNames",
      "assignBrand",
      "bulkAssignBrand",
      "createBrand",
      "setStorePages",
      "bulkUpdateStorePages",
      "addStorePages",
      "removeStorePages",
      "replaceSelectedImages",
      "addSelectedImages",
      "removeSelectedImages",
      "addSourceUrl",
      "removeSource",
      "restoreSavedDraft",
      "saveDraft",
      "saveProducts",
      "approveProduct",
      "approveProducts",
      "rejectProduct",
      "rejectProducts",
    ];

    it("registers all expected tools", () => {
      const registeredToolNames = Object.keys(tools).sort();
      expect(registeredToolNames).toEqual(expectedToolNames.sort());
    });

    it("every tool has an inputSchema and description", () => {
      Object.entries(tools).forEach(([name, t]) => {
        expect(t.inputSchema).toBeDefined();
        expect(typeof (t as { description?: string }).description).toBe("string");
      });
    });
  });
});
