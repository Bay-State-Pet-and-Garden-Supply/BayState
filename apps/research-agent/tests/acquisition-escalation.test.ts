import { describe, expect, it } from "bun:test";
import { shouldEscalateToBrowser, isNonProductAssetUrl } from "../src/pipeline/acquisition/acquisition-escalation";
import type { EvaluatedCandidate } from "../src/schemas/CandidateUrl";
import type { ProductResearchBrief, AcquiredPage, PageFactSet } from "../src/pipeline/types";

const candidate: EvaluatedCandidate = {
  url: "https://example.com/products/test-product",
  normalizedUrl: "https://example.com/products/test-product",
  normalizedDomain: "example.com",
  sourceType: "official",
  title: "Test Product",
  snippet: "Official product page",
  matchedTokens: ["test", "product"],
  score: 0.82,
  authorityScore: 1,
  relevanceScore: 0.8,
  variantScore: 0.8,
  pathScore: 0.9,
  decision: "needs_review",
  reason: "Promising",
  reasons: ["Official-domain match"],
  warnings: [],
};

const brief: ProductResearchBrief = {
  input: {
    productId: "test-product",
    upc: "012345678905",
    registerName: "Test Product Duck Stew 3 oz",
    brand: "Test Brand",
    officialWebsiteUrl: "https://example.com",
    seedCandidateUrls: [],
  },
  resolvedInput: {
    productId: "test-product",
    upc: "012345678905",
    registerName: "Test Product Duck Stew 3 oz",
    brand: "Test Brand",
    officialWebsiteUrl: "https://example.com",
    officialDomainResolved: "example.com",
    seedCandidateUrls: [],
  },
  constraints: {
    requireIdentityEvidence: true,
    preferOfficialSource: true,
    allowDistributorCanonical: false,
  },
};

function makePage(overrides: Partial<AcquiredPage> = {}): AcquiredPage {
  return {
    url: candidate.url,
    finalUrl: candidate.url,
    statusCode: 200,
    fetchedAt: new Date().toISOString(),
    title: "Test Product",
    html: "<html><title>Test Product</title><body>Product page</body></html>",
    text: "Test Product page body",
    metadata: { engine: "http" },
    ...overrides,
  };
}

function makeFacts(overrides: Partial<PageFactSet> = {}): PageFactSet {
  return {
    sourceUrl: candidate.url,
    title: "Test Product Duck Stew 3 oz",
    description: "A strong product description for the candidate page.",
    images: ["https://example.com/image.jpg"],
    categories: ["Cat Food"],
    attributes: { gtin12: "012345678905" },
    evidenceSnippets: ["UPC 012345678905 found in JSON-LD"],
    confidence: 0.9,
    ...overrides,
  };
}

describe("acquisition escalation heuristics", () => {
  it("escalates when the page looks like a bot challenge", () => {
    const decision = shouldEscalateToBrowser(
      candidate,
      makePage({ title: "Just a moment...", text: "Checking your browser before accessing the site." }),
      makeFacts({ confidence: 0.1, description: undefined, images: [], attributes: {} }),
      brief,
      { usedEscalations: 0 },
    );

    expect(decision.shouldEscalate).toBe(true);
    expect(decision.reasons.some((reason) => reason.startsWith("blocked-page-signal"))).toBe(true);
  });

  it("escalates when extracted facts are too weak", () => {
    const decision = shouldEscalateToBrowser(
      candidate,
      makePage(),
      makeFacts({ confidence: 0.2, description: undefined, images: [], attributes: {} }),
      brief,
      { usedEscalations: 0 },
    );

    expect(decision.shouldEscalate).toBe(true);
    expect(decision.reasons).toContain("facts-lack-core-fields");
  });

  it("does not escalate when HTTP evidence is already strong", () => {
    const decision = shouldEscalateToBrowser(candidate, makePage(), makeFacts(), brief, { usedEscalations: 0 });
    expect(decision.shouldEscalate).toBe(false);
  });

  it("does not escalate for obvious non-product asset URLs", () => {
    const assetCandidate = {
      ...candidate,
      url: "https://example.com/catalog/product-sheet.pdf",
      normalizedUrl: "https://example.com/catalog/product-sheet.pdf",
    };

    expect(isNonProductAssetUrl(assetCandidate.url)).toBe(true);
    const decision = shouldEscalateToBrowser(assetCandidate, makePage({ url: assetCandidate.url }), undefined, brief, {
      usedEscalations: 0,
    });
    expect(decision.shouldEscalate).toBe(false);
  });
});
