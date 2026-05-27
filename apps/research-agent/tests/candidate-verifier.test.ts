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
      expectedAttributes: {
        size: "12oz",
        flavor: "Duck",
      },
      candidateUrls: [],
    },
    resolvedInput: {
      productId: "test-id",
      registerName: "Fromm Duck Stew Dog Food 12oz",
      brand: "Fromm",
      upc: "850039426636",
      expectedAttributes: {
        size: "12oz",
        flavor: "Duck",
      },
      candidateUrls: [],
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

  it("penalizes variant confidence on size/flavor mismatch", async () => {
    const verifier = new DefaultCandidateVerifier();
    const facts: PageFactSet = {
      sourceUrl: "https://example.com/product",
      title: "Fromm Chicken Stew 5oz",
      description: "Tasty chicken formulation.",
      images: ["https://example.com/image.jpg"],
      categories: ["Dog Food"],
      attributes: {
        brand: "Fromm",
        size: "5oz",
      },
      evidenceSnippets: [],
      confidence: 0.92,
    };

    const result = await verifier.verifyCandidate(candidate, facts, brief, context);
    expect(result.variantConfidence).toBeLessThan(0.5); // Starts at 1, drops for both size and flavor mismatch
    expect(result.warnings.some(w => w.message.includes("Size mismatch"))).toBe(true);
    expect(result.warnings.some(w => w.message.includes("Flavor mismatch"))).toBe(true);
  });
});
