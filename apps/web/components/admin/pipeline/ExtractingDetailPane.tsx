"use client";

import { useMemo, type ReactNode } from "react";
import type { EnrichmentAttempt, JobAssignment } from "@/lib/realtime/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  EnrichmentJobLogsConsole,
  LiveTimer,
  formatDate,
  getDisplaySite,
} from "./EnrichmentCommon";
import { ProgressBar } from "./ProgressBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  type LucideIcon,
  Terminal,
  X,
  XCircle,
} from "lucide-react";
import {
  JOB_STATUS_STYLES,
  formatRelativeTime,
  getJobActivitySummary,
  getJobDisplayStatus,
  getJobLabel,
  getJobModeLabel,
  getJobProgressCounts,
  getJobProgressPercent,
  getJobRunnerLabel,
  humanizeToken,
  isHeartbeatStale,
  isJobActive,
  isJobCancellable,
  isJobStalled,
  isLeaseExpired,
  normalizeJobStatus,
} from "./extracting-utils";

interface ExtractingDetailPaneProps {
  job: JobAssignment | null;
  attempts: EnrichmentAttempt[];
  attemptsConnected: boolean;
  attemptsError: Error | null;
  onCancelJob: (jobId: string) => void;
  isCancelling: boolean;
}

type AttemptStatusMeta = {
  label: string;
  icon: LucideIcon;
  className: string;
};

const ATTEMPT_STATUS_META: Record<EnrichmentAttempt["status"], AttemptStatusMeta> = {
  queued: {
    label: "Queued",
    icon: Clock,
    className:
      "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
  },
  pending: {
    label: "Pending",
    icon: Clock,
    className:
      "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
  },
  running: {
    label: "Running",
    icon: Loader2,
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className:
      "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/70 dark:bg-teal-950/30 dark:text-teal-300",
  },
  success: {
    label: "Success",
    icon: CheckCircle2,
    className:
      "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/70 dark:bg-teal-950/30 dark:text-teal-300",
  },
  partial: {
    label: "Partial",
    icon: AlertCircle,
    className:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300",
  },
  failed: {
    label: "Failed",
    icon: AlertCircle,
    className:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    className:
      "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400",
  },
};

const ATTEMPT_SORT_PRIORITY: Record<EnrichmentAttempt["status"], number> = {
  running: 0,
  failed: 1,
  partial: 2,
  queued: 3,
  pending: 3,
  success: 4,
  completed: 4,
  cancelled: 5,
};

function DetailMetric({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-3">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function AttemptStatusBadge({ status }: { status: EnrichmentAttempt["status"] }) {
  const meta = ATTEMPT_STATUS_META[status];
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-semibold",
        meta.className,
      )}
    >
      <Icon className={cn("h-3 w-3", status === "running" && "animate-spin")} />
      {meta.label}
    </span>
  );
}

function LogLevelBadge({ level }: { level?: string | null }) {
  if (!level) {
    return (
      <span className="inline-flex items-center rounded-sm border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        No log level
      </span>
    );
  }

  const tone = level.toLowerCase();
  const className =
    tone === "error" || tone === "critical"
      ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300"
        : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        className,
      )}
    >
      {level}
    </span>
  );
}

function HealthNotice({
  title,
  description,
  tone,
}: {
  title: string;
  description: string;
  tone: "info" | "warning" | "critical";
}) {
  const className =
    tone === "critical"
      ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300"
        : "border-border bg-muted/20 text-foreground";

  return (
    <div className={cn("rounded-md border px-3 py-3", className)}>
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-sm opacity-90">{description}</div>
        </div>
      </div>
    </div>
  );
}

