import { describe, expect, it } from "bun:test";
import { runProductResearchPipeline } from "../src/pipeline/runProductResearchPipeline";
import type { ProductResearchPipelinePorts } from "../src/pipeline/ports";

const input = {
  productId: "test-product",
  upc: "012345678905",
  registerName: "Test Product Duck Stew 3 oz",
  brand: "Test Brand",
  officialWebsiteUrl: "https://testbrand.com/products/test-product",
  seedCandidateUrls: [],
};

function createPorts(options?: {
  httpTitle?: string;
  httpText?: string;
  fallbackTitle?: string;
  fallbackText?: string;
  fallbackFacts?: boolean;
}) {
  let fallbackCalls = 0;

  const ports: ProductResearchPipelinePorts = {
    briefBuilder: {
      async buildBrief(rawInput) {
        return {
          input: rawInput,
          resolvedInput: {
            ...rawInput,
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
        async discoverCandidates() {
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
          title: options?.httpTitle ?? "Test Product Title",
          html: `<html><body>${options?.httpText ?? "Test Product Description"}</body></html>`,
          text: options?.httpText ?? "Test Product Description",
          metadata: { engine: "http" },
        };
      },
    },
    fallbackPageAcquisition: {
      async acquirePage(url) {
        fallbackCalls += 1;
        return {
          url,
          finalUrl: url,
          fetchedAt: new Date().toISOString(),
          title: options?.fallbackTitle ?? "Rendered Test Product Title",
          html: `<html><body>${options?.fallbackText ?? "Rendered product description with UPC 012345678905"}</body></html>`,
          text: options?.fallbackText ?? "Rendered product description with UPC 012345678905",
          metadata: { engine: "agent-browser" },
        };
      },
    },
    factExtractors: [
      {
        async extractFacts(page) {
          const usingFallback = page.metadata.engine === "agent-browser";
          if (usingFallback || options?.fallbackFacts) {
            return {
              sourceUrl: page.url,
              title: "Test Product Duck Stew 3 oz",
              description: "Extracted Description of the product",
              images: ["https://testbrand.com/img.jpg"],
              categories: ["Category A"],
              attributes: { brand: "Test Brand", gtin12: "012345678905" },
              evidenceSnippets: ["Extracted via mock"],
              confidence: 0.9,
            };
          }

          return {
            sourceUrl: page.url,
            title: options?.httpTitle ?? "Just a moment...",
            description: undefined,
            images: [],
            categories: [],
            attributes: {},
            evidenceSnippets: [],
            confidence: 0.1,
          };
        },
      },
    ],
    verifier: {
      async verifyCandidate(candidate, facts) {
        const strong = Boolean(facts?.attributes.gtin12);
        return {
          candidate: {
            ...candidate,
            normalizedUrl: candidate.url,
            normalizedDomain: "testbrand.com",
            matchedTokens: ["test"],
            score: strong ? 0.95 : 0.45,
            authorityScore: 1.0,
            relevanceScore: strong ? 0.95 : 0.45,
            variantScore: strong ? 0.9 : 0.2,
            pathScore: 0.9,
            decision: strong ? "selected" : "rejected",
            reason: strong ? "Promising" : "Weak",
            reasons: [],
            warnings: [],
          },
          facts,
          identityConfidence: strong ? 0.95 : 0.45,
          variantConfidence: strong ? 0.9 : 0.2,
          storefrontReadinessContribution: strong ? 0.9 : 0.1,
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

  return { ports, getFallbackCalls: () => fallbackCalls };
}

describe("runProductResearchPipeline", () => {
  it("orchestrates the pipeline successfully", async () => {
    const { ports } = createPorts({ fallbackFacts: true });

    const result = await runProductResearchPipeline(input, ports, {
      now: new Date("2026-05-27T00:00:00Z"),
      runId: "run-test-id",
    });

    expect(result.report.runId).toBe("run-test-id");
    expect(result.report.status).toBe("completed");
    expect(result.report.selectedCanonicalUrl).toBe("https://testbrand.com/products/test-product");
    expect(result.storefrontProduct?.listing.handle).toBe("test-product-title");
  });

  it("uses browser fallback when HTTP evidence is blocked or weak", async () => {
    const { ports, getFallbackCalls } = createPorts({
      httpTitle: "Just a moment...",
      httpText: "Checking your browser before accessing the site.",
      fallbackTitle: "Test Product Title",
      fallbackText: "Rendered product description with UPC 012345678905 and image gallery.",
    });

    const result = await runProductResearchPipeline(input, ports, {
      now: new Date("2026-05-27T00:00:00Z"),
      runId: "run-fallback-id",
    });

    expect(getFallbackCalls()).toBe(1);
    expect(result.report.status).toBe("completed");
    expect(result.report.extracted.description?.value).toBe("Extracted Description of the product");
    expect(result.report.warnings.some((warning) => warning.includes("Escalating to browser-backed acquisition"))).toBe(true);
  });

  it("does not use browser fallback when HTTP evidence is already strong", async () => {
    const { ports, getFallbackCalls } = createPorts({ fallbackFacts: true });

    const result = await runProductResearchPipeline(input, ports, {
      now: new Date("2026-05-27T00:00:00Z"),
      runId: "run-http-only-id",
    });

    expect(getFallbackCalls()).toBe(0);
    expect(result.report.status).toBe("completed");
  });
});
