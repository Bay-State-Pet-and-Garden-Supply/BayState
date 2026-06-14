import type { JobAssignment } from "@/lib/realtime/types";
import type { JobStatus } from "./ProgressBar";

export type MonitoringJobStatus = JobAssignment["status"] | "stalled";

const JOB_SORT_PRIORITY: Record<JobAssignment["status"], number> = {
  running: 0,
  claimed: 0,
  queued: 1,
  pending: 1,
  completed_with_errors: 2,
  failed: 2,
  completed: 3,
  cancelled: 4,
};

export const JOB_STATUS_STYLES: Record<
  MonitoringJobStatus,
  {
    label: string;
    badgeClassName: string;
    dotClassName: string;
  }
> = {
  running: {
    label: "Running",
    badgeClassName:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300",
    dotClassName: "bg-emerald-500",
  },
  stalled: {
    label: "Stalled",
    badgeClassName:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300",
    dotClassName: "bg-amber-500",
  },
  claimed: {
    label: "Claimed",
    badgeClassName:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300",
    dotClassName: "bg-emerald-500",
  },
  queued: {
    label: "Queued",
    badgeClassName:
      "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
    dotClassName: "bg-zinc-400",
  },
  pending: {
    label: "Pending",
    badgeClassName:
      "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
    dotClassName: "bg-zinc-400",
  },
  completed_with_errors: {
    label: "Done with errors",
    badgeClassName:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300",
    dotClassName: "bg-amber-500",
  },
  failed: {
    label: "Failed",
    badgeClassName:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300",
    dotClassName: "bg-rose-500",
  },
  completed: {
    label: "Completed",
    badgeClassName:
      "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/70 dark:bg-teal-950/30 dark:text-teal-300",
    dotClassName: "bg-teal-500",
  },
  cancelled: {
    label: "Cancelled",
    badgeClassName:
      "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400",
    dotClassName: "bg-zinc-400",
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toTimestamp(value?: string | null) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function asConfig(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getConfigString(config: Record<string, unknown> | null, key: string) {
  const value = config?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function humanizeToken(value?: string | null) {
  if (!value) return "";

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function isJobActive(status: JobAssignment["status"]) {
  return (
    status === "running" ||
    status === "claimed" ||
    status === "queued" ||
    status === "pending"
  );
}

export function isJobCancellable(status: JobAssignment["status"]) {
  return status === "running" || status === "claimed" || status === "queued";
}

export function normalizeJobStatus(status: MonitoringJobStatus): JobStatus {
  if (status === "running" || status === "claimed") {
    return "running";
  }

  if (status === "stalled") {
    return "stalled";
  }

  if (status === "completed") {
    return "completed";
  }

  if (status === "completed_with_errors") {
    return "completed_with_errors";
  }

  if (status === "failed") {
    return "failed";
  }

  if (status === "cancelled") {
    return "cancelled";
  }

  return "pending";
}

export function getJobLabel(job: JobAssignment) {
  const config = asConfig(job.config);
  const preferredLabel = [
    getConfigString(config, "batch_label"),
    getConfigString(config, "batch_name"),
    getConfigString(config, "cohort_name"),
    getConfigString(config, "job_label"),
    getConfigString(config, "job_name"),
    getConfigString(config, "name"),
    getConfigString(config, "description"),
  ].find(Boolean);

  return preferredLabel ?? `Extraction job ${job.id.slice(0, 8)}`;
}

export function getJobModeLabel(job: JobAssignment) {
  const config = asConfig(job.config);
  const mode =
    job.mode ??
    getConfigString(config, "extraction_mode") ??
    getConfigString(config, "mode");

  return mode ? humanizeToken(mode) : null;
}

export function getJobProgressCounts(job: JobAssignment) {
  const total = Math.max(0, job.total_count ?? job.items_total ?? job.upcs?.length ?? 0);
  const failed = Math.max(0, job.failed_count ?? 0);
  const processedFallback = Math.max(0, job.items_processed ?? 0);
  const completed = Math.max(
    0,
    job.completed_count ?? Math.max(0, processedFallback - failed),
  );
  const processed = Math.max(processedFallback, completed + failed);
  const remaining = total > 0 ? Math.max(0, total - processed) : 0;

  return {
    total,
    completed,
    failed,
    processed,
    remaining,
  };
}

export function getJobProgressPercent(job: JobAssignment) {
  if (
    typeof job.progress_percent === "number" &&
    Number.isFinite(job.progress_percent)
  ) {
    return clamp(Math.round(job.progress_percent), 0, 100);
  }

  const { total, processed } = getJobProgressCounts(job);
  if (!total) {
    return 0;
  }

  return clamp(Math.round((processed / total) * 100), 0, 100);
}

export function getJobRunnerLabel(job: JobAssignment) {
  return (
    job.runner_name?.trim() ||
    job.claimed_by?.trim() ||
    (isJobActive(job.status) ? "Waiting for runner" : "No runner recorded")
  );
}

export function getJobLastActivityAt(job: JobAssignment) {
  return (
    job.heartbeat_at ??
    job.progress_updated_at ??
    job.last_event_at ??
    job.last_log_at ??
    job.updated_at ??
    job.completed_at ??
    job.started_at ??
    job.created_at ??
    null
  );
}

export function formatRelativeTime(value?: string | null) {
  if (!value) return "--";

  const diffMs = Date.now() - toTimestamp(value);
  if (!Number.isFinite(diffMs) || diffMs < 0) return "Just now";

  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 10) return "Just now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(value).toLocaleDateString();
}

export function compareMonitoringJobs(left: JobAssignment, right: JobAssignment) {
  const priorityDiff = JOB_SORT_PRIORITY[left.status] - JOB_SORT_PRIORITY[right.status];
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return toTimestamp(getJobLastActivityAt(right)) - toTimestamp(getJobLastActivityAt(left));
}

export function isHeartbeatStale(job: JobAssignment, thresholdMs = 2 * 60 * 1000) {
  if (!isJobActive(job.status) || !job.heartbeat_at) {
    return false;
  }

  return Date.now() - toTimestamp(job.heartbeat_at) > thresholdMs;
}

export function isLeaseExpired(job: JobAssignment) {
  if (!isJobActive(job.status) || !job.lease_expires_at) {
    return false;
  }

  return toTimestamp(job.lease_expires_at) < Date.now();
}

export function isJobStalled(job: JobAssignment, thresholdMs = 2 * 60 * 1000) {
  if (job.status !== "running" && job.status !== "claimed") {
    return false;
  }

  if (isLeaseExpired(job) || isHeartbeatStale(job, thresholdMs)) {
    return true;
  }

  const lastActivityAt =
    job.progress_updated_at ??
    job.last_event_at ??
    job.last_log_at ??
    job.updated_at ??
    job.started_at ??
    job.created_at ??
    null;

  if (!lastActivityAt) {
    return false;
  }

  return Date.now() - toTimestamp(lastActivityAt) > thresholdMs;
}

export function getJobDisplayStatus(job: JobAssignment): MonitoringJobStatus {
  return isJobStalled(job) ? "stalled" : job.status;
}

// =============================================================================
// Cascade extraction helpers (for product-level progress view)
// =============================================================================

export interface CascadeProductProgress {
  upc: string;
  productName: string | null;
  attemptStatus: string | null;
  claimed: boolean;
  runnerName: string | null;
  sourceCounts: {
    found: number;
    not_stocked: number;
    source_error: number;
    skipped: number;
  };
  totalSources: number;
  sourceOutcomes: Array<{
    source_slug: string;
    outcome: string;
    attempted_at: string | null;
    error_message: string | null;
  }>;
}

/**
 * Compute a display status for a cascade product based on attempt/source state.
 *   queued: no attempt or attempt is queued/pending
 *   running: attempt is running/claimed
 *   completed: attempt completed with at least one source found
 *   failed: attempt completed with all sources errored
 */
export function getCascadeProductStatus(
  progress: CascadeProductProgress,
): "queued" | "running" | "completed" | "failed" {
  if (progress.attemptStatus === "running" || progress.attemptStatus === "claimed") {
    return "running";
  }
  if (
    progress.attemptStatus === "success" ||
    progress.attemptStatus === "partial" ||
    progress.attemptStatus === "completed"
  ) {
    return progress.sourceCounts.found > 0 ? "completed" : "failed";
  }
  if (progress.attemptStatus === "failed" || progress.attemptStatus === "cancelled") {
    return "failed";
  }
  // No attempt or queued/pending
  if (!progress.attemptStatus || progress.attemptStatus === "queued" || progress.attemptStatus === "pending") {
    return "queued";
  }
  return "queued";
}

/**
 * Human-readable summary of source progress.
 * Examples: "2/5 sources done, 1 errored", "3 sources found"
 */
export function getSourceProgressLabel(progress: CascadeProductProgress): string {
  const total = progress.totalSources;
  const done = progress.sourceCounts.found + progress.sourceCounts.not_stocked;

  if (total === 0) {
    if (progress.attemptStatus === "queued" || !progress.attemptStatus) {
      return "Waiting for runner…";
    }
    return "No source data";
  }

  const parts: string[] = [];
  if (done > 0) {
    parts.push(`${done}/${total} sources done`);
  }
  if (progress.sourceCounts.source_error > 0) {
    parts.push(`${progress.sourceCounts.source_error} errored`);
  }
  if (progress.sourceCounts.skipped > 0) {
    parts.push(`${progress.sourceCounts.skipped} skipped`);
  }

  return parts.length > 0 ? parts.join(", ") : `${total} sources pending`;
}

/**
 * Check if a cascade product is orphaned: in extracting status but
 * no active or queued enrichment attempt exists.
 */
export function isCascadeProductOrphaned(progress: CascadeProductProgress): boolean {
  return (
    !progress.attemptStatus ||
    progress.attemptStatus === "failed" ||
    progress.attemptStatus === "cancelled"
  );
}

// =============================================================================
// Original job-level helpers (unchanged below)
// =============================================================================

export function getJobActivitySummary(job: JobAssignment) {
  if (job.progress_message?.trim()) {
    return job.progress_message.trim();
  }

  if (job.current_upc) {
    return `Working on UPC ${job.current_upc}`;
  }

  if (job.last_log_message?.trim()) {
    return job.last_log_message.trim();
  }

  if (job.status === "queued" || job.status === "pending") {
    return "Waiting for a runner to claim this job.";
  }

  if (job.status === "completed") {
    return "Job finished successfully.";
  }

  if (job.status === "completed_with_errors") {
    return "Job finished with attempt failures.";
  }

  if (job.status === "failed") {
    return job.error_message?.trim() || "Job failed before completion.";
  }

  if (isJobStalled(job)) {
    return "Runner activity stopped before the job finished. Review logs or recover the job.";
  }

  if (job.status === "cancelled") {
    return "Job was cancelled before finishing.";
  }

  return "No recent job events yet.";
}
