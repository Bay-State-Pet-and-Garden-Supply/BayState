"use client";

import {
  Loader2,
  XCircle,
  RefreshCw,
  Trash2,
  AlertTriangle,
  RotateCcw,
  Cpu,
  Fingerprint,
  CheckCircle2,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  StatusBadge,
  formatTimestamp,
  formatElapsed,
  isTerminalStatus,
  getProviderLabel,
} from "./shared";
import type { ConsolidationJob, ConsolidationJobItemActivity } from "./shared";
import { useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

interface DirectConsolidationJobViewProps {
  job: ConsolidationJob;
  onCancel: (id: string) => void;
  onRefresh: (id: string) => void;
  onDelete: (id: string) => void;
  onRetryFailed?: (id: string) => void;
  retryingId?: string | null;
  cancellingId: string | null;
  deletingId: string | null;
  refreshingId: string | null;
}

// ============================================================================
// ItemRow — per-item processing row
// ============================================================================

function ItemRow({
  item,
  isActive,
}: {
  item: ConsolidationJobItemActivity;
  isActive: boolean;
}) {
  const statusText = (() => {
    if (item.completed_at) return `Completed ${formatTimestamp(item.completed_at)}`;
    if (item.started_at) return `Started ${formatTimestamp(item.started_at)}`;
    return "Waiting";
  })();

  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold border-b border-border/50 last:border-b-0 transition-colors",
        isActive && "bg-brand-burgundy/5",
        item.status === "failed" && "bg-destructive/5",
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isActive ? (
          <Loader2 className="h-3 w-3 animate-spin text-brand-burgundy shrink-0" />
        ) : item.status === "completed" ? (
          <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
        ) : item.status === "failed" ? (
          <XCircle className="h-3 w-3 text-destructive shrink-0" />
        ) : (
          <div className="h-3 w-3 rounded-full border border-muted-foreground/30 shrink-0" />
        )}
        <span className="font-mono text-foreground">{item.upc}</span>
        <StatusBadge status={item.status} />
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-2">
        {item.error_message ? (
          <span className="max-w-[40ch] truncate text-destructive" title={item.error_message}>
            {item.error_message}
          </span>
        ) : (
          <span className="text-muted-foreground">{statusText}</span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// DirectConsolidationJobView
// ============================================================================

export function DirectConsolidationJobView({
  job,
  onCancel,
  onRefresh,
  onDelete,
  onRetryFailed,
  retryingId,
  cancellingId,
  deletingId,
  refreshingId,
}: DirectConsolidationJobViewProps) {
  const llmModel = job.metadata?.llm_model as string | undefined;
  const providerLabel = getProviderLabel(job.provider);
  const pendingCount = job.pendingCount ?? Math.max(job.totalProducts - job.processedCount, 0);
  const runningCount = job.runningCount ?? 0;
  const isRunning = job.status === "running" || job.status === "in_progress";
  const processedCount = job.successCount + job.errorCount;

  // Sort items: running first, then failed, completed, pending
  const sortedItems = useMemo(() => {
    if (!job.recentItems || job.recentItems.length === 0) return [];
    const items = [...job.recentItems];
    items.sort((a, b) => {
      const statusOrder = (s: string) => {
        if (s === "running" || s === "in_progress") return 0;
        if (s === "failed") return 1;
        if (s === "completed") return 2;
        return 3;
      };
      const diff = statusOrder(a.status) - statusOrder(b.status);
      if (diff !== 0) return diff;
      // Most recent first within same status
      return (b.started_at || b.created_at || "").localeCompare(a.started_at || a.created_at || "");
    });
    return items;
  }, [job.recentItems]);

  return (
    <div className="rounded-none border border-border bg-card p-5 transition-colors hover:bg-accent/5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-base text-foreground">
              {job.description || `Consolidation Job ${job.id.slice(0, 8)}`}
            </h3>
            <StatusBadge status={job.status} />
            <Badge
              variant="secondary"
              className="rounded-none border border-violet-300 bg-violet-50 font-semibold text-[10px] h-5 tracking-widest text-violet-700"
            >
              <Play className="mr-1 h-3 w-3" />
              Direct Processing
            </Badge>
            {providerLabel && (
              <Badge variant="secondary" className="rounded-none border border-border bg-muted font-semibold text-[10px] h-5 tracking-widest">
                <Cpu className="mr-1 h-3 w-3" />
                {providerLabel}
              </Badge>
            )}
            {llmModel && (
              <Badge variant="secondary" className="rounded-none border border-border bg-muted font-semibold text-[10px] h-5 tracking-widest">
                {llmModel}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-muted-foreground tracking-widest">
            <div className="flex items-center gap-1">
              <Fingerprint className="h-3 w-3" />
              <span className="font-mono normal-case">{job.id.slice(0, 12)}</span>
            </div>
            <span>•</span>
            <span>Started {formatTimestamp(job.createdAt)}</span>
            <span>•</span>
            <span>{formatElapsed(job.createdAt)} ago</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRefresh(job.id)}
            disabled={refreshingId === job.id}
            title="Refresh status"
            className="h-8 w-8 p-0 hover:bg-muted"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshingId === job.id ? "animate-spin" : ""}`}
            />
          </Button>
          {!isTerminalStatus(job.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCancel(job.id)}
              disabled={cancellingId === job.id}
              className="h-8 rounded-none border border-destructive text-[10px] font-semibold text-destructive hover:bg-destructive/5 tracking-widest"
            >
              {cancellingId === job.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <XCircle className="mr-1.5 h-3.5 w-3.5" />
                  Cancel
                </>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(job.id)}
            disabled={deletingId === job.id}
            className="h-8 rounded-none border border-border text-[10px] font-semibold text-muted-foreground hover:bg-destructive/5 hover:text-destructive tracking-widest"
          >
            {deletingId === job.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </>
            )}
          </Button>
          {job.status === "failed" && job.errorCount > 0 && onRetryFailed && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRetryFailed(job.id)}
              disabled={retryingId === job.id}
              className="h-8 rounded-none border border-amber-500 text-[10px] font-semibold text-amber-700 hover:bg-amber-50 tracking-widest"
            >
              {retryingId === job.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Retry Failed
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Live Processing Indicator */}
      {isRunning && (
        <div className="mt-4 rounded-none border border-brand-burgundy/20 bg-brand-burgundy/5 p-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-brand-burgundy" />
            <span className="text-xs font-semibold text-brand-burgundy">
              Processing item {processedCount + 1} of {job.totalProducts}
            </span>
          </div>
        </div>
      )}

      {/* Quick Progress Summary — numeric counts */}
      <div className="mt-4 rounded-none border border-border bg-muted/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-4 text-[10px] font-semibold">
            <span className="text-muted-foreground">
              Items: <b className="text-foreground">{processedCount}/{job.totalProducts}</b>
            </span>
            <span className="text-muted-foreground">
              Success: <b className="text-green-600">{job.successCount}</b>
            </span>
            {job.errorCount > 0 && (
              <span className="text-muted-foreground">
                Failed: <b className="text-destructive">{job.errorCount}</b>
              </span>
            )}
            {pendingCount > 0 && (
              <span className="text-muted-foreground">
                Pending: <b className="text-foreground">{pendingCount}</b>
              </span>
            )}
          </div>
          <div className="text-[10px] font-semibold text-muted-foreground">
            {isRunning
              ? "Items are processed one-by-one. Refresh to see latest."
              : isTerminalStatus(job.status)
                ? `Job ${job.status}. ${job.errorCount > 0 ? "Review errors below." : "All items processed."}`
                : "No pending items remain."}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground tracking-widest">
          <span>Item Progress</span>
          <span className="text-foreground">{processedCount}/{job.totalProducts}</span>
        </div>
        <div className="h-3 w-full rounded-none border border-border bg-muted overflow-hidden">
          <div
            className="h-full bg-brand-burgundy transition-all duration-300"
            style={{ width: `${job.totalProducts > 0 ? (processedCount / job.totalProducts) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Error Warning */}
      {job.errorCount > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-none border border-destructive bg-destructive/5 px-3 py-2 text-[10px] font-semibold text-destructive tracking-widest">
          <AlertTriangle className="h-3.5 w-3.5" />
          {job.errorCount} product{job.errorCount !== 1 ? "s" : ""} failed consolidation
        </div>
      )}

      {/* Per-Item Processing Table */}
      {sortedItems.length > 0 && (
        <div className="mt-4 rounded-none border border-border bg-background">
          <div className="border-b border-border px-3 py-2">
            <p className="text-[10px] font-semibold tracking-widest text-muted-foreground">
              ITEM ACTIVITY
              {isRunning && (
                <span className="ml-2 text-brand-burgundy">
                  ({sortedItems.filter(i => i.status === "running" || i.status === "in_progress").length} active)
                </span>
              )}
            </p>
          </div>
          <div>
            {sortedItems.map((item) => (
              <ItemRow
                key={`${item.upc}-${item.updated_at || item.created_at || item.status}`}
                item={item}
                isActive={item.status === "running" || item.status === "in_progress"}
              />
            ))}
          </div>
        </div>
      )}

      {/* Status summary if no items */}
      {sortedItems.length === 0 && isTerminalStatus(job.status) && (
        <div className="mt-4 flex items-center justify-center py-4 text-[10px] font-semibold text-muted-foreground tracking-widest border border-dashed border-border rounded-none">
          {job.successCount > 0
            ? `${job.successCount} product${job.successCount !== 1 ? 's' : ''} consolidated successfully.`
            : "No item activity recorded for this job."}
        </div>
      )}

      {/* Auto-applied indicator for completed jobs */}
      {(job.status === "completed" || job.status === "completed_with_errors") && (
        <div className="mt-4 flex items-center justify-between rounded-none border border-brand-forest-green/30 bg-brand-forest-green/5 px-4 py-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-brand-forest-green" />
            <span className="text-[10px] font-semibold text-brand-forest-green tracking-widest">
              Results auto-applied — no manual apply needed
            </span>
          </div>
          {job.errorCount === 0 && (
            <span className="text-[10px] font-semibold text-muted-foreground tracking-widest">
              {job.successCount} product{job.successCount !== 1 ? "s" : ""} consolidated
            </span>
          )}
        </div>
      )}
    </div>
  );
}