export function ExtractingDetailPane({
  job,
  attempts,
  attemptsConnected,
  attemptsError,
  onCancelJob,
  isCancelling,
}: ExtractingDetailPaneProps) {
  const progressCounts = useMemo(
    () => (job ? getJobProgressCounts(job) : null),
    [job],
  );
  const progressPercent = useMemo(
    () => (job ? getJobProgressPercent(job) : 0),
    [job],
  );

  const sortedAttempts = useMemo(() => {
    if (!job) return attempts;

    return [...attempts].sort((left, right) => {
      const leftCurrent = left.upc === job.current_upc ? 0 : 1;
      const rightCurrent = right.upc === job.current_upc ? 0 : 1;
      if (leftCurrent !== rightCurrent) {
        return leftCurrent - rightCurrent;
      }

      const priorityDiff =
        ATTEMPT_SORT_PRIORITY[left.status] - ATTEMPT_SORT_PRIORITY[right.status];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    });
  }, [attempts, job]);

  const attemptSummary = useMemo(() => {
    return sortedAttempts.reduce(
      (summary, attempt) => {
        if (attempt.status === "running") summary.running += 1;
        else if (attempt.status === "failed") summary.failed += 1;
        else if (attempt.status === "partial") summary.partial += 1;
        else if (attempt.status === "queued" || attempt.status === "pending") summary.waiting += 1;
        else if (attempt.status === "cancelled") summary.cancelled += 1;
        else summary.succeeded += 1;
        return summary;
      },
      {
        running: 0,
        waiting: 0,
        failed: 0,
        partial: 0,
        cancelled: 0,
        succeeded: 0,
      },
    );
  }, [sortedAttempts]);

  const healthNotices = useMemo(() => {
    if (!job || !progressCounts) return [] as Array<{
      title: string;
      description: string;
      tone: "info" | "warning" | "critical";
    }>;

    const notices: Array<{
      title: string;
      description: string;
      tone: "info" | "warning" | "critical";
    }> = [];

    if ((job.status === "queued" || job.status === "pending") && !job.runner_name && !job.claimed_by) {
      notices.push({
        title: "Waiting for runner",
        description: "No scraper runner has claimed this job yet.",
        tone: "info",
      });
    }

    if (isHeartbeatStale(job)) {
      notices.push({
        title: "Heartbeat looks stale",
        description: `Last heartbeat was ${formatRelativeTime(job.heartbeat_at)}.`,
        tone: "warning",
      });
    }

    if (isLeaseExpired(job)) {
      notices.push({
        title: "Runner lease expired",
        description: "The active runner lease has passed its expiry time.",
        tone: "warning",
      });
    }

    if (job.status === "failed") {
      notices.push({
        title: "Job failed",
        description: job.error_message?.trim() || "The job was marked failed before all attempts finished.",
        tone: "critical",
      });
    }

    if (isJobStalled(job)) {
      notices.push({
        title: "Job looks stalled",
        description: "The runner has stopped sending heartbeats or progress updates for this job.",
        tone: "warning",
      });
    }

    if (job.status === "completed_with_errors" || progressCounts.failed > 0) {
      notices.push({
        title: "Attempt failures detected",
        description: `${progressCounts.failed} attempt${progressCounts.failed === 1 ? "" : "s"} ended in failure.`,
        tone: "warning",
      });
    }

    return notices;
  }, [job, progressCounts]);

  if (!job || !progressCounts) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-12 text-center text-muted-foreground">
        <Activity className="mb-4 h-12 w-12 opacity-20" />
        <h3 className="text-lg font-semibold text-foreground">Select a job to inspect</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Choose a job from the queue to review progress, attempts, runner health, and live logs.
        </p>
      </div>
    );
  }

  const displayStatus = getJobDisplayStatus(job);
  const statusStyle = JOB_STATUS_STYLES[displayStatus];
  const runningAttempts =
    sortedAttempts.length > 0
      ? attemptSummary.running
      : job.status === "running" || job.status === "claimed"
        ? 1
        : 0;
  const waitingAttempts =
    sortedAttempts.length > 0
      ? attemptSummary.waiting
      : Math.max(0, progressCounts.remaining - runningAttempts);
  const latestLogMessage = job.last_log_message?.trim() || "No log message recorded yet.";
  const latestPhase = humanizeToken(job.progress_phase) || "No active phase";

  return (
    <ScrollArea className="h-full bg-muted/10">
      <div className="divide-y divide-border">
        <section className="px-6 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Extracting job
                </div>
                <span
                  className={cn(
                    "inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-semibold",
                    statusStyle.badgeClassName,
                  )}
                >
                  {statusStyle.label}
                </span>
                <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      attemptsConnected ? "bg-emerald-500" : "bg-zinc-400",
                    )}
                  />
                  {attemptsConnected ? "Attempt feed live" : "Attempt snapshot"}
                </span>
              </div>

              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  {getJobLabel(job)}
                </h2>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{job.id}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {getJobModeLabel(job) && (
                  <Badge variant="outline" className="font-medium">
                    Mode {getJobModeLabel(job)}
                  </Badge>
                )}
                {job.model && (
                  <Badge variant="outline" className="font-medium">
                    Model {job.model}
                  </Badge>
                )}
                {job.test_mode && (
                  <Badge variant="outline" className="font-medium">
                    Test mode
                  </Badge>
                )}
                {job.scrapers && job.scrapers.length > 0 && (
                  <Badge variant="outline" className="font-medium">
                    {job.scrapers.join(", ")}
                  </Badge>
                )}
              </div>
            </div>

            {isJobCancellable(job.status) && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onCancelJob(job.id)}
                disabled={isCancelling}
                className="h-9 gap-2 self-start"
              >
                {isCancelling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                Cancel job
              </Button>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <DetailMetric label="Runner" value={getJobRunnerLabel(job)} />
            <DetailMetric label="Created" value={formatDate(job.created_at)} />
            <DetailMetric
              label="Started"
              value={job.started_at ? formatDate(job.started_at) : "Waiting to start"}
            />
            <DetailMetric
              label="Elapsed"
              value={
                <LiveTimer
                  startedAt={job.started_at ?? job.created_at}
                  completedAt={job.completed_at}
                  status={job.status}
                />
              }
            />
            <DetailMetric
              label="Last activity"
              value={formatRelativeTime(
                job.heartbeat_at ??
                  job.progress_updated_at ??
                  job.last_event_at ??
                  job.last_log_at ??
                  job.updated_at ??
                  job.created_at,
              )}
            />
            <DetailMetric label="Heartbeat" value={formatDate(job.heartbeat_at)} />
            <DetailMetric label="Lease expires" value={formatDate(job.lease_expires_at)} />
            <DetailMetric label="Completed" value={formatDate(job.completed_at)} />
            <DetailMetric
              label="Current UPC"
              value={job.current_upc ? <span className="font-mono">{job.current_upc}</span> : "--"}
            />
          </div>
        </section>

        <section className="px-6 py-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Progress and health</h3>
              <p className="text-sm text-muted-foreground">
                Current job state, live runner signals, and latest operational context.
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{progressPercent}% complete</span>
              <span className="ml-2 tabular-nums">
                {progressCounts.processed}/{progressCounts.total || job.upcs.length || 0} handled
              </span>
            </div>
          </div>

          <div className="mt-4">
            <ProgressBar progress={progressPercent} status={normalizeJobStatus(displayStatus)} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <DetailMetric label="Total" value={progressCounts.total} />
            <DetailMetric label="Succeeded" value={progressCounts.completed} />
            <DetailMetric label="Failed" value={progressCounts.failed} />
            <DetailMetric label="Running" value={runningAttempts} />
            <DetailMetric label="Waiting" value={waitingAttempts} />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="space-y-4">
              <div className="rounded-md border border-border/70 bg-card p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Current phase
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {latestPhase}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {getJobActivitySummary(job)}
                    </p>
                  </div>
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Runner context
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {getJobRunnerLabel(job)}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {isJobActive(job.status)
                        ? job.current_upc
                          ? `Currently processing UPC ${job.current_upc}.`
                          : "Waiting for the next attempt update."
                        : "No active runner work at the moment."}
                    </p>
                  </div>
                </div>
              </div>

              {healthNotices.length > 0 && (
                <div className="space-y-3">
                  {healthNotices.map((notice) => (
                    <HealthNotice key={`${notice.title}-${notice.description}`} {...notice} />
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md border border-border/70 bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Latest log event
                  </div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    {formatDate(job.last_log_at ?? job.last_event_at)}
                  </div>
                </div>
                <LogLevelBadge level={job.last_log_level} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{latestLogMessage}</p>
            </div>
          </div>
        </section>

        <section className="px-6 py-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Attempts</h3>
              <p className="text-sm text-muted-foreground">
                UPC-level execution details for the selected job.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{sortedAttempts.length} attempts</Badge>
              {attemptSummary.running > 0 && <Badge variant="outline">{attemptSummary.running} running</Badge>}
              {attemptSummary.waiting > 0 && <Badge variant="outline">{attemptSummary.waiting} waiting</Badge>}
              {attemptSummary.partial > 0 && <Badge variant="outline">{attemptSummary.partial} partial</Badge>}
              {attemptSummary.failed > 0 && <Badge variant="outline">{attemptSummary.failed} failed</Badge>}
            </div>
          </div>

          {attemptsError && (
            <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300">
              Failed to load attempt updates: {attemptsError.message}
            </div>
          )}

          <div className="mt-4 overflow-hidden rounded-md border border-border/70 bg-card">
            {sortedAttempts.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center px-6 py-10 text-center">
                <Clock className="mb-3 h-8 w-8 text-muted-foreground/25" />
                <p className="text-sm font-medium text-foreground">
                  {attemptsConnected
                    ? "No attempt records have arrived yet"
                    : "Attempt feed is syncing"}
                </p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Once the runner begins work, UPC attempts will appear here with status, timing, source, and any errors.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted/20 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">UPC</th>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Duration</th>
                      <th className="px-4 py-3">Runner</th>
                      <th className="px-4 py-3">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sortedAttempts.map((attempt) => {
                      const isCurrentAttempt = attempt.upc === job.current_upc;
                      const productName =
                        attempt.products_ingestion?.input?.name || "Unnamed product";
                      const brandName = attempt.products_ingestion?.brands?.name;
                      const productLine = attempt.products_ingestion?.product_line;

                      return (
                        <tr
                          key={attempt.id}
                          className={cn(
                            "align-top",
                            isCurrentAttempt && "bg-primary/5",
                          )}
                        >
                          <td className="px-4 py-3">
                            <AttemptStatusBadge status={attempt.status} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="min-w-[220px]">
                              <div className="font-medium text-foreground">{productName}</div>
                              {(brandName || productLine) && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {[brandName, productLine].filter(Boolean).join(" • ")}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <span className="font-mono text-xs font-semibold text-foreground">
                                {attempt.upc}
                              </span>
                              {isCurrentAttempt && (
                                <span className="inline-flex w-fit items-center rounded-sm border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                  Current
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {getDisplaySite(attempt.source_url)}
                          </td>
                          <td className="px-4 py-3 text-foreground">
                            <LiveTimer
                              startedAt={attempt.started_at ?? attempt.created_at}
                              completedAt={attempt.completed_at}
                              status={attempt.status}
                            />
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {attempt.claimed_by || "Waiting"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {attempt.error_message ? (
                              <span className="line-clamp-2 text-rose-700 dark:text-rose-300">
                                {attempt.error_message}
                              </span>
                            ) : (
                              <span>--</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="px-6 py-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            Job log stream
          </div>
          <div className="overflow-hidden rounded-md border border-border/70">
            <EnrichmentJobLogsConsole jobId={job.id} />
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}
