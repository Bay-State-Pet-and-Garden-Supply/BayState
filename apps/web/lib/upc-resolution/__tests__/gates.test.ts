/**
 * Tests for UPC resolution evidence gates.
 *
 * Covers evidence classification, acceptance checks, publish guard,
 * and pipeline status hints.
 */

import {
  classifySourceEvidence,
  isAcceptedEvidence,
  isAcceptedProof,
  isResolutionPublishable,
  resolutionToPipelineStatusHint,
  confidenceInRange,
} from "../gates";
import { compareGtin } from "../upc";
import type { SourceResultInfo } from "@/lib/scraper-callback/enrichment-result";

// Helper to build a minimal source result
function makeSourceResult(overrides: Partial<SourceResultInfo> = {}): SourceResultInfo {
  return {
    sourceSlug: "test-source",
    sourceType: overrides.sourceType ?? "distributor",
    confidence: overrides.confidence ?? 0.95,
    matchedFields: overrides.matchedFields ?? ["name", "brand"],
    evidenceUrl: overrides.evidenceUrl ?? "https://example.com/product",
    product: overrides.product ?? { upc: "042100005264" }, // valid GTIN-12
    outcome: overrides.outcome ?? "found",
    attempted_at: overrides.attempted_at ?? "2026-06-24T00:00:00Z",
    resolutionStage: overrides.resolutionStage ?? null,
    resolutionEvidence: overrides.resolutionEvidence ?? null,
  };
}

