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

  it("prefers a safe official product page over a stronger off-domain corroborating match", async () => {
    const officialCanonicalUrl = "https://lakevalleyseed.com/product/item-860-lettuce-black-seeded-simpson";
    const corroboratingUrl = "https://www.esbenshades.com/seeds-bulbs/lake-valley-seed-lettuce-organic-black-seeded-simpson-heirloom-vegetable-1-5g";
    const lakeValleyInput = {
      productId: "lake-valley-860",
      upc: "051178008605",
      registerName: "Lake Valley Seed Lettuce Organic Black Seeded Simpson Heirloom Vegetable 1.5g",
      brand: "Lake Valley Seed",
      officialWebsiteUrl: "https://lakevalleyseed.com",
      seedCandidateUrls: [],
    };

    const ports: ProductResearchPipelinePorts = {
      briefBuilder: {
        async buildBrief(rawInput) {
          return {
            input: rawInput,
            resolvedInput: {
              ...rawInput,
              officialDomainResolved: "lakevalleyseed.com",
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
                  url: officialCanonicalUrl,
                  sourceType: "official",
                  title: "Lettuce Black Seeded Simpson Organic",
                },
                {
                  url: corroboratingUrl,
                  sourceType: "serp",
                  title: "Lake Valley Seed Lettuce Organic Black Seeded Simpson Heirloom Vegetable 1.5g",
                  snippet: "UPC 051178008605",
                },
              ],
              warnings: [],
            };
          },
        },
      ],
      pageAcquisition: {
        async acquirePage(url) {
          const official = url === officialCanonicalUrl;
          const text = official
            ? "Organic heirloom lettuce seed variety. Product detail page without UPC or explicit brand field."
            : "Distributor listing with UPC 051178008605 and Lake Valley Seed brand field.";
          return {
            url,
            finalUrl: url,
            fetchedAt: new Date().toISOString(),
            title: official
              ? "Lettuce Black Seeded Simpson Organic"
              : "Lake Valley Seed Lettuce Organic Black Seeded Simpson Heirloom Vegetable 1.5g",
            html: `<html><body>${text}</body></html>`,
            text,
            metadata: { engine: "http" },
          };
        },
      },
      factExtractors: [
        {
          async extractFacts(page) {
            if (page.url === officialCanonicalUrl) {
              return {
                sourceUrl: page.url,
                title: "Lettuce Black Seeded Simpson Organic",
                description: "Organic heirloom lettuce seed variety for gardens.",
                images: ["https://lakevalleyseed.com/img.jpg"],
                categories: ["Vegetable Seeds"],
                attributes: {},
                evidenceSnippets: ["Official product page"],
                confidence: 0.9,
              };
            }

            return {
              sourceUrl: page.url,
              title: "Lake Valley Seed Lettuce Organic Black Seeded Simpson Heirloom Vegetable 1.5g",
              description: "Distributor listing with UPC 051178008605.",
              images: ["https://www.esbenshades.com/img.jpg"],
              categories: ["Seeds"],
              attributes: { brand: "Lake Valley Seed", gtin12: "051178008605" },
              evidenceSnippets: ["Distributor product page"],
              confidence: 0.92,
            };
          },
        },
      ],
      verifier: {
        async verifyCandidate(candidate, facts) {
          const official = candidate.normalizedUrl === officialCanonicalUrl;
          const identityConfidence = official ? 0.82 : 0.98;
          const variantConfidence = official ? 0.76 : 1.0;

          return {
            candidate: {
              ...candidate,
              score: Number((identityConfidence * 0.6 + variantConfidence * 0.4).toFixed(4)),
              relevanceScore: identityConfidence,
              variantScore: variantConfidence,
              decision: official ? "needs_review" : "selected",
              reason: official ? "Official page matched but lacks UPC corroboration" : "Exact UPC corroboration",
              warnings: candidate.warnings,
            },
            facts,
            identityConfidence,
            variantConfidence,
            storefrontReadinessContribution: official ? 0.72 : 0.94,
            warnings: official
              ? [
                  {
                    stage: "verification",
                    message: "UPC not found in extracted facts for uploaded anchor 051178008605",
                    url: candidate.url,
                  },
                ]
              : [],
          };
        },
      },
      assembler: {
        async assembleStorefrontProduct(report) {
          return {
            id: report.runId,
            readiness: { status: "ready", missingFields: [] },
            identity: { title: { value: "Lake Valley Seed Lettuce", confidence: 0.9, sourceType: "input", evidence: "" } },
            listing: { handle: "lake-valley-seed-lettuce" },
            media: { images: [] },
            variants: [],
            provenance: { generatedAt: new Date().toISOString(), runId: report.runId, confidence: 0.9, sources: [] },
          } as any;
        },
      },
    };

    const result = await runProductResearchPipeline(lakeValleyInput, ports, {
      now: new Date("2026-05-27T00:00:00Z"),
      runId: "run-official-preferred-id",
    });

    expect(result.report.status).toBe("completed");
    expect(result.report.selectedCanonicalUrl).toBe(officialCanonicalUrl);
    expect(result.report.candidates[0]?.normalizedUrl).toBe(officialCanonicalUrl);
    expect(result.report.candidates[0]?.decision).toBe("selected");
    expect(result.report.candidates[0]?.reason).toContain("Promoted safe official product page");

    const corroboratingCandidate = result.report.candidates.find((candidate) => candidate.normalizedUrl === corroboratingUrl);
    expect(corroboratingCandidate?.decision).toBe("needs_review");
    expect(corroboratingCandidate?.reason).toContain("corroboration");
  });

  it("does not promote an unverified official candidate over corroborated evidence", async () => {
    const offDomainUrl = "https://www.esbenshades.com/seeds-bulbs/lake-valley-seed-lettuce-organic-black-seeded-simpson-heirloom-vegetable-1-5g";
    const unverifiedOfficialUrl = "https://lakevalleyseed.com/product/item-3930-lettuce-grand-rapids";
    const processedOfficialUrls = [
      "https://lakevalleyseed.com/product/item-170-lettuce-bibb",
      "https://lakevalleyseed.com/product/item-4059-lettuce-buttercrunch",
      "https://lakevalleyseed.com/product/item-4183-kale-red-russian",
    ];
    const lakeValleyInput = {
      productId: "lake-valley-860-regression",
      upc: "051178008602",
      registerName: "Organic Lettuce Black Seeded Simpson Heirloom Seed Packet",
      brand: "Lake Valley Seed",
      officialWebsiteUrl: "https://lakevalleyseed.com",
      seedCandidateUrls: [],
    };

    const ports: ProductResearchPipelinePorts = {
      briefBuilder: {
        async buildBrief(rawInput) {
          return {
            input: rawInput,
            resolvedInput: {
              ...rawInput,
              officialDomainResolved: "lakevalleyseed.com",
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
                ...processedOfficialUrls.map((url) => ({ url, sourceType: "official" as const, title: url.split("/").pop()?.replaceAll("-", " ") })),
                { url: unverifiedOfficialUrl, sourceType: "official" as const, title: "Lettuce Grand Rapids - Item #3930" },
                { url: offDomainUrl, sourceType: "serp" as const, title: "Lake Valley Seed Lettuce Organic Black Seeded Simpson Heirloom Vegetable 1.5g", snippet: "UPC 051178008602" },
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
            title: url === offDomainUrl
              ? "Lake Valley Seed Lettuce Organic Black Seeded Simpson Heirloom Vegetable 1.5g"
              : "Lake Valley Seed product page",
            html: `<html><body>${url}</body></html>`,
            text: url,
            metadata: { engine: "http" },
          };
        },
      },
      factExtractors: [
        {
          async extractFacts(page) {
            if (page.url === offDomainUrl) {
              return {
                sourceUrl: page.url,
                title: "Lake Valley Seed Lettuce Organic Black Seeded Simpson Heirloom Vegetable 1.5g",
                description: "Distributor listing with UPC 051178008602.",
                images: ["https://www.esbenshades.com/img.jpg"],
                categories: ["Seeds"],
                attributes: { brand: "Lake Valley Seed", gtin12: "051178008602" },
                evidenceSnippets: ["Distributor product page"],
                confidence: 0.92,
              };
            }

            return {
              sourceUrl: page.url,
              title: page.url.includes("buttercrunch") ? "Lettuce Buttercrunch - Item #4059" : "Lake Valley Seed product page",
              description: "Official page without matching UPC.",
              images: ["https://lakevalleyseed.com/img.jpg"],
              categories: ["Vegetable Seeds"],
              attributes: {},
              evidenceSnippets: ["Official product page"],
              confidence: 0.75,
            };
          },
        },
      ],
      verifier: {
        async verifyCandidate(candidate, facts) {
          if (candidate.normalizedUrl === offDomainUrl) {
            return {
              candidate,
              facts,
              identityConfidence: 0.98,
              variantConfidence: 1,
              storefrontReadinessContribution: 0.94,
              warnings: [],
            };
          }

          return {
            candidate,
            facts,
            identityConfidence: candidate.normalizedUrl.includes("buttercrunch") ? 0.7 : 0.62,
            variantConfidence: candidate.normalizedUrl.includes("buttercrunch") ? 0.86 : 0.55,
            storefrontReadinessContribution: 0.4,
            warnings: [
              {
                stage: "verification",
                message: `UPC not found in extracted facts for uploaded anchor ${lakeValleyInput.upc}`,
                url: candidate.url,
              },
            ],
          };
        },
      },
      assembler: {
        async assembleStorefrontProduct(report) {
          return {
            id: report.runId,
            readiness: { status: "needs_review", missingFields: ["canonicalUrl"] },
            identity: { title: { value: "Lake Valley Seed Lettuce", confidence: 0.9, sourceType: "input", evidence: "" } },
            listing: { handle: "lake-valley-seed-lettuce" },
            media: { images: [] },
            variants: [],
            provenance: { generatedAt: new Date().toISOString(), runId: report.runId, confidence: 0.9, sources: [] },
          } as any;
        },
      },
    };

    const result = await runProductResearchPipeline(lakeValleyInput, ports, {
      now: new Date("2026-05-27T00:00:00Z"),
      runId: "run-no-unverified-promotion-id",
    });

    expect(result.report.selectedCanonicalUrl).toBe(offDomainUrl);
    expect(result.report.candidates.find((candidate) => candidate.normalizedUrl === unverifiedOfficialUrl)?.decision).not.toBe("selected");
    expect(result.report.candidates.find((candidate) => candidate.normalizedUrl === offDomainUrl)?.decision).toBe("selected");
  });
});
