import { describe, expect, it } from "bun:test";
import {
  KnownUrlCliScraperExtractionAdapter,
} from "../src/adapters/scraper-extraction";
import type { EvaluatedCandidate } from "../src/schemas/CandidateUrl";
import type { ResolvedProductResearchInput } from "../src/schemas/ProductResearchInput";

const input: ResolvedProductResearchInput = {
  productId: "fromm-cat-purrsnick-duck-stew-3oz",
  upc: "072705113446",
  registerName: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
  brand: "Fromm",
  officialWebsiteUrl: "https://frommfamily.com",
  officialDomainResolved: "frommfamily.com",
  seedCandidateUrls: [
    {
      url: "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans/",
      sourceType: "distributor",
    },
    {
      url: "https://frommfamily.com/products/cat/purrsnickitty/can?utm_source=serp",
      sourceType: "official",
    },
    {
      url: "https://www.instagram.com/reel/DL7lJ5sO15S/",
      sourceType: "serp",
    },
  ],
};

const candidate: EvaluatedCandidate = {
  url: "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans/",
  normalizedUrl: "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans",
  normalizedDomain: "ticknersonline.drexelweb.com",
  sourceType: "serp",
  title: "PURRSNICKITTY CAT DUCK STEW 3OZ – Tickners",
  matchedTokens: ["fromm", "purrsnickitty", "duck", "stew", "3", "oz"],
  score: 0.72,
  authorityScore: 0.32,
  relevanceScore: 0.9,
  variantScore: 1,
  pathScore: 0.95,
  decision: "needs_review",
  reason: "Top candidate is promising but not decisive",
  reasons: ["Off-domain candidate: ticknersonline.drexelweb.com"],
  warnings: ["Candidate is outside official domain frommfamily.com"],
};

describe("KnownUrlCliScraperExtractionAdapter", () => {
  it("maps a successful wrapper response into evidence-backed fields", async () => {
    const adapter = new KnownUrlCliScraperExtractionAdapter({
      runner: async () => ({
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({
          status: "success",
          warnings: ["Extractor returned no product images."],
          extracted: {
            description: "Official Fromm pâté recipe.",
            images: ["https://cdn.frommfamily.com/duck.jpg"],
            categories: ["Cat Food"],
            attributes: {
              method: "json-ld",
              confidence: 0.91,
              food_form: "Wet Food",
            },
          },
          raw_result: {
            method: "json-ld",
            confidence: 0.91,
          },
        }),
      }),
    });

    const result = await adapter.extract(input, candidate);

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("Expected success");
    expect(result.extracted.description?.value).toBe("Official Fromm pâté recipe.");
    expect(result.extracted.description?.sourceType).toBe("scraper");
    expect(result.extracted.images?.value).toEqual(["https://cdn.frommfamily.com/duck.jpg"]);
    expect(result.extracted.attributes?.value).toEqual({
      method: "json-ld",
      confidence: 0.91,
      food_form: "Wet Food",
    });
    expect(result.warnings).toEqual(["Extractor returned no product images."]);
  });

  it("passes alternate candidate URLs as wrapper fallbacks", async () => {
    let parsedPayload: Record<string, unknown> | undefined;
    const adapter = new KnownUrlCliScraperExtractionAdapter({
      runner: async (payload) => {
        parsedPayload = JSON.parse(payload) as Record<string, unknown>;
        return {
          exitCode: 0,
          stderr: "",
          stdout: JSON.stringify({
            status: "success",
            extracted: {
              description: "Fallback-aware extraction result.",
            },
            raw_result: {
              method: "json-ld",
              confidence: 0.8,
            },
          }),
        };
      },
    });

    await adapter.extract(input, candidate);

    expect(parsedPayload?.fallback_urls).toEqual([
      "https://frommfamily.com/products/cat/purrsnickitty/can",
      "https://www.instagram.com/reel/DL7lJ5sO15S",
    ]);
  });

  it("parses the wrapper JSON response when crawler logs precede it on stdout", async () => {
    const adapter = new KnownUrlCliScraperExtractionAdapter({
      runner: async () => ({
        exitCode: 0,
        stderr: "",
        stdout: [
          "Crawl4AI noisy stdout log line",
          JSON.stringify({
            status: "success",
            extracted: {
              description: "Parsed from final JSON line.",
            },
            raw_result: {
              method: "json-ld",
              confidence: 0.84,
            },
          }),
        ].join("\n"),
      }),
    });

    const result = await adapter.extract(input, candidate);

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("Expected success");
    expect(result.extracted.description?.value).toBe("Parsed from final JSON line.");
  });

  it("returns a failed result when the wrapper exits non-zero", async () => {
    const adapter = new KnownUrlCliScraperExtractionAdapter({
      runner: async () => ({
        exitCode: 2,
        stderr: "wrapper stderr",
        stdout: JSON.stringify({
          status: "failed",
          error: "Soft-404 detected",
        }),
      }),
    });

    const result = await adapter.extract(input, candidate);

    expect(result.status).toBe("failed");
    if (result.status === "success") throw new Error("Expected failure");
    expect(result.reason).toBe("Soft-404 detected");
  });

  it("returns a failed result when stdout is not valid JSON", async () => {
    const adapter = new KnownUrlCliScraperExtractionAdapter({
      runner: async () => ({
        exitCode: 1,
        stderr: "wrapper stderr",
        stdout: "not-json",
      }),
    });

    const result = await adapter.extract(input, candidate);

    expect(result.status).toBe("failed");
    if (result.status === "success") throw new Error("Expected failure");
    expect(result.reason).toContain("wrapper stderr");
  });

  it("truncates noisy non-json stdout in failure reasons", async () => {
    const adapter = new KnownUrlCliScraperExtractionAdapter({
      runner: async () => ({
        exitCode: 1,
        stderr: "",
        stdout: "x".repeat(1_500),
      }),
    });

    const result = await adapter.extract(input, candidate);

    expect(result.status).toBe("failed");
    if (result.status === "success") throw new Error("Expected failure");
    expect(result.reason.length).toBeLessThan(1_250);
    expect(result.reason).toContain("truncated");
  });
});