describe("classifySourceEvidence", () => {
  // Valid GTIN-12 for UPC proof tests
  const expectedUpc = "042100005264";

  it("classifies distributor exact UPC match as accepted proof", () => {
    const sr = makeSourceResult({
      sourceType: "distributor",
      outcome: "found",
      confidence: 0.96,
      product: { upc: "042100005264" },
    });

    const evidence = classifySourceEvidence(sr, { expectedUpc });
    expect(evidence.kind).toBe("distributor_exact_upc");
    expect(isAcceptedEvidence(evidence)).toBe(true);
    expect(evidence.confidence).toBe(0.96);
    expect(evidence.gate).toBe("exact_upc_match:accepted");
  });

  it("classifies official brand exact UPC match", () => {
    const sr = makeSourceResult({
      sourceType: "official_brand",
      outcome: "found",
      confidence: 0.98,
      product: { upc: "042100005264" },
    });

    const evidence = classifySourceEvidence(sr, { expectedUpc, stage: "official_brand" });
    expect(evidence.kind).toBe("official_exact_upc");
    expect(isAcceptedEvidence(evidence)).toBe(true);
  });

  it("classifies SERP exact UPC match", () => {
    const sr = makeSourceResult({
      sourceType: "serp",
      outcome: "found",
      confidence: 0.87,
      product: { upc: "042100005264" },
    });

    const evidence = classifySourceEvidence(sr, { expectedUpc, stage: "serp" });
    expect(evidence.kind).toBe("serp_exact_upc");
    expect(isAcceptedEvidence(evidence)).toBe(true);
  });

  it("classifies not_stocked outcome as no_upc_evidence", () => {
    const sr = makeSourceResult({
      outcome: "not_stocked",
      confidence: 0,
      product: {},
    });

    const evidence = classifySourceEvidence(sr, { expectedUpc });
    expect(evidence.kind).toBe("no_upc_evidence");
    expect(isAcceptedEvidence(evidence)).toBe(false);
    expect(evidence.gate).toBe("outcome:not_stocked");
  });

  it("classifies source_error outcome as no_upc_evidence", () => {
    const sr = makeSourceResult({
      outcome: "source_error",
      confidence: 0,
      product: {},
    });

    const evidence = classifySourceEvidence(sr, { expectedUpc });
    expect(evidence.kind).toBe("no_upc_evidence");
    expect(isAcceptedEvidence(evidence)).toBe(false);
    expect(evidence.gate).toBe("outcome:source_error");
  });

  it("classifies skipped outcome as no_upc_evidence", () => {
    const sr = makeSourceResult({
      outcome: "skipped",
      confidence: 0,
      product: {},
    });

    const evidence = classifySourceEvidence(sr, { expectedUpc });
    expect(evidence.kind).toBe("no_upc_evidence");
    expect(isAcceptedEvidence(evidence)).toBe(false);
  });

  it("classifies found without UPC match as candidate_below_gate", () => {
    const sr = makeSourceResult({
      outcome: "found",
      confidence: 0.85,
      product: { name: "Some Product", brand: "Some Brand" }, // no UPC
    });

    const evidence = classifySourceEvidence(sr, { expectedUpc });
    expect(evidence.kind).toBe("candidate_below_gate");
    expect(isAcceptedEvidence(evidence)).toBe(false);
  });

  it("classifies conflicting UPC as conflicting_upc", () => {
    const sr = makeSourceResult({
      outcome: "found",
      confidence: 0.9,
      product: { upc: "1234567890123" }, // different UPC
    });

    const evidence = classifySourceEvidence(sr, { expectedUpc });
    expect(evidence.kind).toBe("conflicting_upc");
    expect(isAcceptedEvidence(evidence)).toBe(false);
  });

  it("classifies official high confidence without UPC correctly", () => {
    const sr = makeSourceResult({
      sourceType: "official_brand",
      outcome: "found",
      confidence: 0.92,
      product: { name: "Official Product", brand: "Official Brand" }, // no UPC
    });

    const evidence = classifySourceEvidence(sr, {
      expectedUpc,
      stage: "official_brand",
    });
    expect(evidence.kind).toBe("official_high_confidence_no_upc");
    expect(isAcceptedEvidence(evidence)).toBe(true);
  });

  it("classifies VLM packaging exact UPC match", () => {
    const sr = makeSourceResult({
      sourceType: "vlm_packaging",
      outcome: "found",
      confidence: 0.96,
      product: { upc: "042100005264" },
    });

    const evidence = classifySourceEvidence(sr, {
      expectedUpc,
      stage: "vlm_packaging",
    });
    expect(evidence.kind).toBe("packaging_vlm_exact_upc");
    expect(isAcceptedEvidence(evidence)).toBe(true);
  });

  it("categorizes found with exact UPC but failed check digit as candidate_below_gate", () => {
    const sr = makeSourceResult({
      outcome: "found",
      confidence: 0.95,
      product: { upc: "042100005265" }, // valid digits but wrong check digit (should be 4)
    });

    const evidence = classifySourceEvidence(sr, {
      expectedUpc: "042100005265",
    });
    // This has exact match (digits identical) but check digit is wrong
    expect(evidence.kind).toBe("candidate_below_gate");
    expect(evidence.gate).toBe("exact_upc_match_but_check_digit_failed");
  });

  describe("facet-shaped product evidence", () => {
    it("extracts UPC from facets and classifies as accepted proof", () => {
      const sr = makeSourceResult({
        sourceType: "distributor",
        outcome: "found",
        confidence: 0.96,
        product: {
          name: "Product Name",
          facets: [
            { definition_slug: "upc", value: "042100005264" },
            { definition_slug: "brand", value: "BrandName" },
          ],
        },
      });

      const evidence = classifySourceEvidence(sr, { expectedUpc });
      expect(evidence.kind).toBe("distributor_exact_upc");
      expect(isAcceptedEvidence(evidence)).toBe(true);
    });

    it("extracts from facet with name=barcode", () => {
      const sr = makeSourceResult({
        sourceType: "distributor",
        outcome: "found",
        confidence: 0.96,
        product: {
          facets: [
            { name: "barcode", value: "042100005264" },
          ],
        },
      });

      const evidence = classifySourceEvidence(sr, { expectedUpc });
      expect(evidence.kind).toBe("distributor_exact_upc");
      expect(isAcceptedEvidence(evidence)).toBe(true);
    });

    it("extracts from top-level upc even when facets also present", () => {
      const sr = makeSourceResult({
        sourceType: "distributor",
        outcome: "found",
        confidence: 0.96,
        product: {
          upc: "042100005264",
          facets: [
            { definition_slug: "upc", value: "123456789012" },
          ],
        },
      });

      const evidence = classifySourceEvidence(sr, { expectedUpc });
      expect(evidence.kind).toBe("distributor_exact_upc");
    });

    it("handles nested core.facets product shape", () => {
      const sr = makeSourceResult({
        sourceType: "distributor",
        outcome: "found",
        confidence: 0.96,
        product: {
          core: {
            name: "Product Name",
            facets: [
              { definition_slug: "upc", value: "042100005264" },
            ],
          },
        },
      });

      // faceted data is nested under core, not top-level — gates reads top-level only
      const evidence = classifySourceEvidence(sr, { expectedUpc });
      // Should still find it because top-level upc/gtin is empty and facets at top-level
      // This core.facets is NOT accessible via extractObservedGtin at the top level
      expect(evidence.kind).toBe("candidate_below_gate");
      expect(isAcceptedEvidence(evidence)).toBe(false);
    });
  });

  describe("leading-zero GTIN equivalence", () => {
    it("uses compareGtin for identity (zero-padded), check digit for acceptance", () => {
      // GTIN-13 "0733053005941" and GTIN-12 "733053005941" represent the same
      // product identifier — compareGtin(padStart(14, '0')) makes both
      // "00733053005941". However "0733053005941" has an invalid GTIN-13
      // check digit (should be 3, actual is 1), so the proof is rejected at
      // the check-digit gate, producing candidate_below_gate.
      //
      // This is CORRECT per ADR 0006: accepted proof requires valid check digit.
      // The identity comparison (exactUpcMatch) uses compareGtin equivalence,
      // but acceptance requires validateGtinCheckDigit on the observed value.
      const sr = makeSourceResult({
        sourceType: "distributor",
        outcome: "found",
        confidence: 0.96,
        product: { gtin: "0733053005941" }, // GTIN-13 — valid identity but invalid check digit
      });

      const evidence = classifySourceEvidence(sr, {
        expectedUpc: "733053005941", // GTIN-12 (same product digits, no leading zero)
      });
      // Identity matches but check digit fails → candidate_below_gate
      expect(evidence.kind).toBe("candidate_below_gate");
      expect(evidence.gate).toBe("exact_upc_match_but_check_digit_failed");
      expect(isAcceptedEvidence(evidence)).toBe(false);
    });

    it("matches identical standard GTIN via compareGtin", () => {
      const sr = makeSourceResult({
        sourceType: "serp",
        outcome: "found",
        confidence: 0.87,
        product: { gtin: "042100005264" }, // GTIN-12
      });

      const evidence = classifySourceEvidence(sr, {
        expectedUpc: "042100005264",
        stage: "serp",
      });
      expect(evidence.kind).toBe("serp_exact_upc");
      expect(isAcceptedEvidence(evidence)).toBe(true);
    });

    it("compareGtin utility handles leading-zero equivalence", () => {
      // GTIN-13 and GTIN-12 with same data digits (leading-zero diff)
      expect(compareGtin("0733053005941", "733053005941")).toBe(true);
      // Different GTINs
      expect(compareGtin("0733053005941", "042100005264")).toBe(false);
    });

    it("does not match different GTIN-13 that happens to share prefix digits", () => {
      const sr = makeSourceResult({
        sourceType: "distributor",
        outcome: "found",
        confidence: 0.96,
        product: { gtin: "4901234567890" }, // completely different GTIN-13
      });

      const evidence = classifySourceEvidence(sr, { expectedUpc });
      expect(evidence.kind).toBe("conflicting_upc");
      expect(isAcceptedEvidence(evidence)).toBe(false);
    });
  });

  describe("stage normalization", () => {
    it("resolves stage from sourceResult.resolutionStage when no override", () => {
      const sr = makeSourceResult({
        sourceType: "distributor",
        resolutionStage: "licensed",
        outcome: "found",
        confidence: 0.88,
        product: { upc: "042100005264" },
      });

      const evidence = classifySourceEvidence(sr, { expectedUpc });
      expect(evidence.stage).toBe("licensed");
      expect(evidence.kind).toBe("licensed_exact_upc");
    });

    it("stageOverride takes highest priority", () => {
      const sr = makeSourceResult({
        sourceType: "serp",
        resolutionStage: "serp",
        outcome: "found",
        confidence: 0.87,
        product: { upc: "042100005264" },
      });

      const evidence = classifySourceEvidence(sr, {
        expectedUpc,
        stage: "official_brand",
      });
      expect(evidence.stage).toBe("official_brand");
      expect(evidence.kind).toBe("official_exact_upc");
    });

    it("falls back to normalizeStage when no override or resolutionStage", () => {
      const sr = makeSourceResult({
        sourceType: "serp_discovery", // should normalize to "serp"
        outcome: "found",
        confidence: 0.87,
        product: { upc: "042100005264" },
      });

      const evidence = classifySourceEvidence(sr, { expectedUpc });
      expect(evidence.stage).toBe("serp");
      expect(evidence.kind).toBe("serp_exact_upc");
    });

    it("normalizes licensed_feed to licensed", () => {
      const sr = makeSourceResult({
        sourceType: "licensed_feed",
        outcome: "found",
        confidence: 0.88,
        product: { upc: "042100005264" },
      });

      const evidence = classifySourceEvidence(sr, { expectedUpc });
      expect(evidence.stage).toBe("licensed");
      expect(evidence.kind).toBe("licensed_exact_upc");
    });
  });

  describe("official_brand vs SERP no-UPC", () => {
    it("official_brand high-confidence without UPC is accepted", () => {
      const sr = makeSourceResult({
        sourceType: "official_brand",
        outcome: "found",
        confidence: 0.92,
        product: { name: "Official Product", brand: "Brand" },
      });

      const evidence = classifySourceEvidence(sr, {
        expectedUpc,
        stage: "official_brand",
      });
      expect(evidence.kind).toBe("official_high_confidence_no_upc");
      expect(isAcceptedEvidence(evidence)).toBe(true);
    });

    it("SERP without exact UPC is NOT accepted (candidate_below_gate)", () => {
      const sr = makeSourceResult({
        sourceType: "serp",
        outcome: "found",
        confidence: 0.92,
        product: { name: "Some Product", brand: "Brand" },
      });

      const evidence = classifySourceEvidence(sr, {
        expectedUpc,
        stage: "serp",
      });
      expect(evidence.kind).toBe("candidate_below_gate");
      expect(isAcceptedEvidence(evidence)).toBe(false);
    });

    it("official_brand low-confidence without UPC is candidate_below_gate", () => {
      const sr = makeSourceResult({
        sourceType: "official_brand",
        outcome: "found",
        confidence: 0.5,
        product: { name: "Official Product", brand: "Brand" },
      });

      const evidence = classifySourceEvidence(sr, {
        expectedUpc,
        stage: "official_brand",
      });
      expect(evidence.kind).toBe("candidate_below_gate");
      expect(isAcceptedEvidence(evidence)).toBe(false);
    });
  });
});

