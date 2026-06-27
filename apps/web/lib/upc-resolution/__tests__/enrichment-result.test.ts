/**
 * Tests for enrichment-result V2 helpers and SourceResultInfo schema.
 *
 * Covers:
 *   - SourceResultInfo tolerates optional resolution evidence fields
 *   - determineV2Status legacy vs V2 behavior
 *   - NormalizedOutcome interop
 */

import {
  SourceResultInfoSchema,
  determineV2Status,
  determineFinalStatus,
  normalizeSourceOutcome,
} from "@/lib/scraper-callback/enrichment-result";
import type { SourceResultInfo } from "@/lib/scraper-callback/enrichment-result";
import { isUpcResolutionV2Enabled } from "@/lib/upc-resolution/types";

describe("SourceResultInfoSchema tolerates V2 fields", () => {
  it("parses a basic source result without resolution fields", () => {
    const input = {
      sourceSlug: "phillips",
      sourceType: "distributor",
      confidence: 0.95,
      matchedFields: ["name", "brand"],
      outcome: "found",
    };

    const result = SourceResultInfoSchema.parse(input);
    expect(result.sourceSlug).toBe("phillips");
    // resolutionStage/resolutionEvidence are optional and undefined when absent
    expect(result.resolutionStage).toBeUndefined();
    expect(result.resolutionEvidence).toBeUndefined();
  });

  it("parses source result with optional resolutionStage", () => {
    const input = {
      sourceSlug: "phillips",
      sourceType: "distributor",
      confidence: 0.95,
      outcome: "found",
      resolutionStage: "distributor",
      resolutionEvidence: [
        {
          kind: "distributor_exact_upc",
          confidence: 0.95,
          expectedUpc: "0733053005941",
        },
      ],
    };

    const result = SourceResultInfoSchema.parse(input);
    expect(result.resolutionStage).toBe("distributor");
    expect(result.resolutionEvidence).toHaveLength(1);
    expect(result.resolutionEvidence![0].kind).toBe("distributor_exact_upc");
  });

  it("parses source result with null resolutionEvidence", () => {
    const input = {
      sourceSlug: "phillips",
      sourceType: "distributor",
      confidence: 0.95,
      outcome: "found",
      resolutionStage: null,
      resolutionEvidence: null,
    };

    const result = SourceResultInfoSchema.parse(input);
    expect(result.resolutionStage).toBeNull();
    expect(result.resolutionEvidence).toBeNull();
  });

  it("round-trips through JSON without resolution fields", () => {
    const input = {
      sourceSlug: "phillips",
      sourceType: "distributor",
      confidence: 0.95,
      outcome: "found",
    };

    const parsed = SourceResultInfoSchema.parse(input);
    const json = JSON.parse(JSON.stringify(parsed));
    expect(json.sourceSlug).toBe("phillips");
  });
});

describe("determineV2Status", () => {
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
    };
  }

  it("returns needs_attention for empty source results", () => {
    expect(determineV2Status([], "0733053005941")).toBe("needs_attention");
  });

  it("returns needs_attention for not_stocked outcomes", () => {
    const sources = [
      makeSr({ outcome: "not_stocked", confidence: 0, product: {} }),
    ];
    expect(determineV2Status(sources, "0733053005941")).toBe("needs_attention");
  });

  it("returns processed for strong found with exact UPC", () => {
    const sources = [
      makeSr({
        outcome: "found",
        confidence: 0.96,
        product: { upc: "0733053005941" },
      }),
    ];
    expect(determineV2Status(sources, "0733053005941")).toBe("processed");
  });

  it("returns needs_attention for found without strong confidence", () => {
    const sources = [
      makeSr({
        outcome: "found",
        confidence: 0.5,
        product: { upc: "0733053005941" },
      }),
    ];
    expect(determineV2Status(sources, "0733053005941")).toBe("needs_attention");
  });

  it("returns needs_attention for found with wrong UPC", () => {
    const sources = [
      makeSr({
        outcome: "found",
        confidence: 0.96,
        product: { upc: "123456789012" }, // different UPC
      }),
    ];
    expect(determineV2Status(sources, "0733053005941")).toBe("needs_attention");
  });

  it("treats high confidence found without UPC product data as needs_attention", () => {
    const sources = [
      makeSr({
        outcome: "found",
        confidence: 0.96,
        product: { name: "Product", brand: "Brand" },
      }),
    ];
    expect(determineV2Status(sources, "0733053005941")).toBe("needs_attention");
  });

  it("compares UPCs by zero-padding to 14 digits", () => {
    // GTIN-12 "733053005941" should match GTIN-13 "0733053005941"
    const sources = [
      makeSr({
        outcome: "found",
        confidence: 0.96,
        product: { upc: "733053005941" },
      }),
    ];
    expect(determineV2Status(sources, "0733053005941")).toBe("processed");
  });
});

describe("Legacy vs V2 behavior comparison", () => {
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
    };
  }

  it("legacy: any found → processed (even without UPC proof)", () => {
    const sources = [
      makeSr({
        outcome: "found",
        confidence: 0.6,
        product: { name: "Product Name" }, // no UPC
      }),
    ];
    const outcomes = sources.map((sr) => normalizeSourceOutcome(sr.outcome));
    expect(determineFinalStatus(outcomes)).toBe("processed");
  });

  it("V2: found without strong UPC proof → needs_attention", () => {
    const sources = [
      makeSr({
        outcome: "found",
        confidence: 0.6,
        product: { name: "Product Name" }, // no UPC
      }),
    ];
    expect(determineV2Status(sources, "0733053005941")).toBe("needs_attention");
  });

  it("legacy: all not_stocked → processed", () => {
    const sources = [
      makeSr({ outcome: "not_stocked", confidence: 0, product: {} }),
      makeSr({ outcome: "not_stocked", confidence: 0, product: {} }),
    ];
    const outcomes = sources.map((sr) => normalizeSourceOutcome(sr.outcome));
    expect(determineFinalStatus(outcomes)).toBe("processed");
  });

  it("V2: all not_stocked → needs_attention", () => {
    const sources = [
      makeSr({ outcome: "not_stocked", confidence: 0, product: {} }),
      makeSr({ outcome: "not_stocked", confidence: 0, product: {} }),
    ];
    expect(determineV2Status(sources, "0733053005941")).toBe("needs_attention");
  });
});

describe("isUpcResolutionV2Enabled", () => {
  it("returns true for upc_resolution_policy=proof_required", () => {
    expect(isUpcResolutionV2Enabled({ upc_resolution_policy: "proof_required" })).toBe(true);
  });

  it("returns true for upc_resolution_v2=true", () => {
    expect(isUpcResolutionV2Enabled({ upc_resolution_v2: true })).toBe(true);
  });

  it("returns false for undefined config", () => {
    expect(isUpcResolutionV2Enabled(undefined)).toBe(false);
    expect(isUpcResolutionV2Enabled(null)).toBe(false);
  });

  it("returns false for empty config", () => {
    expect(isUpcResolutionV2Enabled({})).toBe(false);
  });

  it("returns false for legacy policy value", () => {
    expect(isUpcResolutionV2Enabled({ upc_resolution_policy: "legacy" })).toBe(false);
  });
});
