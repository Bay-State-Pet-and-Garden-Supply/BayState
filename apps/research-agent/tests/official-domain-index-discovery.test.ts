import { describe, expect, it } from "bun:test";
import { PageIndexDb } from "../src/cache/page-index-db";
import { PageIndexRepository } from "../src/cache/page-index-repository";
import { OfficialDomainIndexDiscovery } from "../src/pipeline/discovery/official-domain-index-discovery";

describe("OfficialDomainIndexDiscovery", () => {
  const brief: any = {
    input: {
      productId: "p1",
      upc: "123456789012",
      registerName: "Dog Food Gold",
      brand: "Fromm",
      officialWebsiteUrl: "https://frommfamily.com"
    },
    resolvedInput: {
      productId: "p1",
      upc: "123456789012",
      registerName: "Dog Food Gold",
      brand: "Fromm",
      officialDomainResolved: "frommfamily.com"
    }
  };

  const context: any = { now: new Date() };

  it("discovers exact UPC candidate", async () => {
    const db = new PageIndexDb(":memory:");
    const repo = new PageIndexRepository(db);

    await repo.upsertPageFacts({
      url: "https://frommfamily.com/products/gold-dog-food",
      title: "Fromm Gold Dog Food",
      description: "Premium dog food recipe.",
      upcs: ["123456789012"],
      brand: "Fromm",
      confidence: 0.95
    });

    const provider = new OfficialDomainIndexDiscovery({ repository: repo, indexingMode: "lookup-only" });
    const result = await provider.discoverCandidates(brief, context);

    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0].url).toBe("https://frommfamily.com/products/gold-dog-food");
    expect(result.candidates[0].discoveredFrom).toBe("page-index:exact-upc");
    expect(result.warnings.length).toBe(0);

    db.close();
  });

  it("falls back to text search on UPC miss", async () => {
    const db = new PageIndexDb(":memory:");
    const repo = new PageIndexRepository(db);

    await repo.upsertPageFacts({
      url: "https://frommfamily.com/products/gold-dog-food",
      title: "Fromm Gold Dog Food",
      description: "Premium dog food recipe.",
      upcs: ["999999999999"], // Mismatched UPC
      brand: "Fromm",
      confidence: 0.95
    });

    const provider = new OfficialDomainIndexDiscovery({ repository: repo, indexingMode: "lookup-only" });
    const result = await provider.discoverCandidates(brief, context);

    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0].url).toBe("https://frommfamily.com/products/gold-dog-food");
    expect(result.candidates[0].discoveredFrom).toBe("page-index:text-search");
    expect(result.warnings.length).toBe(0);

    db.close();
  });

  it("handles index miss with a warning", async () => {
    const db = new PageIndexDb(":memory:");
    const repo = new PageIndexRepository(db);

    const provider = new OfficialDomainIndexDiscovery({ repository: repo, indexingMode: "lookup-only" });
    const result = await provider.discoverCandidates(brief, context);

    expect(result.candidates.length).toBe(0);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0].message).toContain("Official domain index miss");

    db.close();
  });
});
