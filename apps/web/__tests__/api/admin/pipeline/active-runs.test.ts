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
  let activeJobsQuery: any;
  let recentJobsQuery: any;
  let chunksQuery: any;

  beforeEach(() => {
    jest.clearAllMocks();

    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: false,
      response: { status: 401 },
    });

    activeJobsQuery = {
      select: jest.fn(),
      in: jest.fn(),
      order: jest.fn(),
      limit: jest.fn(),
    };
    activeJobsQuery.select.mockReturnValue(activeJobsQuery);
    activeJobsQuery.in.mockReturnValue(activeJobsQuery);
    activeJobsQuery.order.mockReturnValue(activeJobsQuery);

    recentJobsQuery = {
      select: jest.fn(),
      in: jest.fn(),
      gte: jest.fn(),
      order: jest.fn(),
      limit: jest.fn(),
    };
    recentJobsQuery.select.mockReturnValue(recentJobsQuery);
    recentJobsQuery.in.mockReturnValue(recentJobsQuery);
    recentJobsQuery.gte.mockReturnValue(recentJobsQuery);
    recentJobsQuery.order.mockReturnValue(recentJobsQuery);

    chunksQuery = {
      select: jest.fn(),
      in: jest.fn(),
      order: jest.fn(),
    };
    chunksQuery.select.mockReturnValue(chunksQuery);
    chunksQuery.in.mockReturnValue(chunksQuery);
    chunksQuery.order.mockResolvedValue({ data: [], error: null });

    mockSupabase = {
      _jobQueryCallCount: 0,
      from: jest.fn((table: string) => {
        if (table === "scrape_jobs") {
          mockSupabase._jobQueryCallCount += 1;
          return mockSupabase._jobQueryCallCount === 1 ? activeJobsQuery : recentJobsQuery;
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
      { job_id: "job-1", id: "chunk-1", status: "completed", chunk_index: 0, skus: ["SKU-001"], claimed_by: null, claimed_at: null, started_at: null, completed_at: null, skus_processed: 1, skus_successful: 1, skus_failed: 0, error_message: null, planned_work_units: 2, sku_slice_index: 0, site_group_key: "amazon.com", site_group_label: "amazon.com", site_domain: "amazon.com" },
      { job_id: "job-1", id: "chunk-2", status: "completed", chunk_index: 1, skus: ["SKU-001"], claimed_by: null, claimed_at: null, started_at: null, completed_at: null, skus_processed: 1, skus_successful: 1, skus_failed: 0, error_message: null, planned_work_units: 2, sku_slice_index: 0, site_group_key: "walmart.com", site_group_label: "walmart.com", site_domain: "walmart.com" },
      { job_id: "job-1", id: "chunk-3", status: "running", chunk_index: 2, skus: ["SKU-002"], claimed_by: "runner-a", claimed_at: "2024-01-15T10:01:00Z", started_at: "2024-01-15T10:01:00Z", completed_at: null, skus_processed: 0, skus_successful: 0, skus_failed: 0, error_message: null, planned_work_units: 2, sku_slice_index: 1, site_group_key: "amazon.com", site_group_label: "amazon.com", site_domain: "amazon.com" },
      { job_id: "job-1", id: "chunk-4", status: "pending", chunk_index: 3, skus: ["SKU-002"], claimed_by: null, claimed_at: null, started_at: null, completed_at: null, skus_processed: 0, skus_successful: 0, skus_failed: 0, error_message: null, planned_work_units: 2, sku_slice_index: 1, site_group_key: "walmart.com", site_group_label: "walmart.com", site_domain: "walmart.com" },
      { job_id: "job-2", id: "chunk-5", status: "pending", chunk_index: 0, skus: ["SKU-004", "SKU-005"], claimed_by: null, claimed_at: null, started_at: null, completed_at: null, skus_processed: 0, skus_successful: 0, skus_failed: 0, error_message: null, planned_work_units: 2, sku_slice_index: 0, site_group_key: "target.com", site_group_label: "target.com", site_domain: "target.com" },
    ];

    activeJobsQuery.limit.mockResolvedValueOnce({ data: mockJobs, error: null });
    recentJobsQuery.limit.mockResolvedValueOnce({ data: [], error: null });
    chunksQuery.order.mockResolvedValueOnce({ data: mockChunks, error: null });

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
      completedAt: null,
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
      chunks: [
        {
          id: "chunk-1",
          jobId: "job-1",
          chunkIndex: 0,
          skuCount: 1,
          plannedWorkUnits: 2,
          skuSliceIndex: 0,
          siteGroupKey: "amazon.com",
          siteGroupLabel: "amazon.com",
          siteDomain: "amazon.com",
          status: "completed",
          claimedBy: null,
          claimedAt: null,
          startedAt: null,
          completedAt: null,
          skusProcessed: 1,
          skusSuccessful: 1,
          skusFailed: 0,
          errorMessage: null,
        },
        {
          id: "chunk-2",
          jobId: "job-1",
          chunkIndex: 1,
          skuCount: 1,
          plannedWorkUnits: 2,
          skuSliceIndex: 0,
          siteGroupKey: "walmart.com",
          siteGroupLabel: "walmart.com",
          siteDomain: "walmart.com",
          status: "completed",
          claimedBy: null,
          claimedAt: null,
          startedAt: null,
          completedAt: null,
          skusProcessed: 1,
          skusSuccessful: 1,
          skusFailed: 0,
          errorMessage: null,
        },
        {
          id: "chunk-3",
          jobId: "job-1",
          chunkIndex: 2,
          skuCount: 1,
          plannedWorkUnits: 2,
          skuSliceIndex: 1,
          siteGroupKey: "amazon.com",
          siteGroupLabel: "amazon.com",
          siteDomain: "amazon.com",
          status: "running",
          claimedBy: "runner-a",
          claimedAt: "2024-01-15T10:01:00Z",
          startedAt: "2024-01-15T10:01:00Z",
          completedAt: null,
          skusProcessed: 0,
          skusSuccessful: 0,
          skusFailed: 0,
          errorMessage: null,
        },
        {
          id: "chunk-4",
          jobId: "job-1",
          chunkIndex: 3,
          skuCount: 1,
          plannedWorkUnits: 2,
          skuSliceIndex: 1,
          siteGroupKey: "walmart.com",
          siteGroupLabel: "walmart.com",
          siteDomain: "walmart.com",
          status: "pending",
          claimedBy: null,
          claimedAt: null,
          startedAt: null,
          completedAt: null,
          skusProcessed: 0,
          skusSuccessful: 0,
          skusFailed: 0,
          errorMessage: null,
        },
      ],
      chunkSummary: {
        total: 4,
        pending: 1,
        running: 1,
        completed: 2,
        failed: 0,
      },
    });

    expect(json.jobs[1]).toEqual({
      id: "job-2",
      status: "pending",
      createdAt: "2024-01-15T09:00:00Z",
      completedAt: null,
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
      chunks: [
        {
          id: "chunk-5",
          jobId: "job-2",
          chunkIndex: 0,
          skuCount: 2,
          plannedWorkUnits: 2,
          skuSliceIndex: 0,
          siteGroupKey: "target.com",
          siteGroupLabel: "target.com",
          siteDomain: "target.com",
          status: "pending",
          claimedBy: null,
          claimedAt: null,
          startedAt: null,
          completedAt: null,
          skusProcessed: 0,
          skusSuccessful: 0,
          skusFailed: 0,
          errorMessage: null,
        },
      ],
      chunkSummary: {
        total: 1,
        pending: 1,
        running: 0,
        completed: 0,
        failed: 0,
      },
    });
  });

  it("should query for pending and running jobs only", async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: "user-123" },
      role: "admin",
    });

    activeJobsQuery.limit.mockResolvedValueOnce({ data: [], error: null });
    recentJobsQuery.limit.mockResolvedValueOnce({ data: [], error: null });

    const req = new NextRequest(
      "http://localhost/api/admin/pipeline/active-runs",
    );
    await GET(req);

    expect(activeJobsQuery.in).toHaveBeenCalledWith("status", [
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

    activeJobsQuery.limit.mockResolvedValueOnce({ data: [], error: null });
    recentJobsQuery.limit.mockResolvedValueOnce({ data: [], error: null });

    const req = new NextRequest(
      "http://localhost/api/admin/pipeline/active-runs",
    );
    await GET(req);

    expect(activeJobsQuery.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
  });

  it("should return empty array when no active jobs", async () => {
    (requireAdminAuth as jest.Mock).mockResolvedValue({
      authorized: true,
      user: { id: "user-123" },
      role: "admin",
    });

    activeJobsQuery.limit.mockResolvedValueOnce({ data: [], error: null });
    recentJobsQuery.limit.mockResolvedValueOnce({ data: [], error: null });

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

    activeJobsQuery.limit.mockResolvedValueOnce({
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
