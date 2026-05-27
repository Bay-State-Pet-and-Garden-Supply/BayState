import { describe, expect, it } from "bun:test";
import { MetaExtractor } from "../src/pipeline/extraction/meta-extractor";

describe("MetaExtractor", () => {
  const context = { now: new Date() };
  const brief = {
    input: {} as any,
    resolvedInput: {} as any,
    constraints: {} as any,
  };

  it("extracts from OpenGraph meta tags", async () => {
    const html = `
      <html>
        <head>
          <title>Fallback Title</title>
          <meta property="og:title" content="OG Title" />
          <meta name="description" content="Standard description" />
          <meta property="og:image" content="https://example.com/og.jpg" />
          <meta property="product:price:amount" content="19.99" />
          <meta property="product:price:currency" content="USD" />
          <meta property="product:brand" content="OG Brand" />
        </head>
      </html>
    `;

    const extractor = new MetaExtractor();
    const facts = await extractor.extractFacts({
      url: "https://example.com",
      finalUrl: "https://example.com",
      fetchedAt: "",
      html,
      metadata: {},
    }, brief, context);

    expect(facts.confidence).toBe(0.78);
    expect(facts.title).toBe("OG Title");
    expect(facts.description).toBe("Standard description");
    expect(facts.images).toEqual(["https://example.com/og.jpg"]);
    expect(facts.attributes.brand).toBe("OG Brand");
    expect(facts.attributes.price).toBe("19.99");
    expect(facts.attributes.priceCurrency).toBe("USD");
  });

  it("falls back to <title> tag when og:title is missing", async () => {
    const html = `
      <html>
        <head>
          <title>Page Title Only</title>
        </head>
      </html>
    `;

    const extractor = new MetaExtractor();
    const facts = await extractor.extractFacts({
      url: "https://example.com",
      finalUrl: "https://example.com",
      fetchedAt: "",
      html,
      metadata: {},
    }, brief, context);

    expect(facts.title).toBe("Page Title Only");
  });
});
