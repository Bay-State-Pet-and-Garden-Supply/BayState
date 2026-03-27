import { getScraperRunLogs } from "@/app/admin/scrapers/runs/actions";
import { createClient } from "@/lib/supabase/server";

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

describe("getScraperRunLogs", () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      data: null,
      error: null,
    };
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
  });

  it("queries the logs table selecting details column and returns data", async () => {
    const fakeLogs = [
      {
        id: "1",
        job_id: "job1",
        level: "info",
        message: "hello",
        details: { foo: "bar" },
        created_at: "now",
      },
    ];
    mockSupabase.data = fakeLogs;

    const result = await getScraperRunLogs("job1");

    expect(mockSupabase.from).toHaveBeenCalledWith("scrape_job_logs");
    expect(mockSupabase.select).toHaveBeenCalledWith(
      "id, event_id, job_id, level, message, details, created_at, runner_id, runner_name, source, scraper_name, sku, phase, sequence",
    );
    expect(mockSupabase.eq).toHaveBeenCalledWith("job_id", "job1");
    expect(mockSupabase.order).toHaveBeenNthCalledWith(1, "created_at", {
      ascending: true,
    });
    expect(mockSupabase.order).toHaveBeenNthCalledWith(2, "sequence", {
      ascending: true,
    });
    expect(result[0]).toMatchObject({
      id: "1",
      job_id: "job1",
      level: "info",
      message: "hello",
      details: { foo: "bar" },
      persisted: true,
    });
  });

  it("returns empty array if error occurs", async () => {
    mockSupabase.error = { message: "oops" };
    const result = await getScraperRunLogs("job2");
    expect(result).toEqual([]);
  });
});
