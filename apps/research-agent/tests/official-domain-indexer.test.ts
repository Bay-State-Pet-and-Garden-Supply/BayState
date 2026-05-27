import { describe, expect, it } from "bun:test";
import { PageIndexDb } from "../src/cache/page-index-db";
import { PageIndexRepository } from "../src/cache/page-index-repository";
import { OfficialDomainIndexer } from "../src/pipeline/discovery/official-domain-indexer";
import type { PageAcquisitionProvider, PageFactExtractor } from "../src/pipeline/ports";

function createBrief(overrides?: Partial<any>) {
  return {
    input: {
      productId: "p1",
      upc: "123456789012",
      registerName: "Dog Food Gold",
      brand: "Fromm",
      officialWebsiteUrl: "https://frommfamily.com",
      ...overrides?.input,
    },
    resolvedInput: {
      productId: "p1",
      upc: "123456789012",
      registerName: "Dog Food Gold",
      brand: "Fromm",
      officialWebsiteUrl: "https://frommfamily.com",
      officialDomainResolved: "frommfamily.com",
      ...overrides?.resolvedInput,
    },
    constraints: {
      requireIdentityEvidence: true,
      preferOfficialSource: true,
      allowDistributorCanonical: false,
    },
  };
}

describe("OfficialDomainIndexer", () => {
  it("indexes a domain from sitemaps and extracts page facts into cache", async () => {
    const db = new PageIndexDb(":memory:");
    const repo = new PageIndexRepository(db);
    const brief = createBrief();

    const mockFetch = async () => ({
      ok: true,
      text: async () => `
        <urlset>
          <url><loc>https://frommfamily.com/products/gold-dog-food</loc></url>
          <url><loc>https://frommfamily.com/about</loc></url>
        </urlset>
      `,
    }) as Response;

    const mockAcquisition: PageAcquisitionProvider = {
      async acquirePage(url) {
        return {
          url,
          finalUrl: url,
          statusCode: 200,
          html: "<html>Product page</html>",
          fetchedAt: new Date().toISOString(),
          metadata: {},
        };
      },
    };

    const mockExtractor: PageFactExtractor = {
      async extractFacts(page) {
        return {
          sourceUrl: page.url,
          title: "Fromm Gold Dog Food",
          description: "Premium dog food recipe.",
          images: [],
          categories: ["Dog Food"],
          attributes: {
            gtin: "123456789012",
          },
          evidenceSnippets: ["Extracting GTIN 123456789012"],
          confidence: 0.95,
        };
      },
    };

    const indexer = new OfficialDomainIndexer();
    const result = await indexer.indexDomainForBrief(brief, { now: new Date() }, {
      pageAcquisition: mockAcquisition,
      factExtractors: [mockExtractor],
      repository: repo,
      fetchImpl: mockFetch as any,
      maxPagesFetched: 5,
    });

    expect(result.urlsDiscovered).toBe(2);
    expect(result.urlsFetched).toBe(1);
    expect(result.urlsIndexed).toBe(1);

    const upcResults = await repo.searchByUpc({ upc: "123456789012" });
    expect(upcResults.length).toBe(1);
    expect(upcResults[0].url).toBe("https://frommfamily.com/products/gold-dog-food");

    db.close();
  });

  it("does not index non-2xx pages or acquisition errors", async () => {
    const db = new PageIndexDb(":memory:");
    const repo = new PageIndexRepository(db);
    const brief = createBrief();

    const mockFetch = async () => ({
      ok: true,
      text: async () => `
        <urlset>
          <url><loc>https://frommfamily.com/products/bad-product</loc></url>
        </urlset>
      `,
    }) as Response;

    const mockAcquisition: PageAcquisitionProvider = {
      async acquirePage(url) {
        return {
          url,
          finalUrl: url,
          statusCode: 404,
          html: "<html>Not found</html>",
          text: "Not found",
          fetchedAt: new Date().toISOString(),
          metadata: { error: "HTTP 404" },
        };
      },
    };

    const mockExtractor: PageFactExtractor = {
      async extractFacts() {
        throw new Error("extractor should not be called for invalid page");
      },
    };

    const indexer = new OfficialDomainIndexer();
    const result = await indexer.indexDomainForBrief(brief, { now: new Date() }, {
      pageAcquisition: mockAcquisition,
      factExtractors: [mockExtractor],
      repository: repo,
      fetchImpl: mockFetch as any,
      maxPagesFetched: 5,
    });

    expect(result.urlsFetched).toBe(1);
    expect(result.urlsIndexed).toBe(0);
    expect((await repo.getStats()).pageFactsCount).toBe(0);
    expect(await repo.searchByUpc({ upc: "123456789012" })).toHaveLength(0);

    db.close();
  });

  it("prioritizes sitemap product URLs that best match the current register name", async () => {
    const db = new PageIndexDb(":memory:");
    const repo = new PageIndexRepository(db);
    const brief = createBrief({
      input: { registerName: "Fromm Gold Puppy Food" },
      resolvedInput: { registerName: "Fromm Gold Puppy Food" },
    });

    const mockFetch = async () => ({
      ok: true,
      text: async () => `
        <urlset>
          <url><loc>https://frommfamily.com/products/salmon-cat-food</loc></url>
          <url><loc>https://frommfamily.com/products/gold-puppy-food</loc></url>
          <url><loc>https://frommfamily.com/products/adult-dog-food</loc></url>
        </urlset>
      `,
    }) as Response;

    const acquiredUrls: string[] = [];
    const mockAcquisition: PageAcquisitionProvider = {
      async acquirePage(url) {
        acquiredUrls.push(url);
        return {
          url,
          finalUrl: url,
          statusCode: 200,
          html: "<html>Product page</html>",
          text: "Gold Puppy Food",
          fetchedAt: new Date().toISOString(),
          metadata: {},
        };
      },
    };

    const mockExtractor: PageFactExtractor = {
      async extractFacts(page) {
        return {
          sourceUrl: page.url,
          title: page.url.includes("gold-puppy-food") ? "Fromm Gold Puppy Food" : "Other Product",
          description: "Indexed product page.",
          images: [],
          categories: ["Dog Food"],
          attributes: {},
          evidenceSnippets: ["Indexed product page."],
          confidence: 0.8,
        };
      },
    };

    const indexer = new OfficialDomainIndexer();
    await indexer.indexDomainForBrief(brief, { now: new Date() }, {
      pageAcquisition: mockAcquisition,
      factExtractors: [mockExtractor],
      repository: repo,
      fetchImpl: mockFetch as any,
      maxPagesFetched: 1,
    });

    expect(acquiredUrls).toEqual(["https://frommfamily.com/products/gold-puppy-food"]);

    db.close();
  });
});
