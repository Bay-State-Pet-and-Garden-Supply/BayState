import { describe, expect, it } from "bun:test";
import { SerperCandidateDiscovery } from "../src/pipeline/discovery/serper-candidate-discovery";
import type { ProductResearchBrief } from "../src/pipeline/types";
import { normalizeDomain } from "../src/lib/url";

function createBrief(overrides: Partial<ProductResearchBrief["input"]> = {}): ProductResearchBrief {
  const input = {
    productId: "fromm-cat-purrsnick-duck-stew-3oz",
    upc: "072705113446",
    registerName: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
    brand: "Fromm",
    officialWebsiteUrl: "https://frommfamily.com",
    seedCandidateUrls: [],
    ...overrides,
  };

  return {
    input,
    resolvedInput: {
      ...input,
      officialDomainResolved: normalizeDomain(input.officialWebsiteUrl) ?? "frommfamily.com",
    },
    constraints: {
      requireIdentityEvidence: true,
      preferOfficialSource: true,
      allowDistributorCanonical: false,
    },
  };
}

describe("SerperCandidateDiscovery", () => {
  it("queries Serper.dev with a staged SKU-first flow before searching the official domain", async () => {
    const requestedQueries: string[] = [];
    const provider = new SerperCandidateDiscovery({
      apiKey: "test-key",
      resultLimit: 2,
      fetchImpl: (async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const body = JSON.parse(String(init?.body)) as { q: string; num: number };
        requestedQueries.push(body.q);
        expect(init?.headers).toMatchObject({ "X-API-KEY": "test-key" });
        expect(body.num).toBe(2);

        if (body.q === '"072705113446"') {
          return new Response(
            JSON.stringify({
              organic: [
                {
                  title: "PurrSnickitty Cat Duck Stew 3 oz | Fromm Family Foods",
                  link: "https://frommfamily.com/products/cat/purrsnickitty-duck-stew-3-oz",
                  snippet: "UPC: 072705113446",
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
        }

        if (body.q === "site:frommfamily.com PurrSnickitty Cat Duck Stew 3 oz") {
          return new Response(
            JSON.stringify({
              organic: [
                {
                  title: "PurrSnickitty Cat Duck Stew 3 oz",
                  link: "https://frommfamily.com/products/cat/purrsnickitty-duck-stew-3-oz",
                  snippet: "Fromm Family Foods product detail page.",
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        throw new Error(`Unexpected query: ${body.q}`);
      }) as unknown as typeof fetch,
    });

    const result = await provider.discoverCandidates(
      createBrief({ registerName: "Fromm Cat PurrSnick Duck Stew 3 oz" }),
      { now: new Date() },
    );

    expect(requestedQueries).toEqual([
      '"072705113446"',
      "site:frommfamily.com PurrSnickitty Cat Duck Stew 3 oz",
    ]);
    expect(result.warnings).toHaveLength(0);
    expect(result.candidates.some((candidate) => candidate.sourceType === "official")).toBe(true);
    expect(result.candidates.some((candidate) => candidate.sourceType === "serp")).toBe(true);
    expect(result.candidates.some((candidate) => candidate.discoveredFrom === "serper:site:frommfamily.com PurrSnickitty Cat Duck Stew 3 oz")).toBe(true);
  });

  it("falls back to the register name when SKU discovery evidence is too generic", async () => {
    const requestedQueries: string[] = [];
    const provider = new SerperCandidateDiscovery({
      apiKey: "test-key",
      resultLimit: 2,
      fetchImpl: (async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const body = JSON.parse(String(init?.body)) as { q: string; num: number };
        requestedQueries.push(body.q);

        if (body.q === '"072705113446"') {
          return new Response(
            JSON.stringify({
              organic: [
                {
                  title: "Wet Food for Cats | Fromm Family Foods",
                  link: "https://frommfamily.com/products/cat/purrsnickitty/can",
                  snippet: "UPC: 072705113446",
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({ organic: [] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as unknown as typeof fetch,
    });

    await provider.discoverCandidates(createBrief(), { now: new Date() });

    expect(requestedQueries).toEqual([
      '"072705113446"',
      "site:frommfamily.com Fromm Cat PurrSnickitty Duck Stew 3 oz",
    ]);
  });

  it("uses product code hints from UPC results to probe the official domain", async () => {
    const requestedQueries: string[] = [];
    const provider = new SerperCandidateDiscovery({
      apiKey: "test-key",
      resultLimit: 3,
      fetchImpl: (async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const body = JSON.parse(String(init?.body)) as { q: string; num: number };
        requestedQueries.push(body.q);

        if (body.q === '"051178008602"') {
          return new Response(
            JSON.stringify({
              organic: [
                {
                  title: "Organic Lettuce Black Seeded Simpson Heirloom Seed Packet | Esbenshades",
                  link: "https://www.esbenshades.com/seeds-bulbs/lake-valley-seed-860",
                  snippet: "UPC: 051178008602",
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        if (body.q === "site:lakevalleyseed.com Organic Lettuce Black Seeded Simpson Heirloom Seed Packet") {
          return new Response(
            JSON.stringify({
              organic: [
                {
                  title: "Lettuce Buttercrunch - Item #4059",
                  link: "https://lakevalleyseed.com/product/item-4059-lettuce-buttercrunch",
                  snippet: "Lake Valley Seed product detail page.",
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        if (body.q === 'site:lakevalleyseed.com "item-860"') {
          return new Response(
            JSON.stringify({
              organic: [
                {
                  title: "Lettuce Black Seeded Simpson - Item #860",
                  link: "https://lakevalleyseed.com/product/item-860-lettuce-black-seeded-simpson",
                  snippet: "Official Lake Valley Seed product detail page.",
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        throw new Error(`Unexpected query: ${body.q}`);
      }) as unknown as typeof fetch,
    });

    const result = await provider.discoverCandidates(
      createBrief({
        upc: "051178008602",
        brand: "Lake Valley Seed",
        registerName: "Organic Lettuce Black Seeded Simpson Heirloom Seed Packet",
        officialWebsiteUrl: "https://lakevalleyseed.com",
      }),
      { now: new Date() },
    );

    expect(requestedQueries).toEqual([
      '"051178008602"',
      "site:lakevalleyseed.com Organic Lettuce Black Seeded Simpson Heirloom Seed Packet",
      'site:lakevalleyseed.com "item-860"',
    ]);
    expect(result.candidates.some((candidate) => candidate.url === "https://lakevalleyseed.com/product/item-860-lettuce-black-seeded-simpson")).toBe(true);
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
