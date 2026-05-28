import { describe, expect, it } from "bun:test";
import { gzipSync } from "node:zlib";
import { discoverUrlsFromSitemap, parseRobotsTxtForSitemaps, discoverSitemapsFromRobotsTxt } from "../src/pipeline/discovery/sitemap-url-discovery";
import { classifyProductUrlHeuristics } from "../src/pipeline/discovery/product-url-classifier";

describe("sitemap-url-discovery", () => {
  it("parses simple sitemap xml", async () => {
    const mockFetch = async () => {
      return {
        ok: true,
        text: async () => `
          <?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url>
              <loc>https://example.com/products/dog-food-12oz</loc>
            </url>
            <url>
              <loc>https://example.com/about-us</loc>
            </url>
            <url>
              <loc>https://example.com/shop?product=123&amp;ref=sitemap</loc>
            </url>
          </urlset>
        `
      } as Response;
    };

    const urls = await discoverUrlsFromSitemap("https://example.com/sitemap.xml", mockFetch as any);
    expect(urls).toContain("https://example.com/products/dog-food-12oz");
    expect(urls).toContain("https://example.com/about-us");
    expect(urls).toContain("https://example.com/shop?product=123&ref=sitemap");
  });

  it("handles sitemap indexes recursively", async () => {
    const mockFetch = async (url: string) => {
      if (url === "https://example.com/sitemap-index.xml") {
        return {
          ok: true,
          text: async () => `
            <sitemapindex>
              <sitemap>
                <loc>https://example.com/sitemap-products.xml</loc>
              </sitemap>
            </sitemapindex>
          `
        } as Response;
      }
      return {
        ok: true,
        text: async () => `
          <urlset>
            <url>
              <loc>https://example.com/products/puppy-kibble</loc>
            </url>
          </urlset>
        `
      } as Response;
    };

    const urls = await discoverUrlsFromSitemap("https://example.com/sitemap-index.xml", mockFetch as any);
    expect(urls).toContain("https://example.com/products/puppy-kibble");
  });

  it("handles prefixed sitemap indexes and gzipped child sitemaps", async () => {
    const gzippedChild = gzipSync(Buffer.from(`
      <ns:urlset xmlns:ns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <ns:url><ns:loc>https://example.com/products/gz-product</ns:loc></ns:url>
      </ns:urlset>
    `, "utf8"));

    const mockFetch = async (url: string) => {
      if (url === "https://example.com/sitemap.xml") {
        return {
          ok: true,
          arrayBuffer: async () => Buffer.from(`
            <ns:sitemapindex xmlns:ns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <ns:sitemap>
                <ns:loc>https://example.com/sitemap-products.xml.gz</ns:loc>
              </ns:sitemap>
            </ns:sitemapindex>
          `, "utf8"),
          headers: { get: () => null },
        } as unknown as Response;
      }

      return {
        ok: true,
        arrayBuffer: async () => gzippedChild,
        headers: {
          get: (name: string) => name.toLowerCase() === "content-type" ? "application/gzip" : null,
        },
      } as unknown as Response;
    };

    const urls = await discoverUrlsFromSitemap("https://example.com/sitemap.xml", mockFetch as any);
    expect(urls).toEqual(["https://example.com/products/gz-product"]);
  });

  it("classifies product URLs correctly based on heuristics", () => {
    // Product URLs
    expect(classifyProductUrlHeuristics("https://frommfamily.com/products/dog-food", "Fromm").isProductLike).toBe(true);
    expect(classifyProductUrlHeuristics("https://frommfamily.com/shop/puppy-gold", "Fromm").isProductLike).toBe(true);
    expect(classifyProductUrlHeuristics("https://frommfamily.com/recipes/gold-dry-dog-food").isProductLike).toBe(true);
    expect(classifyProductUrlHeuristics("https://honestkitchen.com/dehydrated-grain-free-chicken-dog-food", "Honest Kitchen").isProductLike).toBe(true);

    // Non-product URLs
    expect(classifyProductUrlHeuristics("https://honestkitchen.com/about-our-company", "Honest Kitchen").isProductLike).toBe(false);
    expect(classifyProductUrlHeuristics("https://frommfamily.com/about").isProductLike).toBe(false);
    expect(classifyProductUrlHeuristics("https://frommfamily.com/blog/news-2026").isProductLike).toBe(false);
    expect(classifyProductUrlHeuristics("https://frommfamily.com/cart").isProductLike).toBe(false);
    expect(classifyProductUrlHeuristics("https://frommfamily.com/support/contact-us").isProductLike).toBe(false);
    expect(classifyProductUrlHeuristics("https://frommfamily.com/images/logo.png").isProductLike).toBe(false);
  });

  it("parses robots.txt content for sitemaps", () => {
    const content = `
      User-agent: *
      Disallow: /checkout
      
      Sitemap: https://example.com/custom-sitemap.xml
      sitemap: http://example.com/sitemap_index.xml
    `;
    const sitemaps = parseRobotsTxtForSitemaps(content);
    expect(sitemaps).toEqual([
      "https://example.com/custom-sitemap.xml",
      "http://example.com/sitemap_index.xml"
    ]);
  });

  it("discovers sitemaps from robots.txt successfully", async () => {
    const mockFetch = async (url: string) => {
      expect(url).toContain("robots.txt");
      return {
        ok: true,
        text: async () => `
          User-agent: *
          Sitemap: https://example.com/discovered-sitemap.xml
        `
      } as Response;
    };
    const sitemaps = await discoverSitemapsFromRobotsTxt("example.com", mockFetch as any);
    expect(sitemaps).toEqual(["https://example.com/discovered-sitemap.xml"]);
  });
});
