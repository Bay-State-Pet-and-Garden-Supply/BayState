"use client";

import type { JobAssignment } from "@/lib/realtime/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, AlertCircle, ArrowRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  JOB_STATUS_STYLES,
  getJobDisplayStatus,
  getJobLabel,
  getJobProgressCounts,
  getJobProgressPercent,
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
          Select a job to inspect attempts and live logs.
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
            const staleHeartbeat = isHeartbeatStale(job);
            const isStalled = isJobStalled(job);

            return (
              <button
                key={job.id}
                type="button"
                onClick={() => onSelectJob(job.id)}
                className={cn(
                  "w-full px-4 py-3 text-left transition-colors",
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
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      ID: {job.id.slice(0, 8)}
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

                <div className="mt-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span>
                      {counts.processed}/{counts.total || job.upcs.length || 0} handled
                    </span>
                    <span className="tabular-nums text-foreground">{progressPercent}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
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

                {/* Compact Footer containing all tags in a single row */}
                {(counts.failed > 0 || job.current_upc || staleHeartbeat || isStalled) && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                    {counts.failed > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-medium text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300">
                        <AlertCircle className="h-2.5 w-2.5" />
                        {counts.failed} failed
                      </span>
                    )}
                    {job.current_upc && (
                      <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono font-medium text-foreground">
                        <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                        {job.current_upc}
                      </span>
                    )}
                    {(staleHeartbeat || isStalled) && (
                      <span className="inline-flex items-center gap-1 rounded-sm border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300">
                        <Clock className="h-2.5 w-2.5" />
                        {isStalled ? "Stalled" : "Stale"}
                      </span>
                    )}
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
