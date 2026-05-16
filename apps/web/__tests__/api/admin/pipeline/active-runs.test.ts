export {};
const {
  NextRequest,
  createAdminClient,
  requireAdminAuth,
} = require('@/__tests__/helpers/admin-api-route-harness');
const { GET } = require("@/app/api/admin/pipeline/active-runs/route");

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
    chunksQuery.in.mockResolvedValue({ data: [], error: null });
    chunksQuery.order.mockResolvedValue({ data: [], error: null });

    mockSupabase = {
      _jobQueryCallCount: 0,
      from: jest.fn((table: string) => {
        if (table === "enrichment_jobs") {
          mockSupabase._jobQueryCallCount += 1;
          return mockSupabase._jobQueryCallCount === 1 ? activeJobsQuery : recentJobsQuery;
        }

        if (table === "enrichment_attempts") {
          return chunksQuery;
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    (createAdminClient as jest.Mock).mockResolvedValue(mockSupabase);
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
        config: { scrapers: ["amazon", "walmart"], cohort: { id: 'cohort-1' } },
        status: "running",
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-01-15T10:01:00Z",
        skus: ["SKU-001", "SKU-002", "SKU-003"],
        claimed_by: "runner-a",
        heartbeat_at: "2024-01-15T10:01:00Z",
        progress_percent: 67,
        progress_message: "Processing SKU-003",
        progress_phase: "scraping",
        current_sku: "SKU-003",
        items_processed: 2,
        items_total: 3,
        last_log_at: "2024-01-15T10:01:00Z",
        last_log_level: "info",
        last_log_message: "Parsed price",
      },
      {
        id: "job-2",
        config: { scrapers: ["target"] },
        status: "pending",
        created_at: "2024-01-15T09:00:00Z",
        updated_at: "2024-01-15T09:00:00Z",
        skus: ["SKU-004", "SKU-005"],
        claimed_by: null,
        heartbeat_at: null,
        progress_percent: null,
        progress_message: null,
        progress_phase: null,
        current_sku: null,
        items_processed: null,
        items_total: null,
        last_log_at: null,
        last_log_level: null,
        last_log_message: null,
      },
    ];

    const mockAttempts = [
      { id: "att-1", job_id: "job-1", sku: "SKU-001", status: "completed", claimed_by: null, started_at: null, completed_at: "2024-01-15T10:00:30Z", error_message: null },
      { id: "att-2", job_id: "job-1", sku: "SKU-002", status: "completed", claimed_by: null, started_at: null, completed_at: "2024-01-15T10:00:45Z", error_message: null },
      { id: "att-3", job_id: "job-1", sku: "SKU-003", status: "running", claimed_by: "runner-a", started_at: "2024-01-15T10:01:00Z", completed_at: null, error_message: null },
      { id: "att-4", job_id: "job-2", sku: "SKU-004", status: "pending", claimed_by: null, started_at: null, completed_at: null, error_message: null },
      { id: "att-5", job_id: "job-2", sku: "SKU-005", status: "pending", claimed_by: null, started_at: null, completed_at: null, error_message: null },
    ];

    activeJobsQuery.limit.mockResolvedValueOnce({ data: mockJobs, error: null });
    recentJobsQuery.limit.mockResolvedValueOnce({ data: [], error: null });
    chunksQuery.in.mockResolvedValueOnce({ data: mockAttempts, error: null });

    const req = new NextRequest(
      "http://localhost/api/admin/pipeline/active-runs",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.jobs).toHaveLength(2);

    expect(json.jobs[0]).toEqual({
      id: "job-1",
      jobType: 'enrichment',
      officialBrandPhase: null,
      cohortId: 'cohort-1',
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
        { id: "att-1", jobId: "job-1", chunkIndex: 0, skuCount: 1, plannedWorkUnits: 1, skuSliceIndex: null, siteGroupKey: null, siteGroupLabel: null, siteDomain: null, status: "completed", claimedBy: null, claimedAt: null, startedAt: null, completedAt: "2024-01-15T10:00:30Z", skusProcessed: 1, skusSuccessful: 1, skusFailed: 0, errorMessage: null },
        { id: "att-2", jobId: "job-1", chunkIndex: 0, skuCount: 1, plannedWorkUnits: 1, skuSliceIndex: null, siteGroupKey: null, siteGroupLabel: null, siteDomain: null, status: "completed", claimedBy: null, claimedAt: null, startedAt: null, completedAt: "2024-01-15T10:00:45Z", skusProcessed: 1, skusSuccessful: 1, skusFailed: 0, errorMessage: null },
        { id: "att-3", jobId: "job-1", chunkIndex: 0, skuCount: 1, plannedWorkUnits: 1, skuSliceIndex: null, siteGroupKey: null, siteGroupLabel: null, siteDomain: null, status: "running", claimedBy: "runner-a", claimedAt: null, startedAt: "2024-01-15T10:01:00Z", completedAt: null, skusProcessed: 1, skusSuccessful: 0, skusFailed: 0, errorMessage: null },
      ],
      chunkSummary: {
        total: 3,
        pending: 0,
        running: 1,
        completed: 2,
        failed: 0,
      },
    });

    expect(json.jobs[1]).toEqual({
      id: "job-2",
      jobType: "enrichment",
      officialBrandPhase: null,
      cohortId: null,
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
        { id: "att-4", jobId: "job-2", chunkIndex: 0, skuCount: 1, plannedWorkUnits: 1, skuSliceIndex: null, siteGroupKey: null, siteGroupLabel: null, siteDomain: null, status: "pending", claimedBy: null, claimedAt: null, startedAt: null, completedAt: null, skusProcessed: 1, skusSuccessful: 0, skusFailed: 0, errorMessage: null },
        { id: "att-5", jobId: "job-2", chunkIndex: 0, skuCount: 1, plannedWorkUnits: 1, skuSliceIndex: null, siteGroupKey: null, siteGroupLabel: null, siteDomain: null, status: "pending", claimedBy: null, claimedAt: null, startedAt: null, completedAt: null, skusProcessed: 1, skusSuccessful: 0, skusFailed: 0, errorMessage: null },
      ],
      chunkSummary: {
        total: 2,
        pending: 2,
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
