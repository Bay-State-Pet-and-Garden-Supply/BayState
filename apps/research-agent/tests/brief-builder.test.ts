import { describe, expect, it } from "bun:test";
import { DefaultBriefBuilder } from "../src/pipeline/brief/brief-builder";

describe("DefaultBriefBuilder", () => {
  const context = {
    now: new Date("2026-05-27T00:00:00Z"),
  };

  it("builds a brief from valid input", async () => {
    const builder = new DefaultBriefBuilder();
    const input = {
      productId: "test-product",
      registerName: "Test Product 12oz",
      brand: "Test Brand",
      officialWebsiteUrl: "https://www.testbrand.com/products/test-12oz",
      expectedAttributes: {
        size: "12oz",
      },
      candidateUrls: [],
    };

    const brief = await builder.buildBrief(input, context);

    expect(brief.input.productId).toBe("test-product");
    expect(brief.resolvedInput.officialDomainResolved).toBe("testbrand.com");
    expect(brief.constraints.requireIdentityEvidence).toBe(true);
    expect(brief.constraints.preferOfficialSource).toBe(true);
    expect(brief.constraints.allowDistributorCanonical).toBe(false);
  });

  it("throws error for invalid input", async () => {
    const builder = new DefaultBriefBuilder();
    const input = {
      productId: "", // invalid
      registerName: "Test Product",
      brand: "Test Brand",
    };

    expect(builder.buildBrief(input as any, context)).rejects.toThrow();
  });
});