describe("isAcceptedProof", () => {
  it("returns true for distributor_exact_upc", () => {
    expect(isAcceptedProof("distributor_exact_upc")).toBe(true);
  });

  it("returns true for manual_override", () => {
    expect(isAcceptedProof("manual_override")).toBe(true);
  });

  it("returns false for candidate_below_gate", () => {
    expect(isAcceptedProof("candidate_below_gate")).toBe(false);
  });

  it("returns false for conflicting_upc", () => {
    expect(isAcceptedProof("conflicting_upc")).toBe(false);
  });

  it("returns false for no_upc_evidence", () => {
    expect(isAcceptedProof("no_upc_evidence")).toBe(false);
  });
});

describe("isResolutionPublishable", () => {
  it("returns true for confirmed", () => {
    expect(isResolutionPublishable("confirmed")).toBe(true);
  });

  it("returns true for manual_override", () => {
    expect(isResolutionPublishable("manual_override")).toBe(true);
  });

  it("returns true for private_label", () => {
    expect(isResolutionPublishable("private_label")).toBe(true);
  });

  it("returns false for unresolved", () => {
    expect(isResolutionPublishable("unresolved")).toBe(false);
  });

  it("returns false for candidate", () => {
    expect(isResolutionPublishable("candidate")).toBe(false);
  });

  it("returns false for conflict", () => {
    expect(isResolutionPublishable("conflict")).toBe(false);
  });
});

