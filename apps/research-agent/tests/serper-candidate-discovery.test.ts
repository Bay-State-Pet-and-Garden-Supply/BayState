import { describe, expect, it } from "bun:test";
import { SerperCandidateDiscovery } from "../src/pipeline/discovery/serper-candidate-discovery";
import type { ProductResearchBrief } from "../src/pipeline/types";

function createBrief(): ProductResearchBrief {
  return {
    input: {
      productId: "fromm-cat-purrsnick-duck-stew-3oz",
      upc: "072705113446",
      registerName: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
      brand: "Fromm",
      officialWebsiteUrl: "https://frommfamily.com",
      seedCandidateUrls: [],
    },
    resolvedInput: {
      productId: "fromm-cat-purrsnick-duck-stew-3oz",
      upc: "072705113446",
      registerName: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
      brand: "Fromm",
      officialWebsiteUrl: "https://frommfamily.com",
      seedCandidateUrls: [],
      officialDomainResolved: "frommfamily.com",
    },
    constraints: {
      requireIdentityEvidence: true,
      preferOfficialSource: true,
      allowDistributorCanonical: false,
    },
  };
}

describe("SerperCandidateDiscovery", () => {
  it("queries Serper.dev with UPC/register-name searches and maps organic results", async () => {
    const requestedQueries: string[] = [];
    const provider = new SerperCandidateDiscovery({
      apiKey: "test-key",
      resultLimit: 2,
      fetchImpl: (async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const body = JSON.parse(String(init?.body)) as { q: string; num: number };
        requestedQueries.push(body.q);
        expect(init?.headers).toMatchObject({ "X-API-KEY": "test-key" });
        expect(body.num).toBe(2);
        return new Response(
          JSON.stringify({
            organic: [
              {
                title: "PurrSnickitty - Wet Food for Cats",
                link: "https://frommfamily.com/products/cat/purrsnickitty/can",
                snippet: "Fromm Family Foods PurrSnickitty wet cat food landing page.",
              },
              {
                title: "PURRSNICKITTY CAT DUCK STEW 3OZ – Tickners",
                link: "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans/",
                snippet: "SKU: 072705113446",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as unknown as typeof fetch,
    });

    const result = await provider.discoverCandidates(createBrief(), { now: new Date() });

    expect(requestedQueries.some((query) => query.includes("site:frommfamily.com") && query.includes("072705113446"))).toBe(true);
    expect(requestedQueries.some((query) => query.includes("Fromm Cat PurrSnickitty Duck Stew 3 oz"))).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.candidates.some((candidate) => candidate.sourceType === "official")).toBe(true);
    expect(result.candidates.some((candidate) => candidate.sourceType === "serp")).toBe(true);
  });

  it("skips discovery with a warning when no API key is configured", async () => {
    let fetchCalled = false;
    const provider = new SerperCandidateDiscovery({
      apiKey: "",
      fetchImpl: (async () => {
        fetchCalled = true;
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    });

    const result = await provider.discoverCandidates(createBrief(), { now: new Date() });

    expect(fetchCalled).toBe(false);
    expect(result.candidates).toHaveLength(0);
    expect(result.warnings[0]?.message).toContain("SERPER_API_KEY");
  });
});
