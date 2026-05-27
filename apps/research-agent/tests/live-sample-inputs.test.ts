import { describe, expect, it } from "bun:test";
import {
  buildLiveSampleQuery,
  classifyCandidateSourceType,
  mapRowsToProductResearchInputs,
} from "../src/live/sample-inputs";

describe("live sample input mapping", () => {
  it("classifies official and off-domain candidates", () => {
    expect(
      classifyCandidateSourceType(
        "https://frommfamily.com/products/cat/purrsnickitty/can",
        ["frommfamily.com"],
      ),
    ).toBe("official");
    expect(
      classifyCandidateSourceType(
        "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans",
        ["frommfamily.com"],
      ),
    ).toBe("distributor");
    expect(
      classifyCandidateSourceType(
        "https://www.instagram.com/reel/DL7lJ5sO15S/",
        ["frommfamily.com"],
      ),
    ).toBe("serp");
  });

  it("maps and dedupes candidate URLs while ignoring invalid rows", () => {
    const result = mapRowsToProductResearchInputs([
      {
        upc: "072705113446",
        brand_name: "Fromm",
        product_name: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
        predicted_name: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
        official_domains: ["https://frommfamily.com/products/"],
        preferred_domains: [],
        url: "https://frommfamily.com/products/cat/purrsnickitty/can?utm_source=test",
        normalized_domain: "frommfamily.com",
        rank: 1,
        selection_status: "candidate",
        title: "PurrSnickitty - Wet Food for Cats",
        snippet: "Fromm wet cat food landing page.",
        candidate_source: "serper",
      },
      {
        upc: "072705113446",
        brand_name: "Fromm",
        product_name: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
        predicted_name: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
        official_domains: ["https://frommfamily.com/products/"],
        preferred_domains: [],
        url: "https://frommfamily.com/products/cat/purrsnickitty/can",
        normalized_domain: "frommfamily.com",
        rank: 2,
        selection_status: "candidate",
        title: "Duplicate official candidate",
        snippet: "Duplicate row",
        candidate_source: "serper",
      },
      {
        upc: "072705113446",
        brand_name: "Fromm",
        product_name: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
        predicted_name: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
        official_domains: ["https://frommfamily.com/products/"],
        preferred_domains: [],
        url: "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans/",
        normalized_domain: "ticknersonline.drexelweb.com",
        rank: 3,
        selection_status: "candidate",
        title: "PURRSNICKITTY CAT DUCK STEW 3OZ – Tickners",
        snippet: "SKU: 072705113446",
        candidate_source: "serper",
      },
      {
        upc: "072705113446",
        brand_name: "Fromm",
        product_name: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
        predicted_name: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
        official_domains: ["https://frommfamily.com/products/"],
        preferred_domains: [],
        url: "bad url with spaces",
        normalized_domain: null,
        rank: 4,
        selection_status: "candidate",
        title: "Broken row",
        snippet: null,
        candidate_source: "serper",
      },
    ]);

    expect(result.inputs).toHaveLength(1);
    expect(result.inputs[0]?.candidateUrls).toHaveLength(2);
    expect(result.inputs[0]?.candidateUrls[0]?.sourceType).toBe("official");
    expect(result.inputs[0]?.candidateUrls[1]?.sourceType).toBe("distributor");
    expect(result.warnings.some((warning) => warning.reason.includes("Ignored invalid candidate URL"))).toBe(true);
  });

  it("builds a linked Supabase query with filters", () => {
    const sql = buildLiveSampleQuery({ limit: 3, upc: "072705113446", brand: "Fromm" });
    expect(sql).toContain("limit 3");
    expect(sql).toContain("c.upc = '072705113446'");
    expect(sql).toContain("b.name ilike '%Fromm%'");
  });
});
