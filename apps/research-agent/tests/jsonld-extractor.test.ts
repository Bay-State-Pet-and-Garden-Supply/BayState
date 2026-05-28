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

  it("extracts structured offers for multi-variant products", async () => {
    const html = `
      <html>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org/",
            "@type": "Product",
            "name": "Bionic Urban Stick",
            "offers": [
              {
                "@type": "Offer",
                "name": "Small",
                "sku": "BIONIC-SMALL",
                "gtin13": "1111111111111",
                "availability": "https://schema.org/InStock",
                "size": "Small",
                "weight": "0.5 lb"
              },
              {
                "@type": "Offer",
                "name": "Large",
                "sku": "BIONIC-LARGE",
                "gtin13": "9999999999999",
                "availability": "https://schema.org/InStock",
                "size": "Large",
                "weight": "1.5 lb"
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

    expect(facts.offers).toBeDefined();
    expect(facts.offers!.length).toBe(2);

    expect(facts.offers![0].name).toBe("Small");
    expect(facts.offers![0].sku).toBe("BIONIC-SMALL");
    expect(facts.offers![0].gtins).toEqual(["1111111111111"]);
    expect(facts.offers![0].variantAttributes.size).toBe("Small");
    expect(facts.offers![0].variantAttributes.weight).toBe("0.5 lb");

    expect(facts.offers![1].name).toBe("Large");
    expect(facts.offers![1].sku).toBe("BIONIC-LARGE");
    expect(facts.offers![1].gtins).toEqual(["9999999999999"]);
    expect(facts.offers![1].variantAttributes.size).toBe("Large");
    expect(facts.offers![1].variantAttributes.weight).toBe("1.5 lb");
  });
});
