import { describe, expect, it } from "bun:test";
import { PageIndexDb } from "../src/cache/page-index-db";
import { PageIndexRepository } from "../src/cache/page-index-repository";

describe("PageIndexDb and Repository", () => {
  it("initializes and performs repository operations in memory", async () => {
    const db = new PageIndexDb(":memory:");
    const repo = new PageIndexRepository(db);

    // 1. Upsert Domain
    const domain = await repo.upsertDomain({
      normalizedDomain: "frommfamily.com",
      officialWebsiteUrl: "https://frommfamily.com",
      brandName: "Fromm",
    });

    expect(domain.id).toBeDefined();
    expect(domain.normalizedDomain).toBe("frommfamily.com");
    expect(domain.brandName).toBe("Fromm");

    // 2. Upsert Discovered URLs
    await repo.upsertDiscoveredUrls("frommfamily.com", [
      { url: "https://frommfamily.com/products/dog-food", isProductLike: true, discoveredFrom: "sitemap" },
      { url: "https://frommfamily.com/about", isProductLike: false, discoveredFrom: "sitemap" }
    ]);

    const stats = await repo.getStats();
    expect(stats.domainCount).toBe(1);
    expect(stats.urlCount).toBe(2);
    expect(stats.productLikeUrlCount).toBe(1);

    // 3. Get stale URLs (should return because last_fetched_at is null)
    const stale = await repo.getStaleProductLikeUrls("frommfamily.com", { ttlDays: 7 });
    expect(stale).toContain("https://frommfamily.com/products/dog-food");

    // 4. Mark fetch result
    await repo.markFetchResult("https://frommfamily.com/products/dog-food", {
      status: 200,
      title: "Fromm Dog Food",
      description: "Delicious and nutritious dog food for your pup.",
      isProductLike: true
    });

    const stats2 = await repo.getStats();
    expect(stats2.fetchedUrlCount).toBe(1);

    // 4. Upsert Page Facts
    await repo.upsertPageFacts({
      url: "https://frommfamily.com/products/dog-food",
      title: "Fromm Dog Food",
      description: "Delicious and nutritious dog food for your pup.",
      upcs: ["012345678905"],
      brand: "Fromm",
      confidence: 0.9,
      images: ["https://frommfamily.com/images/dog-food.png"],
      categories: ["Dog Food", "Dry Food"]
    });

    const stats3 = await repo.getStats();
    expect(stats3.pageFactsCount).toBe(1);

    // 5. Search by UPC
    const upcResults = await repo.searchByUpc({ upc: "012345678905" });
    expect(upcResults.length).toBe(1);
    expect(upcResults[0].url).toBe("https://frommfamily.com/products/dog-food");
    expect(upcResults[0].upcs).toContain("012345678905");

    // 6. Search by text (FTS5)
    const textResults = await repo.searchByText({ text: "delicious dog food" });
    expect(textResults.length).toBe(1);
    expect(textResults[0].url).toBe("https://frommfamily.com/products/dog-food");

    const normalizedUpcResults = await repo.searchByUpc({ upc: "01234-5678-905" });
    expect(normalizedUpcResults.length).toBe(1);
    expect(normalizedUpcResults[0].upcs).toContain("012345678905");

    db.close();
  });
});
