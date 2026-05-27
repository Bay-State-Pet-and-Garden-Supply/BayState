import { describe, expect, it } from "bun:test";
import { runProductResearch } from "../src/research/runProductResearch";
import { productResearchReportSchema } from "../src/schemas/ProductResearchReport";

const exampleInput = {
  productId: "fromm-cat-purrsnick-duck-stew-3oz",
  upc: "072705113446",
  registerName: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
  brand: "Fromm",
  officialWebsiteUrl: "https://frommfamily.com",
  expectedAttributes: {
    size: "3 oz",
    flavor: "Duck",
    variant: "Stew",
  },
  candidateUrls: [
    {
      url: "https://frommfamily.com/products/cat/purrsnickitty/can",
      sourceType: "serp",
      title: "PurrSnickitty - Wet Food for Cats",
      snippet: "Fromm Family Foods PurrSnickitty wet cat food landing page.",
    },
    {
      url: "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans/",
      sourceType: "serp",
      title: "PURRSNICKITTY CAT DUCK STEW 3OZ – Tickners",
      snippet:
        "SKU: 072705113446 Categories: CAT CANS, CAT/KITTEN Brand: FROMM FAMILY FO. Description. 12/3OZ PURRSNICK DUCK STEW.",
    },
    {
      url: "https://www.instagram.com/reel/DL7lJ5sO15S/",
      sourceType: "serp",
      title: "New Fromm PurrSnickitty Cat Food Has Arrived ... - Instagram",
      snippet: "... DUCK STEW ... 3 OZ ...",
    },
  ],
};

const selectedKnownUrlInput = {
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
      sourceType: "input",
      title: "Dr. Marty Nature's Blend Sensitivity Select Freeze Dried Dog Food 80oz",
      snippet: "Item #: 850039426636. Sale: $149.99.",
    },
  ],
};

describe("runProductResearch", () => {
  it("returns a schema-valid report with warnings for unavailable extraction", async () => {
    const report = await runProductResearch(exampleInput, {
      now: new Date("2026-05-26T20:30:00.000Z"),
      runId: "test-run",
    });

    expect(report.runId).toBe("test-run");
    expect(report.selectedCanonicalUrl).toBeUndefined();
    expect(report.candidates[0]?.decision).toBe("needs_review");
    expect(report.warnings.some((warning) => warning.includes("No scraper-side known-URL extraction wrapper"))).toBe(false);
    expect(report.nextActions).toContain(
      "Review the top candidate URLs before accepting a canonical product page.",
    );
    expect(productResearchReportSchema.parse(report)).toEqual(report);
  });

  it("returns completed when scraper extraction succeeds", async () => {
    const report = await runProductResearch(selectedKnownUrlInput, {
      extractionAdapter: {
        async extract() {
          return {
            status: "success",
            extracted: {
              description: {
                value: "Freeze-dried sensitivity-select dog food product page.",
                confidence: 0.91,
                sourceType: "scraper",
                sourceUrl:
                  "https://www.petguys.com/dr-marty-natures-blend-sensitivity-select-freeze-dried-dog-food-80oz.html",
                evidence: "Extracted via scraper wrapper.",
              },
            },
          };
        },
      },
    });

    expect(report.status).toBe("completed");
    expect(report.extracted.description?.value).toBe("Freeze-dried sensitivity-select dog food product page.");
    expect(report.nextActions).toContain(
      "Promote the stabilized report schema into packages/api before coordinator integration.",
    );
  });

  it("returns needs_more_candidates when no URLs are provided", async () => {
    const report = await runProductResearch({
      ...exampleInput,
      candidateUrls: [],
    });

    expect(report.status).toBe("needs_more_candidates");
    expect(report.selectedCanonicalUrl).toBeUndefined();
    expect(report.nextActions).toContain(
      "Provide candidate URLs or add sitemap/SERP discovery adapters.",
    );
  });
});
