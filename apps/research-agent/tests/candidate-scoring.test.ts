import { describe, expect, it } from "bun:test";
import {
  dedupeCandidates,
  evaluateCandidate,
  rankCandidates,
  resolveInput,
} from "../src/lib/candidate-scoring";
import type { ProductResearchInput } from "../src/schemas/ProductResearchInput";

const baseInput: ProductResearchInput = {
  productId: "fromm-cat-purrsnick-duck-stew-3oz",
  upc: "072705113446",
  registerName: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
  brand: "Fromm",
  officialWebsiteUrl: "https://frommfamily.com",
  seedCandidateUrls: [],
};

describe("candidate scoring", () => {
  it("prefers a specific product-style SERP result over a social result", () => {
    const resolvedInput = resolveInput(baseInput);
    const ranked = rankCandidates(resolvedInput, [
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
    ]);

    expect(ranked[0]?.normalizedDomain).toBe("ticknersonline.drexelweb.com");
    expect(ranked[0]?.decision).toBe("needs_review");
    expect(ranked[1]?.decision).toBe("rejected");
  });

  it("penalizes social and marketplace pages from real SERP candidates", () => {
    const resolvedInput = resolveInput(baseInput);
    const productCandidate = evaluateCandidate(resolvedInput, {
      url: "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans/",
      sourceType: "serp",
      title: "PURRSNICKITTY CAT DUCK STEW 3OZ – Tickners",
      snippet:
        "SKU: 072705113446 Categories: CAT CANS, CAT/KITTEN Brand: FROMM FAMILY FO. Description. 12/3OZ PURRSNICK DUCK STEW.",
    });

    const socialCandidate = evaluateCandidate(resolvedInput, {
      url: "https://www.instagram.com/reel/DL7lJ5sO15S/",
      sourceType: "serp",
      title: "New Fromm PurrSnickitty Cat Food Has Arrived ... - Instagram",
      snippet: "... DUCK STEW ... 3 OZ ...",
    });

    const marketplaceCandidate = evaluateCandidate(resolvedInput, {
      url: "https://www.walmart.com/ip/Heyco-Combination-Wrench-Metric-16mm/977500469",
      sourceType: "serp",
      title: "Heyco Combination Wrench, Metric - 16mm - Walmart.com",
      snippet: "Buy Heyco Combination Wrench, Metric - 16mm at Walmart.com.",
    });

    expect(productCandidate.score).toBeGreaterThan(socialCandidate.score);
    expect(socialCandidate.score).toBeGreaterThan(marketplaceCandidate.score);
    expect(socialCandidate.warnings.some((warning) => warning.includes("low-signal social domain"))).toBe(true);
    expect(marketplaceCandidate.warnings.some((warning) => warning.includes("marketplace-like domain"))).toBe(true);
  });

  it("marks near ties for review instead of auto-selecting", () => {
    const resolvedInput = resolveInput(baseInput);
    const ranked = rankCandidates(resolvedInput, [
      {
        url: "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans/",
        sourceType: "serp",
        title: "PURRSNICKITTY CAT DUCK STEW 3OZ – Tickners",
        snippet:
          "SKU: 072705113446 Categories: CAT CANS, CAT/KITTEN Brand: FROMM FAMILY FO. Description. 12/3OZ PURRSNICK DUCK STEW.",
      },
      {
        url: "https://frommfamily.com/products/cat/purrsnickitty/can",
        sourceType: "serp",
        title: "PurrSnickitty - Wet Food for Cats",
        snippet: "Fromm Family Foods PurrSnickitty wet cat food landing page.",
      },
    ]);

    expect(ranked[0]?.decision).toBe("needs_review");
    expect(ranked[1]?.decision).toBe("needs_review");
  });

  it("deduplicates candidates by normalized URL", () => {
    const deduped = dedupeCandidates([
      {
        url: "https://frommfamily.com/products/cat/purrsnickitty/can?utm_source=test",
        sourceType: "serp",
        title: "PurrSnickitty - Wet Food for Cats",
      },
      {
        url: "https://frommfamily.com/products/cat/purrsnickitty/can",
        sourceType: "official",
      },
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.sourceType).toBe("official");
    expect(deduped[0]?.title).toBe("PurrSnickitty - Wet Food for Cats");
  });
});
