/**
 * Extraction Progress Route Tests
 *
 * Tests for POST /api/admin/pipeline/extraction-progress
 */

jest.mock('next/server', () => require('@/__tests__/helpers/next-server'));
jest.mock('@/lib/admin/api-auth', () => ({
  requireAdminAuth: jest.fn().mockResolvedValue({
    authorized: true,
    user: { id: "admin-1", email: "admin@test.com" },
  }),
}));

const { NextRequest, NextResponse } = require("next/server");
const { requireAdminAuth } = require("@/lib/admin/api-auth");

// Mock Supabase admin client
const mockFrom = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn().mockResolvedValue({
    from: mockFrom,
  }),
}));

const { POST } = require("@/app/api/admin/pipeline/extraction-progress/route");

function buildRequest(body: unknown): any {
  return new NextRequest("http://localhost/api/admin/pipeline/extraction-progress", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/admin/pipeline/extraction-progress", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock: both tables return empty
    mockFrom.mockImplementation((table: string) => {
      if (table === "enrichment_attempts") {
        return {
          select: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === "enrichment_source_attempts") {
        return {
          select: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return { select: jest.fn().mockReturnThis(), in: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [], error: null }) };
    });
  });

  it("returns 400 when upcs is missing", async () => {
    const response = await POST(buildRequest({}));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("upcs array is required");
  });

  it("returns 400 when upcs is empty", async () => {
    const response = await POST(buildRequest({ upcs: [] }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("upcs array is required");
  });

  it("returns 400 when upcs exceeds 500", async () => {
    const response = await POST(buildRequest({ upcs: new Array(501).fill("UPC-1") }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("500");
  });

  it("returns progress for UPCs with no attempts", async () => {
    const response = await POST(buildRequest({ upcs: ["UPC-1", "UPC-2"] }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.progress).toBeDefined();
    expect(body.progress["UPC-1"]).toEqual({
      attemptStatus: null,
      claimed: false,
      runnerName: null,
      sourceCounts: { found: 0, not_stocked: 0, source_error: 0, skipped: 0 },
      totalSources: 0,
      sourceOutcomes: [],
    });
    expect(body.progress["UPC-2"]).toEqual({
      attemptStatus: null,
      claimed: false,
      runnerName: null,
      sourceCounts: { found: 0, not_stocked: 0, source_error: 0, skipped: 0 },
      totalSources: 0,
      sourceOutcomes: [],
    });
  });

  it("includes enrichment attempt data when available", async () => {
    const attemptResolve = {
      data: [
        { upc: "UPC-1", status: "running", claimed_by: "runner-1", lease_token: "tok-1", attempt_number: 1 },
      ],
      error: null,
    };
    const sourceResolve = {
      data: [
        { upc: "UPC-1", source_slug: "phillips", outcome: "found", attempted_at: "2026-06-14T00:00:00Z", error_message: null },
        { upc: "UPC-1", source_slug: "orgill", outcome: "source_error", attempted_at: "2026-06-14T00:01:00Z", error_message: "Connection timeout" },
      ],
      error: null,
    };

    const attemptQuery: Record<string, jest.Mock> = { select: jest.fn(), in: jest.fn(), order: jest.fn() };
    attemptQuery.select.mockReturnValue(attemptQuery);
    attemptQuery.in.mockReturnValue(attemptQuery);
    attemptQuery.order.mockResolvedValue(attemptResolve);

    const sourceQuery: Record<string, jest.Mock> = { select: jest.fn(), in: jest.fn(), order: jest.fn() };
    sourceQuery.select.mockReturnValue(sourceQuery);
    sourceQuery.in.mockReturnValue(sourceQuery);
    sourceQuery.order.mockResolvedValue(sourceResolve);

    mockFrom.mockImplementation((table: string) => {
      if (table === "enrichment_attempts") return attemptQuery;
      if (table === "enrichment_source_attempts") return sourceQuery;
      return { select: jest.fn().mockReturnThis(), in: jest.fn().mockResolvedValue({ data: [], error: null }), order: jest.fn().mockReturnThis() };
    });

    const response = await POST(buildRequest({ upcs: ["UPC-1"] }));
    expect(response.status).toBe(200);
    const body = await response.json();
    const progress = body.progress["UPC-1"];

    expect(progress.attemptStatus).toBe("running");
    expect(progress.claimed).toBe(true);
    expect(progress.runnerName).toBe("runner-1");
    expect(progress.sourceCounts).toEqual({
      found: 1,
      not_stocked: 0,
      source_error: 1,
      skipped: 0,
    });
    expect(progress.totalSources).toBe(2);
    expect(progress.sourceOutcomes).toHaveLength(2);
  });

  it("handles database error gracefully", async () => {
    mockFrom.mockImplementation((table: string) => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockRejectedValue(new Error("DB connection failed")),
    }));

    const response = await POST(buildRequest({ upcs: ["UPC-1"] }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });
});

export {};
