/**
 * @jest-environment node
 */
/**
 * @jest-environment node
 */
import { POST } from "@/app/api/scraper/v1/logs/route";
import { NextRequest } from "next/server";
import { validateRunnerAuth } from "@/lib/scraper-auth";
import { createClient } from "@supabase/supabase-js";

jest.mock("@/lib/scraper-auth", () => ({
  validateRunnerAuth: jest.fn(),
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

describe("POST /api/scraper/v1/logs", () => {
  let mockSupabase: {
    from: jest.Mock;
    upsert: jest.Mock;
  };

  beforeEach(() => {
    process.env.SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    jest.clearAllMocks();

    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      upsert: jest.fn(),
    };
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  const createRequest = (body: Record<string, unknown>, headers: Record<string, string> = {}) => {
    const reqHeaders = new Map(Object.entries(headers));
    if (!reqHeaders.has("Content-Type")) {
      reqHeaders.set("Content-Type", "application/json");
    }

    return {
      headers: {
        get: (key: string) => reqHeaders.get(key) || null,
      },
      json: async () => body,
    } as unknown as NextRequest;
  };

  it("should return 401 if authentication fails", async () => {
    (validateRunnerAuth as jest.Mock).mockResolvedValue(null);

    const req = createRequest({ job_id: "job-123", logs: [] });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 if validation fails (missing job_id)", async () => {
    (validateRunnerAuth as jest.Mock).mockResolvedValue({
      runnerName: "test-runner",
    });

    const req = createRequest({ logs: [] });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Missing required fields");
  });

  it("should return 400 if validation fails (missing logs array)", async () => {
    (validateRunnerAuth as jest.Mock).mockResolvedValue({
      runnerName: "test-runner",
    });

    const req = createRequest({ job_id: "job-123" });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Missing required fields");
  });

  it("should successfully insert logs", async () => {
    (validateRunnerAuth as jest.Mock).mockResolvedValue({
      runnerName: "test-runner",
    });
    mockSupabase.upsert.mockResolvedValue({ error: null });

    const logs = [
      {
        event_id: "evt-1",
        level: "INFO",
        message: "Log 1",
        timestamp: "2023-01-01T00:00:00Z",
        details: { step: 1 },
      },
      {
        event_id: "evt-2",
        level: "ERROR",
        message: "Log 2",
        timestamp: "2023-01-01T00:00:01Z",
      },
    ];
    const req = createRequest({ job_id: "job-123", logs });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    expect(mockSupabase.from).toHaveBeenCalledWith("scrape_job_logs");
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          job_id: "job-123",
          event_id: "evt-1",
          level: "info",
          message: "Log 1",
          runner_name: "test-runner",
          details: { step: 1 },
          created_at: "2023-01-01T00:00:00Z",
        }),
        expect.objectContaining({
          job_id: "job-123",
          event_id: "evt-2",
          level: "error",
          message: "Log 2",
          runner_name: "test-runner",
          details: null,
          created_at: "2023-01-01T00:00:01Z",
        }),
      ]),
      { onConflict: "job_id,event_id", ignoreDuplicates: true },
    );
  });

  it("should handle database errors gracefully", async () => {
    (validateRunnerAuth as jest.Mock).mockResolvedValue({
      runnerName: "test-runner",
    });
    mockSupabase.upsert.mockResolvedValue({ error: { message: "DB Error" } });

    const req = createRequest({
      job_id: "job-123",
      logs: [{ level: "INFO", message: "test" }],
    });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to insert logs");
  });
});
