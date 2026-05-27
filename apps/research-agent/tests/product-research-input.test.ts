import { describe, expect, it } from "bun:test";
import { productResearchInputSchema } from "../src/schemas/ProductResearchInput";

describe("productResearchInputSchema", () => {
  it("requires UPC as the uploaded identity anchor", () => {
    expect(() =>
      productResearchInputSchema.parse({
        productId: "fromm-cat-purrsnick-duck-stew-3oz",
        registerName: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
        brand: "Fromm",
        officialWebsiteUrl: "https://frommfamily.com",
      }),
    ).toThrow();
  });

  it("requires an official brand domain or website URL for discovery", () => {
    expect(() =>
      productResearchInputSchema.parse({
        productId: "fromm-cat-purrsnick-duck-stew-3oz",
        upc: "072705113446",
        registerName: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
        brand: "Fromm",
      }),
    ).toThrow("official brand domain");
  });

  it("maps legacy candidateUrls to optional seedCandidateUrls without preserving phantom attributes", () => {
    const parsed = productResearchInputSchema.parse({
      productId: "fromm-cat-purrsnick-duck-stew-3oz",
      upc: "072705113446",
      registerName: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
      brand: "Fromm",
      officialWebsiteUrl: "https://frommfamily.com",
      expectedAttributes: {
        size: "3 oz",
        flavor: "Duck",
      },
      candidateUrls: [
        {
          url: "https://frommfamily.com/products/cat/purrsnickitty/can",
          sourceType: "official",
        },
      ],
    });

    expect(parsed.seedCandidateUrls).toHaveLength(1);
    expect("candidateUrls" in parsed).toBe(false);
    expect("expectedAttributes" in parsed).toBe(false);
  });
});
