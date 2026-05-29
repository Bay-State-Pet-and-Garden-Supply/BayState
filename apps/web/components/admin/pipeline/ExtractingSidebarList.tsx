"use client";

import type { JobAssignment } from "@/lib/realtime/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, AlertCircle, ArrowRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  JOB_STATUS_STYLES,
  formatRelativeTime,
  getJobActivitySummary,
  getJobDisplayStatus,
  getJobLabel,
  getJobLastActivityAt,
  getJobProgressCounts,
  getJobProgressPercent,
  getJobRunnerLabel,
  humanizeToken,
  isHeartbeatStale,
  isJobStalled,
} from "./extracting-utils";

interface ExtractingSidebarListProps {
  jobs: JobAssignment[];
  selectedJobId: string | null;
  onSelectJob: (jobId: string) => void;
}

export function ExtractingSidebarList({
  jobs,
  selectedJobId,
  onSelectJob,
}: ExtractingSidebarListProps) {
  return (
    <ScrollArea className="h-full">
      <div className="border-b border-border bg-muted/20 px-4 py-4">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Extraction queue
        </div>
        <h3 className="mt-1 text-base font-semibold text-foreground">Monitor jobs</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a job to inspect attempts, runner health, and live logs.
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center px-6 text-center">
          <Activity className="mb-3 h-8 w-8 text-muted-foreground/25" />
          <p className="text-sm font-medium text-foreground">No extraction jobs in view</p>
          <p className="mt-1 text-sm text-muted-foreground">
            New jobs will appear here as soon as they are queued.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {jobs.map((job) => {
            const displayStatus = getJobDisplayStatus(job);
            const statusStyle = JOB_STATUS_STYLES[displayStatus];
            const progressPercent = getJobProgressPercent(job);
            const counts = getJobProgressCounts(job);
            const lastActivityAt = getJobLastActivityAt(job);
            const staleHeartbeat = isHeartbeatStale(job);
            const isStalled = isJobStalled(job);
            const currentPhase = humanizeToken(job.progress_phase);

            return (
              <button
                key={job.id}
                type="button"
                onClick={() => onSelectJob(job.id)}
                className={cn(
                  "w-full px-4 py-4 text-left transition-colors",
                  selectedJobId === job.id
                    ? "bg-primary/5"
                    : "hover:bg-muted/30",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full shrink-0",
                          statusStyle.dotClassName,
                        )}
                      />
                      <span className="truncate text-sm font-semibold text-foreground">
                        {getJobLabel(job)}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {job.id.slice(0, 8)}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-sm border px-2 py-0.5 text-[10px] font-semibold",
                      statusStyle.badgeClassName,
                    )}
                  >
                    {statusStyle.label}
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span>
                      {counts.processed}/{counts.total || job.upcs.length || 0} handled
                    </span>
                    <span className="tabular-nums text-foreground">{progressPercent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-300",
                        displayStatus === "stalled"
                          ? "bg-amber-500"
                          : job.status === "failed"
                            ? "bg-rose-500"
                            : job.status === "completed_with_errors"
                              ? "bg-amber-500"
                              : job.status === "completed"
                                ? "bg-teal-500"
                                : "bg-primary",
                      )}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="text-muted-foreground">Runner</div>
                    <div className="truncate font-medium text-foreground">
                      {getJobRunnerLabel(job)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Last activity</div>
                    <div
                      className={cn(
                        "font-medium",
                        staleHeartbeat && "text-amber-700 dark:text-amber-300",
                      )}
                    >
                      {formatRelativeTime(lastActivityAt)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                  {counts.failed > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-2 py-0.5 font-medium text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300">
                      <AlertCircle className="h-3 w-3" />
                      {counts.failed} failed
                    </span>
                  )}
                  {currentPhase && (
                    <span className="inline-flex items-center rounded-sm border border-border bg-background px-2 py-0.5 font-medium text-muted-foreground">
                      {currentPhase}
                    </span>
                  )}
                  {job.current_upc && (
                    <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-background px-2 py-0.5 font-mono font-medium text-foreground">
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      {job.current_upc}
                    </span>
                  )}
                </div>

                <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                  {getJobActivitySummary(job)}
                </p>

                {(staleHeartbeat || isStalled) && (
                  <div className="mt-3 inline-flex items-center gap-1 rounded-sm border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300">
                    <Clock className="h-3 w-3" />
                    {isStalled ? "Job looks stalled" : "Heartbeat looks stale"}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </ScrollArea>
  );
}
