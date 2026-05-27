import { describe, expect, it } from "bun:test";
import { JsonLdExtractor } from "../src/pipeline/extraction/jsonld-extractor";

describe("JsonLdExtractor", () => {
  const context = { now: new Date() };
  const brief = {
    input: {} as any,
    resolvedInput: {} as any,
    constraints: {} as any,
  };

  it("handles empty HTML", async () => {
    const extractor = new JsonLdExtractor();
    const facts = await extractor.extractFacts({ url: "https://example.com", finalUrl: "https://example.com", fetchedAt: "", metadata: {} }, brief, context);
    expect(facts.confidence).toBe(0.0);
    expect(facts.images).toEqual([]);
  });

  it("extracts product details from simple JSON-LD", async () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org/",
              "@type": "Product",
              "name": "Fromm Duck Stew",
              "description": "Delicious duck stew for dogs",
              "image": "https://example.com/duck.jpg",
              "sku": "12345",
              "brand": {
                "@type": "Brand",
                "name": "Fromm"
              },
              "offers": {
                "@type": "Offer",
                "price": "3.99",
                "priceCurrency": "USD",
                "availability": "https://schema.org/InStock"
              }
            }
          </script>
        </head>
      </html>
    `;

    const extractor = new JsonLdExtractor();
    const facts = await extractor.extractFacts({
      url: "https://example.com",
      finalUrl: "https://example.com",
      fetchedAt: "",
      html,
      metadata: {},
    }, brief, context);

    expect(facts.confidence).toBe(0.92);
    expect(facts.title).toBe("Fromm Duck Stew");
    expect(facts.description).toBe("Delicious duck stew for dogs");
    expect(facts.images).toEqual(["https://example.com/duck.jpg"]);
    expect(facts.attributes.brand).toBe("Fromm");
    expect(facts.attributes.sku).toBe("12345");
    expect(facts.attributes.price).toBe("3.99");
    expect(facts.attributes.priceCurrency).toBe("USD");
  });

  it("extracts products nested inside a @graph block", async () => {
    const html = `
      <html>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebSite",
                "name": "Pet Store"
              },
              {
                "@type": "Product",
                "name": "Graph Product",
                "image": ["img1.jpg", "img2.jpg"],
                "category": "Dog Supplies"
              }
            ]
          }
        </script>
      </html>
    `;

    const extractor = new JsonLdExtractor();
    const facts = await extractor.extractFacts({
      url: "https://example.com",
      finalUrl: "https://example.com",
      fetchedAt: "",
      html,
      metadata: {},
    }, brief, context);

    expect(facts.confidence).toBe(0.92);
    expect(facts.title).toBe("Graph Product");
    expect(facts.images).toEqual(["img1.jpg", "img2.jpg"]);
    expect(facts.categories).toEqual(["Dog Supplies"]);
  });
});
