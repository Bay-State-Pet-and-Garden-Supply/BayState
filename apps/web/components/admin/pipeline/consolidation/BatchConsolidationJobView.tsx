"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  XCircle,
  RefreshCw,
  Trash2,
  AlertTriangle,
  RotateCcw,
  Cpu,
  Fingerprint,
  Zap,
  Layers,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { adminFetch } from "@/lib/admin/api-client";
import {
  StatusBadge,
  formatTimestamp,
  formatElapsed,
  isTerminalStatus,
  getProviderLabel,
} from "./shared";
import type { ConsolidationJob } from "./shared";

// ============================================================================
// Types
// ============================================================================

interface DirectJobItemActivity {
  upc: string;
  name: string | null;
  status: string;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  attemptCount?: number;
}

interface BatchConsolidationJobViewProps {
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
// Batch Phase Steps
// ============================================================================

const BATCH_PHASES = [
  { key: "preparing", label: "Preparing" },
  { key: "submitting", label: "Submitting" },
  { key: "processing", label: "Processing" },
  { key: "completed", label: "Completed" },
] as const;

function BatchPhaseIndicator({ status }: { status: string }) {
  const currentPhase = (() => {
    if (status === "pending" || status === "queued" || status === "validating") return 0;
    if (status === "running" || status === "in_progress" || status === "finalizing") return 2;
    if (status === "completed" || status === "completed_with_errors" || status === "failed") return 3;
    return 1;
  })();

  return (
    <div className="flex items-center gap-2">
      {BATCH_PHASES.map((phase, i) => {
        const isActive = i === currentPhase;
        const isDone = i < currentPhase;
        return (
          <div key={phase.key} className="flex items-center gap-1">
            {i > 0 && (
              <div className={`h-px w-4 ${isDone ? "bg-brand-forest-green" : "bg-muted-foreground/30"}`} />
            )}
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold tracking-widest rounded-none border ${
                isActive
                  ? "border-brand-burgundy text-brand-burgundy bg-brand-burgundy/10"
                  : isDone
                    ? "border-brand-forest-green/40 text-brand-forest-green bg-brand-forest-green/5"
                    : "border-border text-muted-foreground bg-muted/20"
              }`}
            >
              {isActive ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : isDone ? (
                <span className="text-brand-forest-green">✓</span>
              ) : (
                <Clock className="h-2.5 w-2.5" />
              )}
              {phase.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// BatchConsolidationJobView
// ============================================================================

export function BatchConsolidationJobView({
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
}: BatchConsolidationJobViewProps) {
  const [localItems, setLocalItems] = useState<DirectJobItemActivity[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    let active = true;
    const loadItems = async () => {
      setLoadingItems(true);
      try {
        const res = await adminFetch(`/api/admin/pipeline/runs/${job.id}/items`);
        if (res.ok && active) {
          const data = await res.json();
          setLocalItems(data.items || []);
        }
      } catch (err) {
        console.warn("Failed to load run items:", err);
      } finally {
        if (active) setLoadingItems(false);
      }
    };

    void loadItems();

    // Poll every 10 seconds if the job is active
    let intervalId: NodeJS.Timeout | null = null;
    const isActive = !isTerminalStatus(job.status);
    if (isActive) {
      intervalId = setInterval(() => {
        void loadItems();
      }, 10000);
    }

    return () => {
      active = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [job.id, job.status, job.processedCount]);

  const llmModel = job.metadata?.llm_model as string | undefined;
  const providerLabel = getProviderLabel(job.provider);
  const pendingCount = job.pendingCount ?? Math.max(job.totalProducts - job.processedCount, 0);
  const runningCount = job.runningCount ?? 0;
  const isGemini = job.execution_mode === "gemini_batch";

  return (
    <div className="rounded-none border border-border bg-card p-5 transition-colors hover:bg-accent/5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-base text-foreground">
              {job.description || `Merging Job ${job.id.slice(0, 8)}`}
            </h3>
            <StatusBadge status={job.status} />
            <Badge
              variant="secondary"
              className="rounded-none border border-amber-300 bg-amber-50 font-semibold text-[10px] h-5 tracking-widest text-amber-700"
            >
              <Layers className="mr-1 h-3 w-3" />
              {isGemini ? "Gemini Batch" : "Batch Processing"}
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
            {job.provider_batch_id && (
              <>
                <span>•</span>
                <span className="text-muted-foreground/60 font-mono" title="Provider batch ID">
                  {job.provider_batch_id.slice(0, 24)}...
                </span>
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

      {/* Batch Phase Indicator */}
      {!isTerminalStatus(job.status) && (
        <div className="mt-4">
          <BatchPhaseIndicator status={job.status} />
        </div>
      )}

      {/* Current State */}
      <div className="mt-4 rounded-none border border-border bg-muted/20 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-foreground">Current state</p>
            <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
              {pendingCount > 0 && !isTerminalStatus(job.status)
                ? `${pendingCount} product${pendingCount === 1 ? "" : "s"} still queued. Results must be applied when complete.`
                : isTerminalStatus(job.status)
                  ? "This job is finished. Review errors or apply successful results."
                  : "No queued products remain."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] font-semibold sm:grid-cols-4">
            <span className="rounded-none border border-border bg-background px-2 py-1 text-muted-foreground">Pending <b className="text-foreground">{pendingCount}</b></span>
            <span className="rounded-none border border-border bg-background px-2 py-1 text-muted-foreground">Running <b className="text-foreground">{runningCount}</b></span>
            <span className="rounded-none border border-border bg-background px-2 py-1 text-muted-foreground">Done <b className="text-green-600">{job.successCount}</b></span>
            <span className="rounded-none border border-border bg-background px-2 py-1 text-muted-foreground">Failed <b className={job.errorCount > 0 ? "text-destructive" : "text-foreground"}>{job.errorCount}</b></span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-none border border-border p-3 bg-muted/20">
          <p className="text-2xl font-bold text-foreground">{job.totalProducts}</p>
          <p className="text-[10px] font-semibold text-muted-foreground tracking-widest">Total</p>
        </div>
        <div className="rounded-none border border-border p-3 bg-blue-50/20">
          <p className="text-2xl font-bold text-blue-600">{job.processedCount}</p>
          <p className="text-[10px] font-semibold text-muted-foreground tracking-widest">Processed</p>
        </div>
        <div className="rounded-none border border-border p-3 bg-green-50/20">
          <p className="text-2xl font-bold text-green-600">{job.successCount}</p>
          <p className="text-[10px] font-semibold text-muted-foreground tracking-widest">Success</p>
        </div>
        <div className="rounded-none border border-border p-3 bg-destructive/10">
          <p className={`text-2xl font-bold ${job.errorCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>{job.errorCount}</p>
          <p className="text-[10px] font-semibold text-muted-foreground tracking-widest">Errors</p>
        </div>
      </div>

      {/* Error Warning & Collapsible details */}
      {job.errorCount > 0 && (
        <div className="mt-3 space-y-2">
          <div 
            onClick={() => setShowErrors(!showErrors)}
            className="flex items-center justify-between rounded-none border border-destructive bg-destructive/5 px-3 py-2 text-[10px] font-semibold text-destructive tracking-widest cursor-pointer hover:bg-destructive/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{job.errorCount} product{job.errorCount !== 1 ? "s" : ""} failed during merging</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] uppercase tracking-wider text-destructive/80 font-bold">
                {showErrors ? "Hide Details" : "Show Details"}
              </span>
              {showErrors ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </div>
          </div>

          {showErrors && (
            <div className="rounded-none border border-destructive/20 bg-card p-3 space-y-2 max-h-[300px] overflow-y-auto">
              <div className="text-[9px] font-bold tracking-wider text-muted-foreground uppercase pb-1 border-b border-border flex items-center justify-between">
                <span>Failed Products List ({localItems.filter(i => i.status === 'failed').length})</span>
                {loadingItems && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
              </div>
              {localItems.filter(i => i.status === 'failed').length === 0 ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground text-[10px]">
                  {loadingItems ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading failed product details...
                    </div>
                  ) : (
                    "No failed item details found."
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {localItems.filter(i => i.status === 'failed').map((item) => (
                    <div key={item.upc} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold">
                        <span className="font-mono bg-destructive/10 text-destructive px-1.5 py-0.5 border border-destructive/20 shrink-0">
                          {item.upc}
                        </span>
                        {item.name ? (
                          <span className="text-foreground font-bold">{item.name}</span>
                        ) : (
                          <span className="text-muted-foreground italic">Unknown product name</span>
                        )}
                      </div>
                      {item.errorMessage && (
                        <div className="text-[10px] text-destructive bg-destructive/[0.02] border border-destructive/10 p-2 font-medium break-words whitespace-pre-wrap select-text font-mono leading-relaxed">
                          {item.errorMessage}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recent Items Activity */}
      {localItems.length > 0 && (
        <div className="mt-4 rounded-none border border-border bg-background">
          <div className="border-b border-border px-3 py-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold tracking-widest text-muted-foreground">RECENT ITEM ACTIVITY</p>
            {loadingItems && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <div className="divide-y divide-border">
            {localItems.slice(0, 10).map((item) => (
              <div key={`${item.upc}-${item.status}`} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs text-foreground shrink-0">{item.upc}</span>
                  {item.name && (
                    <span className="text-[10px] font-semibold text-muted-foreground truncate max-w-[30ch]" title={item.name}>
                      {item.name}
                    </span>
                  )}
                  <StatusBadge status={item.status} />
                </div>
                {item.errorMessage ? (
                  <span className="max-w-[50ch] truncate text-[10px] font-semibold text-destructive" title={item.errorMessage}>
                    {item.errorMessage}
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {item.completedAt ? `Completed ${formatTimestamp(item.completedAt)}` : item.startedAt ? `Started ${formatTimestamp(item.startedAt)}` : "Waiting"}
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
          <span>Batch Progress</span>
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
