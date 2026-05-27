import { describe, expect, it } from "bun:test";
import { TextHeuristicExtractor } from "../src/pipeline/extraction/text-heuristic-extractor";

describe("TextHeuristicExtractor", () => {
  const context = { now: new Date() };
  const brief = {
    input: {} as any,
    resolvedInput: {} as any,
    constraints: {} as any,
  };

  it("extracts UPCs, prices, and sizes from text", async () => {
    const text = `
      Fromm Gold Dog Food. Item weight is 12 lbs (also available in 5lb size).
      Barcode / UPC: 850039426636.
      Our regular price: $149.99, sale price is $135.
    `;

    const extractor = new TextHeuristicExtractor();
    const facts = await extractor.extractFacts({
      url: "https://example.com",
      finalUrl: "https://example.com",
      fetchedAt: "",
      text,
      metadata: {},
    }, brief, context);

    expect(facts.confidence).toBe(0.55);
    expect(facts.attributes.heuristicUpcs).toContain("850039426636");
    expect(facts.attributes.heuristicPrice).toBe("149.99");
    expect(facts.attributes.heuristicSizes).toContain("12 lbs");
    expect(facts.attributes.heuristicSizes).toContain("5lb");
  });

  it("returns 0.0 confidence when no matches found", async () => {
    const text = "Hello world, this contains no product metadata.";
    const extractor = new TextHeuristicExtractor();
    const facts = await extractor.extractFacts({
      url: "https://example.com",
      finalUrl: "https://example.com",
      fetchedAt: "",
      text,
      metadata: {},
    }, brief, context);

    expect(facts.confidence).toBe(0.0);
  });
});
