import { TextEncoder, TextDecoder } from "util";

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

if (typeof ReadableStream === "undefined") {
  // @ts-ignore
  const { ReadableStream } = require("stream/web");
  global.ReadableStream = ReadableStream;
}

jest.mock("next/server", () => {
  return {
    NextRequest: class {
      nextUrl: URL;
      constructor(url: string) {
        this.nextUrl = new URL(url);
      }
    },
    NextResponse: class {
      body: any;
      headers: any;
      status: number;
      constructor(body: any, init: any) {
        this.body = body;
        this.headers = new Map(Object.entries(init?.headers || {}));
        this.status = init?.status || 200;
      }
      static json(body: any, init?: any) {
        return new (this as any)(body, {
          ...init,
          headers: { "Content-Type": "application/json" },
        });
      }
      async json() {
        return this.body;
      }
    },
  };
});

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/admin/api-auth", () => ({
  requireAdminAuth: jest.fn(),
}));

const { GET } = require("@/app/api/admin/pipeline/active-runs/route");
const { NextRequest } = require("next/server");
const { createClient } = require("@/lib/supabase/server");
const { requireAdminAuth } = require("@/lib/admin/api-auth");

describe("Active Runs API", () => {
  let mockSupabase: any;
  let jobsQuery: any;
  let chunksQuery: any;

  beforeEach(() => {
    jest.clearAllMocks();

    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: false,
      response: { status: 401 },
    });

    jobsQuery = {
      select: jest.fn(),
      in: jest.fn(),
      order: jest.fn(),
      limit: jest.fn(),
    };
    jobsQuery.select.mockReturnValue(jobsQuery);
    jobsQuery.in.mockReturnValue(jobsQuery);
    jobsQuery.order.mockReturnValue(jobsQuery);

    chunksQuery = {
      select: jest.fn(),
      in: jest.fn(),
    };
    chunksQuery.select.mockReturnValue(chunksQuery);

    mockSupabase = {
      from: jest.fn((table: string) => {
        if (table === "scrape_jobs") {
          return jobsQuery;
        }

        if (table === "scrape_job_chunks") {
          return chunksQuery;
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
  });

  it("should return 401 if not authorized", async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: false,
      response: { status: 401 },
    });

    const req = new NextRequest(
      "http://localhost/api/admin/pipeline/active-runs",
    );
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("should return active jobs with progress", async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: "user-123" },
      role: "admin",
    });

    const mockJobs = [
      {
        id: "job-1",
        status: "running",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:01:00Z",
        scrapers: ["amazon", "walmart"],
        skus: ["SKU-001", "SKU-002", "SKU-003"],
        runner_name: "runner-a",
        heartbeat_at: "2024-01-15T10:01:00Z",
        progress_percent: 67,
        progress_message: "Processing SKU-003",
        progress_phase: "scraping",
        progress_updated_at: "2024-01-15T10:01:00Z",
        current_sku: "SKU-003",
        items_processed: 2,
        items_total: 3,
        last_event_at: "2024-01-15T10:01:00Z",
        last_log_at: "2024-01-15T10:01:00Z",
        last_log_level: "info",
        last_log_message: "Parsed price",
      },
      {
        id: "job-2",
        status: "pending",
        created_at: "2024-01-15T09:00:00Z",
        updated_at: "2024-01-15T09:00:00Z",
        scrapers: ["target"],
        skus: ["SKU-004", "SKU-005"],
        runner_name: null,
        heartbeat_at: null,
        progress_percent: null,
        progress_message: null,
        progress_phase: null,
        progress_updated_at: null,
        current_sku: null,
        items_processed: null,
        items_total: null,
        last_event_at: null,
        last_log_at: null,
        last_log_level: null,
        last_log_message: null,
      },
    ];

    const mockChunks = [
      { job_id: "job-1", status: "completed", chunk_index: 0 },
      { job_id: "job-1", status: "completed", chunk_index: 1 },
      { job_id: "job-1", status: "running", chunk_index: 2 },
      { job_id: "job-1", status: "pending", chunk_index: 3 },
      { job_id: "job-2", status: "pending", chunk_index: 0 },
    ];

    jobsQuery.limit.mockResolvedValueOnce({ data: mockJobs, error: null });
    chunksQuery.in.mockResolvedValueOnce({ data: mockChunks, error: null });

    const req = new NextRequest(
      "http://localhost/api/admin/pipeline/active-runs",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.jobs).toHaveLength(2);

    expect(json.jobs[0]).toEqual({
      id: "job-1",
      status: "running",
      createdAt: "2024-01-15T10:00:00Z",
      scrapers: ["amazon", "walmart"],
      skuCount: 3,
      progress: 67,
      runnerName: "runner-a",
      progressMessage: "Processing SKU-003",
      progressPhase: "scraping",
      currentSku: "SKU-003",
      itemsProcessed: 2,
      itemsTotal: 3,
      lastLogMessage: "Parsed price",
      lastLogLevel: "info",
      lastLogAt: "2024-01-15T10:01:00Z",
      lastUpdateAt: "2024-01-15T10:01:00Z",
      heartbeatAt: "2024-01-15T10:01:00Z",
    });

    expect(json.jobs[1]).toEqual({
      id: "job-2",
      status: "pending",
      createdAt: "2024-01-15T09:00:00Z",
      scrapers: ["target"],
      skuCount: 2,
      progress: 0,
      runnerName: null,
      progressMessage: null,
      progressPhase: null,
      currentSku: null,
      itemsProcessed: null,
      itemsTotal: null,
      lastLogMessage: null,
      lastLogLevel: null,
      lastLogAt: null,
      lastUpdateAt: "2024-01-15T09:00:00Z",
      heartbeatAt: null,
    });
  });

  it("should query for pending and running jobs only", async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: "user-123" },
      role: "admin",
    });

    jobsQuery.limit.mockResolvedValueOnce({ data: [], error: null });

    const req = new NextRequest(
      "http://localhost/api/admin/pipeline/active-runs",
    );
    await GET(req);

    expect(jobsQuery.in).toHaveBeenCalledWith("status", [
      "pending",
      "claimed",
      "running",
    ]);
  });

  it("should order by created_at DESC", async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: "user-123" },
      role: "admin",
    });

    jobsQuery.limit.mockResolvedValueOnce({ data: [], error: null });

    const req = new NextRequest(
      "http://localhost/api/admin/pipeline/active-runs",
    );
    await GET(req);

    expect(jobsQuery.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
  });

  it("should return empty array when no active jobs", async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: "user-123" },
      role: "admin",
    });

    jobsQuery.limit.mockResolvedValueOnce({ data: [], error: null });

    const req = new NextRequest(
      "http://localhost/api/admin/pipeline/active-runs",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.jobs).toEqual([]);
  });

  it("should handle errors gracefully", async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: "user-123" },
      role: "admin",
    });

    jobsQuery.limit.mockResolvedValueOnce({
      data: null,
      error: { message: "Database error" },
    });

    const req = new NextRequest(
      "http://localhost/api/admin/pipeline/active-runs",
    );
    const res = await GET(req);

    expect(res.status).toBe(500);
  });
});
