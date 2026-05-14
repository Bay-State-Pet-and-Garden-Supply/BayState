/**
 * Pipeline Run Types
 *
 * Provider-neutral types for tracking pipeline job/run status.
 * These are the canonical frontend-facing status types — provider-specific
 * details are mapped server-side in the pipeline runs API route.
 *
 * This is a separate module from lib/pipeline/types.ts because those types
 * model the product ingestion lifecycle (imported → processed → published),
 * while these types model job/run execution (queued → running → completed).
 */

// =============================================================================
// Pipeline Run Kind
// =============================================================================

/**
 * What kind of work this pipeline run represents.
 *
 * - `enrichment`: AI product enrichment (extraction from target URLs)
 * - `consolidation`: AI product data consolidation
 * - `apply_results`: Applying completed consolidation results back to products
 */
export type PipelineRunKind =
  | "enrichment"
  | "consolidation"
  | "apply_results";

// =============================================================================
// Pipeline Run Status
// =============================================================================

/**
 * Normalized run status that the frontend should display.
 *
 * Provider-specific statuses (e.g. OpenAI "validating" / "finalizing")
 * are mapped to these canonical values in the API route.
 */
export type PipelineRunStatus =
  | "queued"
  | "running"
  | "retrying"
  | "blocked"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "cancelled";

// =============================================================================
// Pipeline Event
// =============================================================================

/** Single log or status event for a pipeline run. */
export interface PipelineEvent {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
}

// =============================================================================
// Pipeline Run Summary
// =============================================================================

/**
 * Provider-normalized summary of a pipeline run.
 *
 * This is the single canonical type consumed by frontend components.
 * All provider-specific status APIs must be mapped to this shape server-side.
 */
export interface PipelineRunSummary {
  /** Unique run identifier */
  id: string;
  /** What kind of run this is */
  kind: PipelineRunKind;
  /** Human-readable label (e.g. "Product Enrichment" or "Product Consolidation") */
  label: string;
  /** Normalized status */
  status: PipelineRunStatus;

  /** Provider name (e.g. "DeepSeek", "Serper"). Displayed only when useful. */
  provider?: string;
  /** Execution mode (e.g. "Direct item processing"). Provider-specific detail. */
  executionMode?: string;
  /** LLM model used (e.g. "deepseek-chat"). Displayed as a badge. */
  model?: string;

  /** Total items to process */
  totalItems: number;
  /** Items successfully completed */
  completedItems: number;
  /** Items that failed */
  failedItems: number;
  /** Items currently processing */
  runningItems: number;
  /** Items still queued */
  pendingItems: number;

  /** Progress percentage (0-100) */
  progressPercent: number;

  /** When the run started */
  startedAt?: string;
  /** Last status update time */
  updatedAt?: string;
  /** When the run completed or failed */
  completedAt?: string;

  /** Human-readable current stage label (e.g. "Processing products..." or "Settled — no queued items") */
  currentStageLabel: string;
  /**
   * Suggested next user action.
   * - `wait`: No action needed, run is in progress
   * - `retry_failed`: Some items failed and can be retried
   * - `apply_results`: Completed results ready to apply
   * - `review_errors`: Run finished with errors that need review
   * - `recover`: Items stuck in a status need recovery
   */
  nextAction?: "wait" | "retry_failed" | "apply_results" | "review_errors" | "recover";

  /** Recent activity events for this run */
  recentEvents?: PipelineEvent[];
}

// =============================================================================
// Helper labels
// =============================================================================

/** Human-readable labels for each run kind. */
export const PIPELINE_RUN_KIND_LABELS: Record<PipelineRunKind, string> = {
  enrichment: "Product Enrichment",
  consolidation: "Product Consolidation",
  apply_results: "Apply Results",
};

/** Human-readable labels for each run status. */
export const PIPELINE_RUN_STATUS_LABELS: Record<PipelineRunStatus, string> = {
  queued: "Queued",
  running: "Running",
  retrying: "Retrying",
  blocked: "Blocked",
  completed: "Completed",
  completed_with_errors: "Completed with Errors",
  failed: "Failed",
  cancelled: "Cancelled",
};

// =============================================================================
// Status Mapper (consolidation batch_jobs → PipelineRunSummary)
// =============================================================================

/**
 * Map a batch_jobs status string to a canonical PipelineRunStatus.
 */
export function mapBatchJobStatusToRunStatus(
  status: string,
  failedCount?: number,
): PipelineRunStatus {
  switch (status) {
    case "pending":
    case "validating":
      return "queued";
    case "in_progress":
    case "running":
    case "finalizing":
      return "running";
    case "completed":
      return (failedCount ?? 0) > 0 ? "completed_with_errors" : "completed";
    case "failed":
    case "expired":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "running";
  }
}

/**
 * Map an enrichment_jobs status string to a canonical PipelineRunStatus.
 */
export function mapEnrichmentJobStatusToRunStatus(
  status: string,
): PipelineRunStatus {
  switch (status) {
    case "pending":
    case "queued":
      return "queued";
    case "claimed":
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "completed_with_errors":
      return "completed_with_errors";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "running";
  }
}

/**
 * Build the currentStageLabel for a consolidation run.
 */
export function getConsolidationStageLabel(
  status: PipelineRunStatus,
  pendingCount: number,
  runningCount: number,
  totalItems: number,
): string {
  if (status === "completed" || status === "completed_with_errors") {
    return "Settled — review errors or apply results";
  }
  if (status === "failed" || status === "cancelled") {
    return "Run ended — review before proceeding";
  }
  if (runningCount > 0) {
    return "Processing products...";
  }
  if (pendingCount > 0 && totalItems > 0) {
    return `${pendingCount} product${pendingCount === 1 ? "" : "s"} still queued`;
  }
  return "Waiting for items";
}

/**
 * Build the currentStageLabel for an enrichment run.
 */
export function getEnrichmentStageLabel(
  status: PipelineRunStatus,
  pendingCount: number,
  runningCount: number,
  totalItems: number,
): string {
  if (status === "completed" || status === "completed_with_errors") {
    return "Settled — review errors or apply results";
  }
  if (status === "failed" || status === "cancelled") {
    return "Enrichment run ended — review before proceeding";
  }
  if (runningCount > 0) {
    return "Enriching products...";
  }
  if (pendingCount > 0 && totalItems > 0) {
    return `${pendingCount} product${pendingCount === 1 ? "" : "s"} still queued`;
  }
  return "Waiting for enrichment targets";
}
