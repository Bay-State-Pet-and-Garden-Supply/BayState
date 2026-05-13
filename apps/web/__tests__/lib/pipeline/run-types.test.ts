import {
  mapBatchJobStatusToRunStatus,
  mapScrapeJobStatusToRunStatus,
  determineScrapeJobKind,
  getConsolidationStageLabel,
  getScrapeStageLabel,
  PIPELINE_RUN_KIND_LABELS,
  PIPELINE_RUN_STATUS_LABELS,
} from "@/lib/pipeline/run-types";
import type { PipelineRunKind, PipelineRunStatus } from "@/lib/pipeline/run-types";

// =============================================================================
// mapBatchJobStatusToRunStatus
// =============================================================================

describe("mapBatchJobStatusToRunStatus", () => {
  it("maps pending and validating to queued", () => {
    expect(mapBatchJobStatusToRunStatus("pending")).toBe("queued");
    expect(mapBatchJobStatusToRunStatus("validating")).toBe("queued");
  });

  it("maps in_progress, running, and finalizing to running", () => {
    expect(mapBatchJobStatusToRunStatus("in_progress")).toBe("running");
    expect(mapBatchJobStatusToRunStatus("running")).toBe("running");
    expect(mapBatchJobStatusToRunStatus("finalizing")).toBe("running");
  });

  it("maps completed to completed when no failures", () => {
    expect(mapBatchJobStatusToRunStatus("completed", 0)).toBe("completed");
  });

  it("maps completed to completed_with_errors when failures exist", () => {
    expect(mapBatchJobStatusToRunStatus("completed", 1)).toBe("completed_with_errors");
    expect(mapBatchJobStatusToRunStatus("completed", 5)).toBe("completed_with_errors");
  });

  it("maps failed and expired to failed", () => {
    expect(mapBatchJobStatusToRunStatus("failed")).toBe("failed");
    expect(mapBatchJobStatusToRunStatus("expired")).toBe("failed");
  });

  it("maps cancelled to cancelled", () => {
    expect(mapBatchJobStatusToRunStatus("cancelled")).toBe("cancelled");
  });

  it("defaults unknown statuses to running", () => {
    expect(mapBatchJobStatusToRunStatus("unknown")).toBe("running");
  });
});

// =============================================================================
// mapScrapeJobStatusToRunStatus
// =============================================================================

describe("mapScrapeJobStatusToRunStatus", () => {
  it("maps pending to queued", () => {
    expect(mapScrapeJobStatusToRunStatus("pending")).toBe("queued");
  });

  it("maps claimed and running to running", () => {
    expect(mapScrapeJobStatusToRunStatus("claimed")).toBe("running");
    expect(mapScrapeJobStatusToRunStatus("running")).toBe("running");
  });

  it("maps completed to completed", () => {
    expect(mapScrapeJobStatusToRunStatus("completed")).toBe("completed");
  });

  it("maps failed to failed", () => {
    expect(mapScrapeJobStatusToRunStatus("failed")).toBe("failed");
  });

  it("maps cancelled to cancelled", () => {
    expect(mapScrapeJobStatusToRunStatus("cancelled")).toBe("cancelled");
  });

  it("defaults unknown statuses to running", () => {
    expect(mapScrapeJobStatusToRunStatus("unknown")).toBe("running");
  });
});

// =============================================================================
// determineScrapeJobKind
// =============================================================================

describe("determineScrapeJobKind", () => {
  it("returns serp_search for official_brand_url_discovery", () => {
    expect(determineScrapeJobKind("official_brand_url_discovery")).toBe("serp_search");
  });

  it("returns page_scrape for any other type", () => {
    expect(determineScrapeJobKind("direct_url_extraction")).toBe("page_scrape");
    expect(determineScrapeJobKind("standard")).toBe("page_scrape");
    expect(determineScrapeJobKind(null)).toBe("page_scrape");
    expect(determineScrapeJobKind(undefined)).toBe("page_scrape");
  });
});

// =============================================================================
// getConsolidationStageLabel
// =============================================================================

describe("getConsolidationStageLabel", () => {
  it("returns settled message for completed statuses", () => {
    expect(getConsolidationStageLabel("completed", 0, 0, 10)).toBe(
      "Settled — review errors or apply results",
    );
    expect(getConsolidationStageLabel("completed_with_errors", 0, 0, 10)).toBe(
      "Settled — review errors or apply results",
    );
  });

  it("returns ended message for failed/cancelled", () => {
    expect(getConsolidationStageLabel("failed", 0, 0, 10)).toBe(
      "Run ended — review before proceeding",
    );
    expect(getConsolidationStageLabel("cancelled", 0, 0, 10)).toBe(
      "Run ended — review before proceeding",
    );
  });

  it("returns processing message when running items exist", () => {
    expect(getConsolidationStageLabel("running", 5, 3, 20)).toBe(
      "Processing products...",
    );
  });

  it("returns queued message when pending items exist", () => {
    expect(getConsolidationStageLabel("queued", 5, 0, 20)).toBe(
      "5 products still queued",
    );
    expect(getConsolidationStageLabel("queued", 1, 0, 20)).toBe(
      "1 product still queued",
    );
  });

  it("returns default waiting message", () => {
    expect(getConsolidationStageLabel("queued", 0, 0, 0)).toBe(
      "Waiting for items",
    );
  });
});

// =============================================================================
// getScrapeStageLabel
// =============================================================================

describe("getScrapeStageLabel", () => {
  it("returns URL discovery message for serp_search running", () => {
    expect(getScrapeStageLabel("running", "official_brand_url_discovery")).toBe(
      "Searching for official URLs...",
    );
  });

  it("returns scraping message for page_scrape running", () => {
    expect(getScrapeStageLabel("running", "standard")).toBe(
      "Scraping product pages...",
    );
  });

  it("returns completed message", () => {
    expect(getScrapeStageLabel("completed", null)).toBe("Scraping completed");
  });

  it("returns queued message", () => {
    expect(getScrapeStageLabel("queued", null)).toBe("Queued");
  });
});

// =============================================================================
// Constants should be correct
// =============================================================================

describe("PIPELINE_RUN_KIND_LABELS", () => {
  it("has labels for all kinds", () => {
    const kinds: PipelineRunKind[] = [
      "serp_search",
      "page_scrape",
      "consolidation",
      "apply_results",
    ];
    for (const kind of kinds) {
      expect(PIPELINE_RUN_KIND_LABELS[kind]).toBeDefined();
      expect(typeof PIPELINE_RUN_KIND_LABELS[kind]).toBe("string");
    }
  });
});

describe("PIPELINE_RUN_STATUS_LABELS", () => {
  it("has labels for all statuses", () => {
    const statuses: PipelineRunStatus[] = [
      "queued",
      "running",
      "retrying",
      "blocked",
      "completed",
      "completed_with_errors",
      "failed",
      "cancelled",
    ];
    for (const status of statuses) {
      expect(PIPELINE_RUN_STATUS_LABELS[status]).toBeDefined();
      expect(typeof PIPELINE_RUN_STATUS_LABELS[status]).toBe("string");
    }
  });
});
