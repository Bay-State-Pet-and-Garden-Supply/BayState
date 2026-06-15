/**
 * Tests for enrichment-result.ts helpers
 *
 * Covers:
 * - Zod schema parsing of runner payload
 * - Source outcome normalization
 * - Per-sourceSlug payload building
 * - Source attempt row building
 * - ADR 0002 found-wins status decisions
 */

import {
  EnrichmentResultV1Schema,
  normalizeSourceOutcome,
  buildCanonicalSourcePayload,
  buildSourcePayloadsByUpc,
  buildSourceAttemptRows,
  determineFinalStatus,
  determineStatusFromSourceResults,
} from "@/lib/scraper-callback/enrichment-result";

// =============================================================================
// Schema Tests
// =============================================================================

describe("EnrichmentResultV1Schema", () => {
  const validPayload = {
    _attempt_id: "550e8400-e29b-41d4-a716-446655440000",
    _lease_token: "660e8400-e29b-41d4-a716-446655440001",
    upc: "072705115310",
    source: { url: "https://example.com/product", domain: "example.com" },
    status: "success",
    extracted_at: "2026-06-14T12:00:00Z",
    product: { name: "Test Product", brand: "Test Brand" },
    confidence: { overall: 0.95, fields: { name: 0.9 } },
    source_results: [
      {
        sourceSlug: "phillips",
        sourceType: "distributor",
        confidence: 0.85,
        outcome: "found",
        product: { name: "Test Product", description: "A test product" },
        matchedFields: ["name", "description"],
      },
      {
        sourceSlug: "orgill",
        sourceType: "distributor",
        confidence: 0.0,
        outcome: "not_stocked",
      },
    ],
  };

  it("parses a valid enrichment result payload", () => {
    const result = EnrichmentResultV1Schema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.upc).toBe("072705115310");
      expect(result.data._attempt_id).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(result.data.source_results).toHaveLength(2);
      expect(result.data.source_results[0].sourceSlug).toBe("phillips");
    }
  });

  it("parses a payload with minimal fields", () => {
    const minimal = {
      _attempt_id: "550e8400-e29b-41d4-a716-446655440000",
      upc: "072705115310",
      source: { url: "https://example.com" },
      status: "failed",
      extracted_at: "2026-06-14T12:00:00Z",
    };
    const result = EnrichmentResultV1Schema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schema_version).toBe("v1");
      expect(result.data.mode).toBe("mixed");
      expect(result.data.confidence.overall).toBe(0);
      expect(result.data.source_results).toEqual([]);
    }
  });

  it("parses a failed payload with null source domain", () => {
    const failed = {
      _attempt_id: "550e8400-e29b-41d4-a716-446655440000",
      upc: "072705115310",
      source: { url: "approved_source_extraction", domain: null },
      status: "failed",
      extracted_at: "2026-06-14T12:00:00Z",
      product: {},
      confidence: { overall: 0, fields: {} },
      validation: { warnings: ["No approved URL found"], missing_required: [] },
      attempts: [],
      source_results: [],
    };
    const result = EnrichmentResultV1Schema.safeParse(failed);
    expect(result.success).toBe(true);
  });

  it("rejects payload without _attempt_id", () => {
    const noAttempt = {
      upc: "072705115310",
      source: { url: "https://example.com" },
      status: "success",
      extracted_at: "2026-06-14T12:00:00Z",
    };
    const result = EnrichmentResultV1Schema.safeParse(noAttempt);
    expect(result.success).toBe(false);
  });

  it("rejects invalid status", () => {
    const invalid = {
      _attempt_id: "550e8400-e29b-41d4-a716-446655440000",
      upc: "072705115310",
      source: { url: "https://example.com" },
      status: "unknown_status",
      extracted_at: "2026-06-14T12:00:00Z",
    };
    const result = EnrichmentResultV1Schema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Outcome Normalization Tests
// =============================================================================

describe("normalizeSourceOutcome", () => {
  it("passes through found", () => {
    expect(normalizeSourceOutcome("found")).toBe("found");
  });

  it("passes through not_stocked", () => {
    expect(normalizeSourceOutcome("not_stocked")).toBe("not_stocked");
  });

  it("passes through source_error", () => {
    expect(normalizeSourceOutcome("source_error")).toBe("source_error");
  });

  it("passes through skipped", () => {
    expect(normalizeSourceOutcome("skipped")).toBe("skipped");
  });

  it("maps null to found (Amazon/marketplace null-outcome pattern)", () => {
    expect(normalizeSourceOutcome(null)).toBe("found");
  });

  it("maps undefined to found (null/undefined outcome pattern)", () => {
    expect(normalizeSourceOutcome(undefined)).toBe("found");
  });

  it("maps empty string to skipped", () => {
    expect(normalizeSourceOutcome("")).toBe("skipped");
  });

  it("maps unknown string to skipped", () => {
    expect(normalizeSourceOutcome("unknown")).toBe("skipped");
  });

  it("is case-insensitive", () => {
    expect(normalizeSourceOutcome("FOUND")).toBe("found");
    expect(normalizeSourceOutcome("Source_Error")).toBe("source_error");
  });
});

// =============================================================================
// Canonical Source Payload Tests
// =============================================================================

describe("buildCanonicalSourcePayload", () => {
  it("builds a flat payload from source result with core fields", () => {
    const sr = {
      sourceSlug: "phillips",
      sourceType: "distributor",
      confidence: 0.85,
      outcome: "found",
      matchedFields: ["name", "description"],
      evidenceUrl: "https://phillips.com/product/123",
      product: {
        name: "Test Product",
        brand_name: "Test Brand",
        description: "A test product",
        core: {
          name: "Test Product",
          brand_name: "Test Brand",
          description: "A test product",
          weight_lbs: 5.0,
        },
        facets: [
          { definition_slug: "flavor", value: "Chicken" },
        ],
        media: [{ url: "https://example.com/img.jpg" }],
      },
    } as any;

    const payload = buildCanonicalSourcePayload(sr);

    expect(payload._source_slug).toBe("phillips");
    expect(payload._source_type).toBe("distributor");
    expect(payload.name).toBe("Test Product");
    expect(payload.brand_name).toBe("Test Brand");
    expect(payload.description).toBe("A test product");
    expect(payload.weight_lbs).toBe(5.0);
    expect(payload.core).toBeDefined();
    expect(payload.facets).toBeDefined();
    expect(payload.media).toBeDefined();
    expect(payload.flavor).toBe("Chicken"); // extracted from facets
    expect(payload._evidence_url).toBe("https://phillips.com/product/123");
  });

  it("handles empty source result gracefully", () => {
    const sr = {
      sourceSlug: "orgill",
      sourceType: "distributor",
      confidence: 0,
      outcome: "not_stocked",
      product: null,
      matchedFields: [],
    } as any;

    const payload = buildCanonicalSourcePayload(sr);
    expect(payload._source_slug).toBe("orgill");
    expect(payload.name).toBeUndefined();
  });
});

// =============================================================================
// Source Payloads by UPC Tests
// =============================================================================

describe("buildSourcePayloadsByUpc", () => {
  it("includes found sources and not_stocked sources", () => {
    const results = [
      {
        sourceSlug: "phillips",
        sourceType: "distributor",
        confidence: 0.85,
        outcome: "found",
        product: { name: "Test" },
        matchedFields: ["name"],
      },
      {
        sourceSlug: "orgill",
        sourceType: "distributor",
        confidence: 0,
        outcome: "not_stocked",
      },
      {
        sourceSlug: "bad-source",
        sourceType: "distributor",
        confidence: 0,
        outcome: "source_error",
      },
    ] as any[];

    const payloads = buildSourcePayloadsByUpc(results);

    expect(Object.keys(payloads)).toHaveLength(2); // found + not_stocked, NOT the errored source
    expect(payloads.phillips).toBeDefined();
    expect(payloads.orgill).toBeDefined();
    expect(payloads["bad-source"]).toBeUndefined();
  });
});

// =============================================================================
// Source Attempt Row Tests
// =============================================================================

describe("buildSourceAttemptRows", () => {
  it("builds correct rows for source results", () => {
    const results = [
      {
        sourceSlug: "phillips",
        sourceType: "distributor",
        confidence: 0.85,
        outcome: "found",
        matchedFields: ["name", "description"],
        evidenceUrl: "https://phillips.com/p/1",
        product: { name: "Test" },
      },
      {
        sourceSlug: "orgill",
        sourceType: "distributor",
        confidence: 0,
        outcome: "source_error",
        error_code: "auth_expired",
        error_message: "Credentials expired",
      },
    ] as any[];

    const rows = buildSourceAttemptRows(
      "attempt-1",
      "job-1",
      "072705115310",
      "brand-1",
      results,
    );

    expect(rows).toHaveLength(2);

    expect(rows[0].attempt_id).toBe("attempt-1");
    expect(rows[0].job_id).toBe("job-1");
    expect(rows[0].upc).toBe("072705115310");
    expect(rows[0].brand_id).toBe("brand-1");
    expect(rows[0].source_slug).toBe("phillips");
    expect(rows[0].outcome).toBe("found");
    expect(rows[0].confidence).toBe(0.85);
    expect(rows[0].matched_fields).toEqual(["name", "description"]);
    expect(rows[0].evidence_url).toBe("https://phillips.com/p/1");

    expect(rows[1].source_slug).toBe("orgill");
    expect(rows[1].outcome).toBe("source_error");
    expect(rows[1].error_code).toBe("auth_expired");
    expect(rows[1].error_message).toBe("Credentials expired");
  });
});

// =============================================================================
// Final Status Decision Tests (ADR 0002 Found-Wins)
// =============================================================================

describe("determineFinalStatus", () => {
  it("returns processed when any source found", () => {
    expect(determineFinalStatus(["found", "not_stocked", "source_error"])).toBe("processed");
    expect(determineFinalStatus(["found"])).toBe("processed");
    expect(determineFinalStatus(["found", "found"])).toBe("processed");
  });

  it("returns needs_attention when no found and any error", () => {
    expect(determineFinalStatus(["source_error", "not_stocked"])).toBe("needs_attention");
    expect(determineFinalStatus(["source_error"])).toBe("needs_attention");
    expect(determineFinalStatus(["skipped", "source_error"])).toBe("needs_attention");
  });

  it("returns processed when all clean not_stocked", () => {
    expect(determineFinalStatus(["not_stocked", "not_stocked"])).toBe("processed");
    expect(determineFinalStatus(["not_stocked"])).toBe("processed");
  });

  it("returns processed when all skipped (empty cascade)", () => {
    expect(determineFinalStatus(["skipped", "skipped"])).toBe("processed");
  });

  it("returns processed when no outcomes provided", () => {
    expect(determineFinalStatus([])).toBe("processed");
  });

  it("found wins over errors (ADR 0002 found-wins rule)", () => {
    expect(determineFinalStatus(["found", "source_error"])).toBe("processed");
    expect(determineFinalStatus(["found", "source_error", "not_stocked"])).toBe("processed");
  });
});

describe("determineStatusFromSourceResults", () => {
  it("works end-to-end with source results", () => {
    const results = [
      { sourceSlug: "a", sourceType: "distributor", outcome: "found", confidence: 0.9 },
      { sourceSlug: "b", sourceType: "distributor", outcome: "source_error" },
    ] as any[];

    expect(determineStatusFromSourceResults(results)).toBe("processed");
  });

  it("needs_attention for all errors", () => {
    const results = [
      { sourceSlug: "a", sourceType: "distributor", outcome: "source_error" },
    ] as any[];

    expect(determineStatusFromSourceResults(results)).toBe("needs_attention");
  });
});
