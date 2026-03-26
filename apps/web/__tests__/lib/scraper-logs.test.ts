import {
  mergeScrapeJobLogs,
  normalizeScrapeLogEntry,
  normalizeScrapeProgressUpdate,
  normalizeScrapeTimestamp,
  toScrapeJobLogRow,
} from "@/lib/scraper-logs";

describe("scraper-logs", () => {
  it("normalizes legacy levels and numeric timestamps", () => {
    const log = normalizeScrapeLogEntry({
      job_id: "job-1",
      level: "WARN",
      message: "Step finished",
      timestamp: 1711711711,
    });

    expect(log.level).toBe("warning");
    expect(log.timestamp).toBe("2024-03-29T11:28:31.000Z");
  });

  it("dedupes broadcast and persisted logs by event id while preserving persisted state", () => {
    const broadcastLog = normalizeScrapeLogEntry({
      event_id: "evt-1",
      job_id: "job-1",
      level: "info",
      message: "Runner started",
      timestamp: "2024-01-01T00:00:00Z",
      runner_name: "runner-a",
    });

    const persistedLog = normalizeScrapeLogEntry(
      {
        id: "row-1",
        event_id: "evt-1",
        job_id: "job-1",
        level: "INFO",
        message: "Runner started",
        created_at: "2024-01-01T00:00:00Z",
        runner_name: "runner-a",
      },
      { persisted: true },
    );

    const merged = mergeScrapeJobLogs([broadcastLog], [persistedLog]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: "evt-1",
      event_id: "evt-1",
      persisted: true,
      runner_name: "runner-a",
    });
  });

  it("normalizes progress updates into the shared live model", () => {
    const progress = normalizeScrapeProgressUpdate({
      job_id: "job-1",
      runner_id: "runner-1",
      status: "running",
      progress: "42",
      current_sku: "SKU-42",
      items_processed: "4",
      items_total: 10,
      phase: "scraping",
      message: "Processing SKU-42",
      details: { source: "broadcast" },
      timestamp: "2024-01-01T00:00:01Z",
    });

    expect(progress).toEqual({
      job_id: "job-1",
      runner_id: "runner-1",
      runner_name: undefined,
      status: "running",
      progress: 42,
      message: "Processing SKU-42",
      phase: "scraping",
      current_sku: "SKU-42",
      items_processed: 4,
      items_total: 10,
      details: { source: "broadcast" },
      timestamp: "2024-01-01T00:00:01Z",
    });
  });

  it("maps runner logs into durable database rows", () => {
    const row = toScrapeJobLogRow({
      event_id: "evt-9",
      job_id: "job-9",
      level: "WARN",
      message: "Retrying request",
      timestamp: "2024-01-01T00:00:09Z",
      runner_id: "runner-9",
      runner_name: "runner-nine",
      source: "http",
      scraper_name: "amazon",
      sku: "SKU-9",
      phase: "request",
      sequence: 9,
      details: { attempt: 2 },
    });

    expect(row).toEqual({
      job_id: "job-9",
      event_id: "evt-9",
      level: "warning",
      message: "Retrying request",
      created_at: "2024-01-01T00:00:09Z",
      runner_id: "runner-9",
      runner_name: "runner-nine",
      source: "http",
      scraper_name: "amazon",
      sku: "SKU-9",
      phase: "request",
      sequence: 9,
      details: { attempt: 2 },
    });
  });

  it("keeps string timestamps unchanged", () => {
    expect(normalizeScrapeTimestamp("2024-01-01T00:00:00Z")).toBe("2024-01-01T00:00:00Z");
  });
});
