import {
  mapBatchJobStatusToRunStatus,
  mapEnrichmentJobStatusToRunStatus,
  getConsolidationStageLabel,
  getEnrichmentStageLabel,
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
// mapEnrichmentJobStatusToRunStatus
// =============================================================================

describe("mapEnrichmentJobStatusToRunStatus", () => {
  it("maps pending and queued to queued", () => {
    expect(mapEnrichmentJobStatusToRunStatus("pending")).toBe("queued");
    expect(mapEnrichmentJobStatusToRunStatus("queued")).toBe("queued");
  });

  it("maps claimed and running to running", () => {
    expect(mapEnrichmentJobStatusToRunStatus("claimed")).toBe("running");
    expect(mapEnrichmentJobStatusToRunStatus("running")).toBe("running");
  });

  it("maps completed to completed", () => {
    expect(mapEnrichmentJobStatusToRunStatus("completed")).toBe("completed");
  });

  it("maps failed to failed", () => {
    expect(mapEnrichmentJobStatusToRunStatus("failed")).toBe("failed");
  });

  it("maps cancelled to cancelled", () => {
    expect(mapEnrichmentJobStatusToRunStatus("cancelled")).toBe("cancelled");
  });

  it("defaults unknown statuses to running", () => {
    expect(mapEnrichmentJobStatusToRunStatus("unknown")).toBe("running");
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
// getEnrichmentStageLabel
// =============================================================================

describe("getEnrichmentStageLabel", () => {
  it("returns enriching message for running", () => {
    expect(getEnrichmentStageLabel("running", 0, 5, 20)).toBe(
      "Enriching products...",
    );
  });

  it("returns completed message", () => {
    expect(getEnrichmentStageLabel("completed", 0, 0, 10)).toBe(
      "Settled — review errors or apply results",
    );
  });

  it("returns queued message", () => {
    expect(getEnrichmentStageLabel("queued", 5, 0, 20)).toBe(
      "5 products still queued",
    );
  });
});

// =============================================================================
// Constants should be correct
// =============================================================================

describe("PIPELINE_RUN_KIND_LABELS", () => {
  it("has labels for all kinds", () => {
    const kinds: PipelineRunKind[] = [
      "enrichment",
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
