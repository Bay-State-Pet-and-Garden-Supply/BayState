import { describe, expect, it } from "bun:test";
import { assembleStorefrontProductDraft } from "../src/pipeline/storefront-assembly";
import { runProductResearch } from "../src/research/runProductResearch";
import { storefrontProductDraftSchema } from "../src/schemas/StorefrontProduct";

const input = {
  productId: "dr-marty-sensitivity-select-80oz",
  upc: "850039426636",
  registerName: "Dr. Marty Nature's Blend Sensitivity Select Freeze Dried Dog Food 80 oz",
  brand: "Dr. Marty",
  expectedAttributes: {
    size: "80 oz",
    variant: "Sensitivity Select",
  },
  candidateUrls: [
    {
      url: "https://www.petguys.com/dr-marty-natures-blend-sensitivity-select-freeze-dried-dog-food-80oz.html",
      sourceType: "input" as const,
      title: "Dr. Marty Nature's Blend Sensitivity Select Freeze Dried Dog Food 80oz",
      snippet: "Item #: 850039426636. Sale: $149.99.",
    },
  ],
};

describe("assembleStorefrontProductDraft", () => {
  it("assembles a storefront-ready draft from a completed research report", async () => {
    const report = await runProductResearch(input, {
      now: new Date("2026-05-27T01:00:00.000Z"),
      runId: "storefront-test-run",
      extractionAdapter: {
        async extract() {
          return {
            status: "success",
            extracted: {
              description: {
                value: "A freeze-dried dog food for sensitive pups.",
                confidence: 0.9,
                sourceType: "scraper",
                sourceUrl:
                  "https://www.petguys.com/dr-marty-natures-blend-sensitivity-select-freeze-dried-dog-food-80oz.html",
                evidence: "Extracted from the product detail page.",
              },
              images: {
                value: ["https://cdn.example.test/dr-marty.jpg"],
                confidence: 0.85,
                sourceType: "scraper",
                sourceUrl:
                  "https://www.petguys.com/dr-marty-natures-blend-sensitivity-select-freeze-dried-dog-food-80oz.html",
                evidence: "Primary image from product page.",
              },
              categories: {
                value: ["Dog Food"],
                confidence: 0.8,
                sourceType: "scraper",
                sourceUrl:
                  "https://www.petguys.com/dr-marty-natures-blend-sensitivity-select-freeze-dried-dog-food-80oz.html",
                evidence: "Breadcrumb category.",
              },
            },
          };
        },
      },
    });

    const draft = assembleStorefrontProductDraft(report, {
      generatedAt: new Date("2026-05-27T01:01:00.000Z"),
    });

    expect(draft.readiness.status).toBe("ready");
    expect(draft.identity.title.value).toBe(input.registerName);
    expect(draft.listing.handle).toBe("dr-marty-nature-s-blend-sensitivity-select-freeze-dried-dog-food-80-oz");
    expect(draft.media.images[0]?.url).toBe("https://cdn.example.test/dr-marty.jpg");
    expect(draft.variants[0]?.barcode).toBe("850039426636");
    expect(storefrontProductDraftSchema.parse(draft)).toEqual(draft);
  });
});