describe("resolutionToPipelineStatusHint", () => {
  it("returns processed for confirmed", () => {
    expect(resolutionToPipelineStatusHint("confirmed", true)).toBe("processed");
    expect(resolutionToPipelineStatusHint("confirmed", false)).toBe("processed");
  });

  it("returns needs_attention for unresolved with no found", () => {
    expect(resolutionToPipelineStatusHint("unresolved", false)).toBe("needs_attention");
  });

  it("returns needs_attention for conflict", () => {
    expect(resolutionToPipelineStatusHint("conflict", true)).toBe("needs_attention");
  });

  it("returns needs_attention for candidate", () => {
    expect(resolutionToPipelineStatusHint("candidate", true)).toBe("needs_attention");
  });
});

describe("confidenceInRange", () => {
  it("validates distributor_exact_upc range", () => {
    expect(confidenceInRange("distributor_exact_upc", 0.95)).toBe(true);
    expect(confidenceInRange("distributor_exact_upc", 0.98)).toBe(true);
    expect(confidenceInRange("distributor_exact_upc", 0.94)).toBe(false);
    expect(confidenceInRange("distributor_exact_upc", 0.99)).toBe(false);
  });

  it("validates official_exact_upc range", () => {
    expect(confidenceInRange("official_exact_upc", 0.98)).toBe(true);
    expect(confidenceInRange("official_exact_upc", 0.97)).toBe(false);
  });
});
