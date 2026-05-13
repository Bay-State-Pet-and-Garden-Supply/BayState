import {
  Loader2,
  XCircle,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Zap,
  RotateCcw,
  Cpu,
  Fingerprint,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  StatusBadge,
  formatTimestamp,
  formatElapsed,
  isTerminalStatus,
  getProviderLabel,
} from "./shared";
import type { ConsolidationJob } from "./shared";
import { Badge } from "@/components/ui/badge";

// ============================================================================
// Types
// ============================================================================

interface ConsolidationJobCardProps {
  job: ConsolidationJob;
  onCancel: (id: string) => void;
  onApply: (id: string) => void;
  onRefresh: (id: string) => void;
  onDelete: (id: string) => void;
  onRetryFailed?: (id: string) => void;
  retryingId?: string | null;
  cancellingId: string | null;
  deletingId: string | null;
  applyingId: string | null;
  refreshingId: string | null;
}

// ============================================================================
// ConsolidationJobCard
// ============================================================================

export function ConsolidationJobCard({
  job,
  onCancel,
  onApply,
  onRefresh,
  onDelete,
  onRetryFailed,
  retryingId,
  cancellingId,
  deletingId,
  applyingId,
  refreshingId,
}: ConsolidationJobCardProps) {
  const llmModel = job.metadata?.llm_model as string | undefined;
  const executionMode = job.execution_mode || undefined;
  const providerLabel = getProviderLabel(job.provider);
  const pendingCount = job.pendingCount ?? Math.max(job.totalProducts - job.processedCount, 0);
  const runningCount = job.runningCount ?? 0;
  const isDirectChat = executionMode === "direct_chat_chunks";

  return (
    <div className="rounded-none border border-border bg-card p-5 transition-colors hover:bg-accent/5">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-base text-foreground">
              {job.description || `Consolidation Job ${job.id.slice(0, 8)}`}
            </h3>
            <StatusBadge status={job.status} />
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
            {isDirectChat && (
              <>
                <span>•</span>
                <span className="text-violet-600">Direct item processing</span>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRefresh(job.id)}
            disabled={refreshingId === job.id}
            title="Refresh status (read-only)"
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

      <div className="mt-5 rounded-none border border-border bg-muted/20 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-foreground">Current state</p>
            <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
              {pendingCount > 0 && !isTerminalStatus(job.status)
                ? `${pendingCount} product${pendingCount === 1 ? "" : "s"} still queued. Newly submitted jobs run automatically; refresh to check progress.`
                : isTerminalStatus(job.status)
                  ? "This job is finished. Review errors or apply successful results."
                  : "No queued products remain."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] font-semibold sm:grid-cols-4">
            <span className="rounded-none border border-border bg-background px-2 py-1 text-muted-foreground">Pending <b className="text-foreground">{pendingCount}</b></span>
            <span className="rounded-none border border-border bg-background px-2 py-1 text-muted-foreground">Running <b className="text-foreground">{runningCount}</b></span>
            <span className="rounded-none border border-border bg-background px-2 py-1 text-muted-foreground">Done <b className="text-status-success">{job.successCount}</b></span>
            <span className="rounded-none border border-border bg-background px-2 py-1 text-muted-foreground">Failed <b className={job.errorCount > 0 ? "text-destructive" : "text-foreground"}>{job.errorCount}</b></span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-none border border-border p-3 bg-muted/20">
          <p className="text-2xl font-bold text-foreground">
            {job.totalProducts}
          </p>
          <p className="text-[10px] font-semibold text-muted-foreground tracking-widest">Total</p>
        </div>
        <div className="rounded-none border border-border p-3 bg-blue-50/20">
          <p className="text-2xl font-bold text-blue-600">
            {job.processedCount}
          </p>
          <p className="text-[10px] font-semibold text-muted-foreground tracking-widest">Processed</p>
        </div>
        <div className="rounded-none border border-border p-3 bg-status-success/10">
          <p className="text-2xl font-bold text-status-success">
            {job.successCount}
          </p>
          <p className="text-[10px] font-semibold text-muted-foreground tracking-widest">Success</p>
        </div>
        <div className="rounded-none border border-border p-3 bg-destructive/10">
          <p
            className={`text-2xl font-bold ${job.errorCount > 0 ? "text-destructive" : "text-muted-foreground"}`}
          >
            {job.errorCount}
          </p>
          <p className="text-[10px] font-semibold text-muted-foreground tracking-widest">Errors</p>
        </div>
      </div>

      {/* Error Warning */}
      {job.errorCount > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-none border border-destructive bg-destructive/5 px-3 py-2 text-[10px] font-semibold text-destructive tracking-widest">
          <AlertTriangle className="h-3.5 w-3.5" />
          {job.errorCount} product{job.errorCount !== 1 ? "s" : ""} failed consolidation
        </div>
      )}

      {job.recentItems && job.recentItems.length > 0 && (
        <div className="mt-4 rounded-none border border-border bg-background">
          <div className="border-b border-border px-3 py-2">
            <p className="text-[10px] font-semibold tracking-widest text-muted-foreground">RECENT ITEM ACTIVITY</p>
          </div>
          <div className="divide-y divide-border">
            {job.recentItems.map((item) => (
              <div key={`${item.sku}-${item.updated_at || item.created_at || item.status}`} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-foreground">{item.sku}</span>
                  <StatusBadge status={item.status} />
                </div>
                {item.error_message ? (
                  <span className="max-w-[52ch] truncate text-[10px] font-semibold text-destructive">{item.error_message}</span>
                ) : (
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {item.completed_at ? `Completed ${formatTimestamp(item.completed_at)}` : item.started_at ? `Started ${formatTimestamp(item.started_at)}` : "Waiting"}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="mt-5 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground tracking-widest">
          <span>Queue Progress</span>
          <span className="text-foreground">{job.progress}%</span>
        </div>
        <div className="h-3 w-full rounded-none border border-border bg-muted overflow-hidden">
          <div
            className="h-full bg-brand-burgundy transition-all duration-500"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>

      {/* Apply Button for completed batches */}
      {(job.status === "completed" || job.status === "completed_with_errors") && (
        <div className="mt-5 flex justify-end">
          <Button
            size="sm"
            onClick={() => onApply(job.id)}
            disabled={applyingId === job.id}
            className="h-10 px-6 rounded-none border border-border bg-brand-burgundy hover:bg-brand-burgundy/90 text-background font-semibold active:translate-x-[2px] active:translate-y-[2px] transition-all"
          >
            {applyingId === job.id ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4 fill-current" />
                Apply Results
              </>
            )}
          </Button>
        </div>
      )}
    </div>


  );
}
