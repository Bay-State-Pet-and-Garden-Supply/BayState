import { describe, expect, it } from "bun:test";
import { DefaultCandidateVerifier } from "../src/pipeline/verification/candidate-verifier";
import type { EvaluatedCandidate } from "../src/schemas/CandidateUrl";
import type { PageFactSet, ProductResearchBrief } from "../src/pipeline/types";

describe("DefaultCandidateVerifier", () => {
  const context = { now: new Date() };

  const candidate: EvaluatedCandidate = {
    url: "https://example.com/product",
    sourceType: "official",
    title: "Test Product",
    normalizedUrl: "https://example.com/product",
    normalizedDomain: "example.com",
    matchedTokens: ["test", "product"],
    score: 0.8,
    authorityScore: 1.0,
    relevanceScore: 0.8,
    variantScore: 0.8,
    pathScore: 0.8,
    decision: "needs_review",
    reason: "Promising",
    reasons: [],
    warnings: [],
  };

  const brief: ProductResearchBrief = {
    input: {
      productId: "test-id",
      registerName: "Fromm Duck Stew Dog Food 12oz",
      brand: "Fromm",
      upc: "850039426636",
      officialWebsiteUrl: "https://fromm.com",
      seedCandidateUrls: [],
    },
    resolvedInput: {
      productId: "test-id",
      registerName: "Fromm Duck Stew Dog Food 12oz",
      brand: "Fromm",
      upc: "850039426636",
      officialWebsiteUrl: "https://fromm.com",
      seedCandidateUrls: [],
      officialDomainResolved: "fromm.com",
    },
    constraints: {
      requireIdentityEvidence: true,
      preferOfficialSource: true,
      allowDistributorCanonical: false,
    },
  };

  it("assigns high confidence on exact UPC match", async () => {
    const verifier = new DefaultCandidateVerifier();
    const facts: PageFactSet = {
      sourceUrl: "https://example.com/product",
      title: "Fromm Duck Stew 12oz",
      description: "This is a premium delicious duck stew formulation for your pet.",
      images: ["https://example.com/image.jpg"],
      categories: ["Dog Food"],
      attributes: {
        gtin: "850039426636",
        brand: "Fromm",
      },
      evidenceSnippets: [],
      confidence: 0.92,
    };

    const result = await verifier.verifyCandidate(candidate, facts, brief, context);
    expect(result.identityConfidence).toBe(0.98);
    expect(result.variantConfidence).toBe(1.0);
    expect(result.storefrontReadinessContribution).toBe(0.98); // (0.2 + 0.4 + 0.4) * 0.98 * 1.0 = 0.98
  });

  it("allows official-brand aliases without treating them as mismatches", async () => {
    const verifier = new DefaultCandidateVerifier();
    const aliasCandidate: EvaluatedCandidate = {
      ...candidate,
      normalizedDomain: "kohapet.com",
      sourceType: "official",
    };
    const aliasBrief: ProductResearchBrief = {
      ...brief,
      input: {
        ...brief.input,
        brand: "Koha",
        registerName: "Koha Chicken Recipe",
        officialWebsiteUrl: "https://kohapet.com",
      },
      resolvedInput: {
        ...brief.resolvedInput,
        brand: "Koha",
        registerName: "Koha Chicken Recipe",
        officialWebsiteUrl: "https://kohapet.com",
        officialDomainResolved: "kohapet.com",
      },
    };
    const facts: PageFactSet = {
      sourceUrl: "https://kohapet.com/products/chicken-recipe",
      title: "Koha Chicken Recipe",
      description: "Chicken recipe wet food.",
      images: ["https://kohapet.com/image.jpg"],
      categories: ["Dog Food"],
      attributes: {
        brand: "Kohapet",
      },
      evidenceSnippets: [],
      confidence: 0.88,
    };

    const result = await verifier.verifyCandidate(aliasCandidate, facts, aliasBrief, context);
    expect(result.warnings.some(w => w.message.includes("Brand mismatch"))).toBe(false);
  });

  it("penalizes identity confidence on brand mismatch", async () => {
    const verifier = new DefaultCandidateVerifier();
    const facts: PageFactSet = {
      sourceUrl: "https://example.com/product",
      title: "Orijen Duck Stew 12oz",
      description: "Premium food.",
      images: ["https://example.com/image.jpg"],
      categories: ["Dog Food"],
      attributes: {
        brand: "Orijen",
      },
      evidenceSnippets: [],
      confidence: 0.92,
    };

    const result = await verifier.verifyCandidate(candidate, facts, brief, context);
    expect(result.identityConfidence).toBeLessThan(0.45); // 0.8 * 0.4 + 0.1 (title overlap) = 0.42
    expect(result.warnings.some(w => w.message.includes("Brand mismatch"))).toBe(true);
  });

  it("penalizes variant confidence on low register-name descriptor overlap", async () => {
    const verifier = new DefaultCandidateVerifier();
    const facts: PageFactSet = {
      sourceUrl: "https://example.com/product",
      title: "Fromm Chicken Recipe 5lb",
      description: "Tasty chicken formulation.",
      images: ["https://example.com/image.jpg"],
      categories: ["Cat Treats"],
      attributes: {
        brand: "Fromm",
        size: "5lb",
      },
      evidenceSnippets: [],
      confidence: 0.92,
    };

    const result = await verifier.verifyCandidate(candidate, facts, brief, context);
    expect(result.variantConfidence).toBeLessThan(0.5);
    expect(result.warnings.some(w => w.message.includes("Low register-name descriptor overlap"))).toBe(true);
  });

  it("boosts official-page title overlap even when the brand token is omitted", async () => {
    const verifier = new DefaultCandidateVerifier();
    const lakeValleyCandidate: EvaluatedCandidate = {
      ...candidate,
      url: "https://lakevalleyseed.com/product/item-860-lettuce-black-seeded-simpson",
      normalizedUrl: "https://lakevalleyseed.com/product/item-860-lettuce-black-seeded-simpson",
      normalizedDomain: "lakevalleyseed.com",
      score: 0.83,
      relevanceScore: 0.83,
      variantScore: 0.76,
      pathScore: 0.9,
    };
    const lakeValleyBrief: ProductResearchBrief = {
      ...brief,
      input: {
        ...brief.input,
        brand: "Lake Valley Seed",
        registerName: "Lake Valley Seed Lettuce Organic Black Seeded Simpson Heirloom Vegetable 1.5g",
        upc: "051178008605",
        officialWebsiteUrl: "https://lakevalleyseed.com",
      },
      resolvedInput: {
        ...brief.resolvedInput,
        brand: "Lake Valley Seed",
        registerName: "Lake Valley Seed Lettuce Organic Black Seeded Simpson Heirloom Vegetable 1.5g",
        upc: "051178008605",
        officialWebsiteUrl: "https://lakevalleyseed.com",
        officialDomainResolved: "lakevalleyseed.com",
      },
    };
    const facts: PageFactSet = {
      sourceUrl: lakeValleyCandidate.url,
      title: "Lettuce Black Seeded Simpson Organic",
      description: "Organic heirloom lettuce seed variety for gardens.",
      images: ["https://lakevalleyseed.com/image.jpg"],
      categories: ["Vegetable Seeds"],
      attributes: {},
      evidenceSnippets: [],
      confidence: 0.88,
    };

    const result = await verifier.verifyCandidate(lakeValleyCandidate, facts, lakeValleyBrief, context);
    expect(result.identityConfidence).toBeGreaterThan(0.9);
    expect(result.warnings.some(w => w.message.includes("Brand mismatch"))).toBe(false);
  });
});
