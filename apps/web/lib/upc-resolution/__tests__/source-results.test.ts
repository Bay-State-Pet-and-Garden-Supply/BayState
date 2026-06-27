/**
 * Tests for source-results reducer.
 *
 * Covers the reduceSourceResults function that converts source_results[]
 * into product-level UPC resolution decisions.
 */

import { reduceSourceResults, buildV2ResolutionUpdate } from "../source-results";
import type { SourceResultInfo } from "@/lib/scraper-callback/enrichment-result";

function makeSr(overrides: Partial<SourceResultInfo> = {}): SourceResultInfo {
  return {
    sourceSlug: overrides.sourceSlug ?? "test-source",
    sourceType: overrides.sourceType ?? "distributor",
    confidence: overrides.confidence ?? 0.5,
    matchedFields: overrides.matchedFields ?? [],
    evidenceUrl: overrides.evidenceUrl ?? null,
    product: overrides.product ?? null,
    outcome: overrides.outcome ?? "found",
    attempted_at: overrides.attempted_at ?? "2026-06-24T00:00:00Z",
    resolutionStage: overrides.resolutionStage ?? null,
    resolutionEvidence: overrides.resolutionEvidence ?? null,
  };
}

describe("reduceSourceResults", () => {
  // Valid GTIN-12 used for UPC proof tests
  const expectedUpc = "042100005264";

  it("returns unresolved for empty source results", () => {
    const decision = reduceSourceResults([], expectedUpc);
    expect(decision.status).toBe("unresolved");
    expect(decision.needsAttention).toBe(false);
    expect(decision.evidence).toEqual([]);
    expect(decision.confidence).toBe(0);
  });

  it("returns confirmed for a single accepted proof", () => {
    const sr = makeSr({
      sourceSlug: "phillips",
      sourceType: "distributor",
      outcome: "found",
      confidence: 0.96,
      product: { upc: expectedUpc },
    });

    const decision = reduceSourceResults([sr], expectedUpc);
    expect(decision.status).toBe("confirmed");
    expect(decision.needsAttention).toBe(false);
    expect(decision.confidence).toBeGreaterThanOrEqual(0.95);
    expect(decision.evidence.length).toBe(1);
  });

  it("returns unresolved for only not_stocked outcomes", () => {
    const sources: SourceResultInfo[] = [
      makeSr({ sourceSlug: "phillips", sourceType: "distributor", outcome: "not_stocked", confidence: 0, product: {} }),
      makeSr({ sourceSlug: "fromm", sourceType: "distributor", outcome: "not_stocked", confidence: 0, product: {} }),
    ];

    const decision = reduceSourceResults(sources, expectedUpc);
    expect(decision.status).toBe("unresolved");
    expect(decision.needsAttention).toBe(true);
  });

  it("returns unresolved for only skipped outcomes", () => {
    const sources: SourceResultInfo[] = [
      makeSr({ sourceSlug: "phillips", sourceType: "distributor", outcome: "skipped", confidence: 0, product: {} }),
    ];

    const decision = reduceSourceResults(sources, expectedUpc);
    expect(decision.status).toBe("unresolved");
    expect(decision.needsAttention).toBe(true);
  });

  it("returns candidate for found without exact UPC", () => {
    const sr = makeSr({
      sourceSlug: "phillips",
      sourceType: "distributor",
      outcome: "found",
      confidence: 0.8,
      product: { name: "Product Name", brand: "Brand" },
    });

    const decision = reduceSourceResults([sr], expectedUpc);
    expect(decision.status).toBe("candidate");
    expect(decision.needsAttention).toBe(true);
  });

  it("returns conflict when both accepted proof and conflicting UPC exist", () => {
    const sources: SourceResultInfo[] = [
      makeSr({
        sourceSlug: "phillips",
        sourceType: "distributor",
        outcome: "found",
        confidence: 0.96,
        product: { upc: expectedUpc },
      }),
      makeSr({
        sourceSlug: "other-source",
        sourceType: "distributor",
        outcome: "found",
        confidence: 0.9,
        product: { upc: "4901234567890" }, // different valid GTIN-13
      }),
    ];

    const decision = reduceSourceResults(sources, expectedUpc);
    expect(decision.status).toBe("conflict");
    expect(decision.needsAttention).toBe(true);
  });

  it("returns conflict for only conflicting UPC", () => {
    const sources: SourceResultInfo[] = [
      makeSr({
        sourceSlug: "other-source",
        sourceType: "distributor",
        outcome: "found",
        confidence: 0.9,
        product: { upc: "4901234567890" },
      }),
    ];

    const decision = reduceSourceResults(sources, expectedUpc);
    expect(decision.status).toBe("conflict");
    expect(decision.needsAttention).toBe(true);
  });
});

describe("buildV2ResolutionUpdate", () => {
  const expectedUpc = "042100005264";

  it("returns processed for accepted proof", () => {
    const sr = makeSr({
      sourceSlug: "phillips",
      sourceType: "distributor",
      outcome: "found",
      confidence: 0.96,
      product: { upc: expectedUpc },
    });

    const update = buildV2ResolutionUpdate([sr], expectedUpc);
    expect(update.pipeline_status).toBe("processed");
    expect(update.upc_resolution_status).toBe("confirmed");
    expect(update.upc_resolution_evidence.length).toBe(1);
  });

  it("returns needs_attention for empty source_results (fail-closed)", () => {
    const update = buildV2ResolutionUpdate([], expectedUpc);
    expect(update.pipeline_status).toBe("needs_attention");
    expect(update.upc_resolution_status).toBe("unresolved");
    expect(update.upc_resolution_stage).toBe("none");
    expect(update.upc_resolution_confidence).toBe(0);
    expect(update.upc_resolution_evidence).toEqual([]);
  });

  it("returns needs_attention for no proof found", () => {
    const sr = makeSr({
      sourceSlug: "phillips",
      sourceType: "distributor",
      outcome: "not_stocked",
      confidence: 0,
      product: {},
    });

    const update = buildV2ResolutionUpdate([sr], expectedUpc);
    expect(update.pipeline_status).toBe("needs_attention");
    expect(update.upc_resolution_status).toBe("unresolved");
  });

  it("returns needs_attention for conflict", () => {
    const sources: SourceResultInfo[] = [
      makeSr({
        sourceSlug: "source-a",
        sourceType: "distributor",
        outcome: "found",
        confidence: 0.96,
        product: { upc: expectedUpc },
      }),
      makeSr({
        sourceSlug: "source-b",
        sourceType: "distributor",
        outcome: "found",
        confidence: 0.9,
        product: { upc: "4901234567890" },
      }),
    ];

    const update = buildV2ResolutionUpdate(sources, expectedUpc);
    expect(update.pipeline_status).toBe("needs_attention");
    expect(update.upc_resolution_status).toBe("conflict");
  });
});
