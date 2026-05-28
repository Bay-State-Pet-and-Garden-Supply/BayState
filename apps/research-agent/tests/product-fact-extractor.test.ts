import { describe, expect, it } from "bun:test";
import { mergePageFacts, CompositeProductFactExtractor } from "../src/pipeline/extraction/product-fact-extractor";
import type { PageFactSet } from "../src/pipeline/types";

describe("ProductFactExtractor mergePageFacts", () => {
  it("prioritizes fields based on confidence", () => {
    const highConf: PageFactSet = {
      sourceUrl: "https://example.com",
      title: "JSON-LD Title",
      description: "JSON-LD Description",
      images: ["img-jsonld.jpg"],
      categories: ["Dogs"],
      attributes: { brand: "Fromm", sku: "123" },
      evidenceSnippets: ["jsonld snippet"],
      confidence: 0.92,
    };

    const midConf: PageFactSet = {
      sourceUrl: "https://example.com",
      title: "Meta Title",
      images: ["img-meta.jpg"],
      categories: ["Pet Supplies"],
      attributes: { brand: "Fromm Meta", price: "12.99" },
      evidenceSnippets: ["meta snippet"],
      confidence: 0.78,
    };

    const merged = mergePageFacts([midConf, highConf]);

    expect(merged.confidence).toBe(0.92);
    expect(merged.title).toBe("JSON-LD Title");
    expect(merged.description).toBe("JSON-LD Description");
    expect(merged.images).toEqual(["img-jsonld.jpg", "img-meta.jpg"]);
    expect(merged.categories).toEqual(["Dogs", "Pet Supplies"]);
    expect(merged.attributes.brand).toBe("Fromm"); // JSON-LD brand preferred
    expect(merged.attributes.price).toBe("12.99"); // Mid confidence price kept
    expect(merged.attributes.sku).toBe("123");
  });

  it("dedupes image variants across extractors using canonical image URLs", () => {
    const highConf: PageFactSet = {
      sourceUrl: "https://example.com",
      images: ["https://cdn.example.com/product/front.jpg?width=1200"],
      categories: [],
      attributes: {},
      evidenceSnippets: [],
      confidence: 0.92,
    };

    const midConf: PageFactSet = {
      sourceUrl: "https://example.com",
      images: [
        "https://cdn.example.com/product/front.jpg?width=240",
        "https://cdn.example.com/product/back.jpg?width=600",
      ],
      categories: [],
      attributes: {},
      evidenceSnippets: [],
      confidence: 0.78,
    };

    const merged = mergePageFacts([midConf, highConf]);

    expect(merged.images).toHaveLength(2);
    expect(merged.images[0]).toContain("front.jpg");
    expect(merged.images[1]).toContain("back.jpg");
  });
});
