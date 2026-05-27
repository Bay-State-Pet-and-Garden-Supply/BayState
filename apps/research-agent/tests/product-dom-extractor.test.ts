import { describe, expect, it } from "bun:test";
import { ProductDomExtractor } from "../src/pipeline/extraction/product-dom-extractor";
import { extractCandidateMetadataFacts } from "../src/pipeline/extraction/candidate-metadata-extractor";
import type { ProductResearchBrief, AcquiredPage } from "../src/pipeline/types";
import type { EvaluatedCandidate } from "../src/schemas/CandidateUrl";

const brief: ProductResearchBrief = {
  input: {
    productId: "fromm-cat-purrsnick-duck-stew-3oz",
    upc: "072705113446",
    registerName: "Fromm Cat PurrSnick Duck Stew 3 oz",
    brand: "Fromm",
    officialWebsiteUrl: "https://frommfamily.com",
    seedCandidateUrls: [],
  },
  resolvedInput: {
    productId: "fromm-cat-purrsnick-duck-stew-3oz",
    upc: "072705113446",
    registerName: "Fromm Cat PurrSnick Duck Stew 3 oz",
    brand: "Fromm",
    officialWebsiteUrl: "https://frommfamily.com",
    officialDomainResolved: "frommfamily.com",
    seedCandidateUrls: [],
  },
  constraints: {
    requireIdentityEvidence: true,
    preferOfficialSource: true,
    allowDistributorCanonical: false,
  },
};

describe("ProductDomExtractor", () => {
  it("extracts visible title, description, images, canonical URL, and size from product DOM", async () => {
    const extractor = new ProductDomExtractor();
    const page: AcquiredPage = {
      url: "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew/",
      finalUrl: "https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew/",
      fetchedAt: new Date().toISOString(),
      title: "PurrSnickitty Duck Stew Recipe Food for Cats",
      html: `
        <html>
          <head>
            <link rel="canonical" href="https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew/" />
            <meta name="description" content="A hearty stew featuring tender duck, cooked in a savory chicken and turkey broth." />
          </head>
          <body>
            <nav>Cat / PurrSnickitty / Can</nav>
            <h1>Duck Stew</h1>
            <p>A hearty stew featuring tender duck, cooked in a savory chicken and turkey broth.</p>
            <img src="https://cdn.frommfamily.com/product/duck-stew.jpg" alt="Duck Stew product image" />
            <section>Available Sizes 3 oz.</section>
          </body>
        </html>
      `,
      text: `Cat / PurrSnickitty / Can\nDuck Stew\nA hearty stew featuring tender duck, cooked in a savory chicken and turkey broth.\nAvailable Sizes\n3 oz.`,
      metadata: { engine: "http" },
    };

    const facts = await extractor.extractFacts(page, brief, { now: new Date() });

    expect(facts.title).toBe("Duck Stew");
    expect(facts.description).toContain("hearty stew featuring tender duck");
    expect(facts.images[0]).toContain("duck-stew.jpg");
    expect(facts.attributes.canonicalUrl).toBe("https://frommfamily.com/products/cat/purrsnickitty/can/duck-stew/");
    expect(facts.attributes.size).toBe("3 oz");
    expect(facts.confidence).toBeGreaterThan(0.6);
  });

  it("extracts lazy/relative images and rejects generic search-like descriptions", async () => {
    const extractor = new ProductDomExtractor();
    const page: AcquiredPage = {
      url: "https://example.com/products/test-product",
      finalUrl: "https://example.com/search?q=test-product",
      fetchedAt: new Date().toISOString(),
      title: "Example Site Search Results",
      html: `
        <html>
          <head>
            <meta name="description" content="Sign up for our newsletter and browse site search results." />
            <meta property="og:image" content="/cdn/product-main.jpg" />
          </head>
          <body>
            <h1>Search Results</h1>
            <img data-src="/images/product-secondary.webp" alt="Test Product hero" />
            <picture><source srcset="/images/product-third.webp 1x, /images/product-third@2x.webp 2x" /></picture>
          </body>
        </html>
      `,
      text: "Search Results",
      metadata: { engine: "http" },
    };

    const facts = await extractor.extractFacts(page, brief, { now: new Date() });

    expect(facts.images).toHaveLength(0);
    expect(facts.description).toBeUndefined();
    expect(facts.confidence).toBeLessThanOrEqual(0.35);
  });
});

describe("extractCandidateMetadataFacts", () => {
  it("turns candidate title/snippet into low-confidence corroborating facts", () => {
    const candidate: EvaluatedCandidate = {
      url: "https://shop.example.com/products/fromm-duck-stew",
      normalizedUrl: "https://shop.example.com/products/fromm-duck-stew",
      normalizedDomain: "shop.example.com",
      sourceType: "serp",
      title: "Fromm PurrSnickitty Duck Stew 3 oz",
      snippet: "UPC 072705113446. Premium cat stew with duck.",
      discoveredFrom: "serper:072705113446 Fromm",
      matchedTokens: ["fromm"],
      score: 0.7,
      authorityScore: 0.3,
      relevanceScore: 0.7,
      variantScore: 0.8,
      pathScore: 0.9,
      decision: "needs_review",
      reason: "Promising",
      reasons: [],
      warnings: [],
    };

    const facts = extractCandidateMetadataFacts(candidate, brief);
    expect(facts.title).toContain("Duck Stew");
    expect(facts.description).toContain("UPC 072705113446");
    expect(Array.isArray(facts.attributes.heuristicUpcs)).toBe(true);
    expect((facts.attributes.heuristicUpcs as string[])[0]).toBe("072705113446");
    expect(facts.attributes.size).toBe("3 oz");
    expect(facts.confidence).toBeGreaterThan(0.35);
  });
});
