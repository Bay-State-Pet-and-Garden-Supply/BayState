import { describe, expect, it } from "bun:test";
import { runProductResearchPipeline } from "../src/pipeline/runProductResearchPipeline";
import type { ProductResearchPipelinePorts } from "../src/pipeline/ports";

describe("runProductResearchPipeline", () => {
  const mockPorts: ProductResearchPipelinePorts = {
    briefBuilder: {
      async buildBrief(input) {
        return {
          input,
          resolvedInput: {
            ...input,
            officialDomainResolved: "testbrand.com",
          },
          constraints: {
            requireIdentityEvidence: true,
            preferOfficialSource: true,
            allowDistributorCanonical: false,
          },
        };
      },
    },
    discoveryProviders: [
      {
        async discoverCandidates(brief) {
          return {
            candidates: [
              {
                url: "https://testbrand.com/products/test-product",
                sourceType: "official",
              },
            ],
            warnings: [],
          };
        },
      },
    ],
    pageAcquisition: {
      async acquirePage(url) {
        return {
          url,
          finalUrl: url,
          fetchedAt: new Date().toISOString(),
          title: "Test Product Title",
          html: "<html><body>Test Product Description</body></html>",
          text: "Test Product Description",
          metadata: {},
        };
      },
    },
    factExtractors: [
      {
        async extractFacts(page) {
          return {
            sourceUrl: page.url,
            title: "Extracted Title",
            description: "Extracted Description of the product",
            images: ["https://testbrand.com/img.jpg"],
            categories: ["Category A"],
            attributes: { brand: "Test Brand", sku: "SKU1" },
            evidenceSnippets: ["Extracted via mock"],
            confidence: 0.9,
          };
        },
      },
    ],
    verifier: {
      async verifyCandidate(candidate, facts) {
        return {
          candidate: {
            ...candidate,
            normalizedUrl: candidate.url,
            normalizedDomain: "testbrand.com",
            matchedTokens: ["test"],
            score: 0.9,
            authorityScore: 1.0,
            relevanceScore: 0.9,
            variantScore: 0.9,
            pathScore: 0.9,
            decision: "selected",
            reason: "Promising",
            reasons: [],
            warnings: [],
          },
          facts,
          identityConfidence: 0.95,
          variantConfidence: 0.9,
          storefrontReadinessContribution: 0.9,
          warnings: [],
        };
      },
    },
    assembler: {
      async assembleStorefrontProduct(report) {
        return {
          id: report.runId,
          readiness: { status: "ready", missingFields: [] },
          identity: { title: { value: "Test Product Title", confidence: 0.9, sourceType: "input", evidence: "" } },
          listing: { handle: "test-product-title" },
          media: { images: [] },
          variants: [],
          provenance: { generatedAt: new Date().toISOString(), runId: report.runId, confidence: 0.9, sources: [] },
        } as any;
      },
    },
  };

  it("orchestrates the pipeline successfully", async () => {
    const input = {
      productId: "test-product",
      registerName: "Test Product Title",
      brand: "Test Brand",
      officialWebsiteUrl: "https://testbrand.com/products/test-product",
      candidateUrls: [],
    };

    const result = await runProductResearchPipeline(input, mockPorts, {
      now: new Date("2026-05-27T00:00:00Z"),
      runId: "run-test-id",
    });

    expect(result.report.runId).toBe("run-test-id");
    expect(result.report.status).toBe("completed");
    expect(result.report.selectedCanonicalUrl).toBe("https://testbrand.com/products/test-product");
    expect(result.storefrontProduct?.listing.handle).toBe("test-product-title");
  });
});
