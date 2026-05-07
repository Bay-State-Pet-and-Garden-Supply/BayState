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
  plannedWorkUnits: number;
  skuSliceIndex: number | null;
  siteGroupKey: string | null;
  siteGroupLabel: string | null;
  siteDomain: string | null;
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
    badgeClass: "bg-brand-gold/10 text-brand-burgundy border-brand-gold/20",
    rowClass: "opacity-80",
  },
  running: {
    label: "Running",
    icon: Loader2,
    badgeClass: "bg-blue-500/10 text-blue-700 border-blue-500/20",
    rowClass: "",
  },
  completed: {
    label: "Done",
    icon: CheckCircle,
    badgeClass: "bg-brand-forest-green/10 text-brand-forest-green border-brand-forest-green/20",
    rowClass: "",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    badgeClass: "bg-brand-burgundy/10 text-brand-burgundy border-brand-burgundy/20",
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
      <div className="px-4 py-6 text-[10px] font-semibold text-muted-foreground text-center border-t border-border bg-muted">
        No chunks created for this job yet.
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="border border-border bg-card overflow-hidden my-4 mx-1">
        {/* Header */}
        <div className="grid grid-cols-[3.5rem_4rem_8rem_6.5rem_1fr_6rem_6rem_7rem] gap-2 px-4 py-2.5 text-[10px] font-semibold text-muted-foreground bg-muted/30 border-b border-border">
          <span>Chunk</span>
          <span>SKUs</span>
          <span>Site Group</span>
          <span>Status</span>
          <span>Runner</span>
          <span>Claimed</span>
          <span>Duration</span>
          <span className="text-right">Result</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border/10">
          {sortedChunks.map((chunk) => {
            const config = STATUS_CONFIG[chunk.status];
            const StatusIcon = config.icon;
            const isRunning = chunk.status === "running";
            const isFailed = chunk.status === "failed";

            return (
              <div key={chunk.id}>
                <div
                  className={`grid grid-cols-[3.5rem_4rem_8rem_6.5rem_1fr_6rem_6rem_7rem] gap-2 px-4 py-2.5 text-xs items-center transition-colors hover:bg-muted/30 ${config.rowClass}`}
                >
                  {/* Chunk Index */}
                  <span className="font-mono font-bold text-foreground">
                    #{chunk.chunkIndex}
                  </span>

                  {/* SKU Count */}
                  <span className="tabular-nums font-semibold text-muted-foreground">
                    {chunk.skuCount}
                  </span>

                  <div className="min-w-0">
                    <div className="truncate font-semibold text-foreground">
                      {chunk.siteGroupLabel ?? "Default"}
                    </div>
                    <div className="truncate text-[10px] font-semibold text-muted-foreground">
                      {chunk.plannedWorkUnits} work units
                    </div>
                  </div>

                  {/* Status Badge */}
                  <Badge
                    variant="secondary"
                    className={`inline-flex w-fit items-center gap-1.5 text-[9px] px-1.5 py-0.5 font-semibold rounded-none border border-border ${config.badgeClass}`}
                  >
                    <StatusIcon
                      className={`h-3 w-3 ${isRunning ? "animate-spin" : ""}`}
                    />
                    {config.label}
                  </Badge>

                  {/* Runner */}
                  <div className="flex items-center gap-2 min-w-0">
                    {chunk.claimedBy ? (
                      <>
                        <Server className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate font-bold text-foreground">
                          {chunk.claimedBy}
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] font-semibold text-muted-foreground italic">
                        Unclaimed
                      </span>
                    )}
                  </div>

                  {/* Claimed Time */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="tabular-nums text-[10px] font-semibold text-muted-foreground cursor-default">
                        {formatRelativeTime(chunk.claimedAt)}
                      </span>
                    </TooltipTrigger>
                    {chunk.claimedAt && (
                      <TooltipContent side="top" className="rounded-none border border-border bg-card text-[10px] font-semibold">
                        {new Date(chunk.claimedAt).toLocaleString()}
                      </TooltipContent>
                    )}
                  </Tooltip>

                  {/* Duration */}
                  <span className="tabular-nums text-[10px] font-semibold text-muted-foreground">
                    {formatDuration(chunk.startedAt, chunk.completedAt)}
                  </span>

                  {/* Result */}
                  <div className="text-right tabular-nums font-semibold text-[10px]">
                    {chunk.status === "pending" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={
                          chunk.skusFailed > 0
                            ? "text-brand-burgundy font-bold"
                            : chunk.status === "completed"
                              ? "text-brand-forest-green font-bold"
                              : "text-foreground"
                        }
                      >
                        {chunk.skusSuccessful}/{chunk.skuCount}
                        {chunk.skusFailed > 0 && (
                          <span className="text-brand-burgundy ml-1">
                            ({chunk.skusFailed} err)
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Error Message Row */}
                {isFailed && chunk.errorMessage && (
                  <div className="flex items-start gap-2 px-4 py-2 text-[11px] font-medium text-brand-burgundy bg-brand-burgundy/5 border-l border-l-brand-burgundy border-t border-border/10">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
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
    <span className="text-[10px] font-semibold text-muted-foreground">
      {parts.join(" · ")}
    </span>
  );
}
