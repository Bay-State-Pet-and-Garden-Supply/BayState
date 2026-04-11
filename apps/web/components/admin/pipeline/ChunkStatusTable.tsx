"use client";

import { useMemo } from "react";
import {
  Clock,
  Loader2,
  CheckCircle,
  XCircle,
  Server,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface ChunkDetail {
  id: string;
  jobId: string;
  chunkIndex: number;
  skuCount: number;
  status: "pending" | "running" | "completed" | "failed";
  claimedBy: string | null;
  claimedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  skusProcessed: number;
  skusSuccessful: number;
  skusFailed: number;
  errorMessage: string | null;
}

interface ChunkStatusTableProps {
  chunks: ChunkDetail[];
}

const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    icon: Clock,
    badgeClass: "bg-muted text-muted-foreground",
    rowClass: "opacity-60",
  },
  running: {
    label: "Running",
    icon: Loader2,
    badgeClass: "bg-primary/10 text-primary",
    rowClass: "",
  },
  completed: {
    label: "Done",
    icon: CheckCircle,
    badgeClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    rowClass: "",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    rowClass: "",
  },
} as const;

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "—";

  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 0) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatDuration(startStr: string | null, endStr: string | null): string {
  if (!startStr) return "—";

  const start = new Date(startStr).getTime();
  const end = endStr ? new Date(endStr).getTime() : Date.now();
  const diff = Math.max(0, end - start);
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function ChunkStatusTable({ chunks }: ChunkStatusTableProps) {
  const sortedChunks = useMemo(
    () => [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex),
    [chunks],
  );

  if (sortedChunks.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground italic text-center border-t border-dashed">
        No chunks created for this job yet.
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="border-t border-border">
        {/* Header */}
        <div className="grid grid-cols-[3rem_3.5rem_6rem_1fr_5rem_5rem_6rem] gap-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/50 border-b border-border">
          <span>Chunk</span>
          <span>SKUs</span>
          <span>Status</span>
          <span>Runner</span>
          <span>Claimed</span>
          <span>Duration</span>
          <span className="text-right">Result</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border/50">
          {sortedChunks.map((chunk) => {
            const config = STATUS_CONFIG[chunk.status];
            const StatusIcon = config.icon;
            const isRunning = chunk.status === "running";
            const isFailed = chunk.status === "failed";

            return (
              <div key={chunk.id}>
                <div
                  className={`grid grid-cols-[3rem_3.5rem_6rem_1fr_5rem_5rem_6rem] gap-2 px-4 py-2 text-xs items-center transition-colors hover:bg-muted/30 ${config.rowClass} ${isFailed ? "border-l-2 border-l-red-500" : ""}`}
                >
                  {/* Chunk Index */}
                  <span className="font-mono font-medium text-foreground">
                    #{chunk.chunkIndex}
                  </span>

                  {/* SKU Count */}
                  <span className="tabular-nums text-muted-foreground">
                    {chunk.skuCount}
                  </span>

                  {/* Status Badge */}
                  <Badge
                    variant="secondary"
                    className={`inline-flex w-fit items-center gap-1 text-[10px] px-1.5 py-0.5 font-medium ${config.badgeClass}`}
                  >
                    <StatusIcon
                      className={`h-3 w-3 ${isRunning ? "animate-spin" : ""}`}
                    />
                    {config.label}
                  </Badge>

                  {/* Runner */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    {chunk.claimedBy ? (
                      <>
                        <Server className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate font-medium text-foreground">
                          {chunk.claimedBy}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground italic">
                        Unclaimed
                      </span>
                    )}
                  </div>

                  {/* Claimed Time */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="tabular-nums text-muted-foreground cursor-default">
                        {formatRelativeTime(chunk.claimedAt)}
                      </span>
                    </TooltipTrigger>
                    {chunk.claimedAt && (
                      <TooltipContent side="top" className="text-xs">
                        {new Date(chunk.claimedAt).toLocaleString()}
                      </TooltipContent>
                    )}
                  </Tooltip>

                  {/* Duration */}
                  <span className="tabular-nums text-muted-foreground">
                    {formatDuration(chunk.startedAt, chunk.completedAt)}
                  </span>

                  {/* Result */}
                  <div className="text-right tabular-nums">
                    {chunk.status === "pending" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={
                          chunk.skusFailed > 0
                            ? "text-red-600 dark:text-red-400 font-medium"
                            : chunk.status === "completed"
                              ? "text-green-600 dark:text-green-400 font-medium"
                              : "text-foreground"
                        }
                      >
                        {chunk.skusSuccessful}/{chunk.skuCount}
                        {chunk.skusFailed > 0 && (
                          <span className="text-red-500 ml-1">
                            ({chunk.skusFailed} err)
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Error Message Row */}
                {isFailed && chunk.errorMessage && (
                  <div className="flex items-start gap-2 px-4 py-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 border-l-2 border-l-red-500">
                    <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span className="break-all">{chunk.errorMessage}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}

/**
 * Compact summary line for chunk status.
 * e.g. "3/7 chunks done · 2 running · 2 pending"
 */
export function ChunkSummaryLine({
  summary,
}: {
  summary: {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
}) {
  if (summary.total === 0) {
    return null;
  }

  const parts: string[] = [];

  if (summary.completed > 0) {
    parts.push(`${summary.completed}/${summary.total} done`);
  }
  if (summary.running > 0) {
    parts.push(`${summary.running} running`);
  }
  if (summary.pending > 0) {
    parts.push(`${summary.pending} pending`);
  }
  if (summary.failed > 0) {
    parts.push(`${summary.failed} failed`);
  }

  // If nothing started yet
  if (parts.length === 0) {
    parts.push(`${summary.total} chunks queued`);
  }

  return (
    <span className="text-xs text-muted-foreground">
      {parts.join(" · ")}
    </span>
  );
}
