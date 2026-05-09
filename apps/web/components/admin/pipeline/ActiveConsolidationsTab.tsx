"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LayoutGrid,
  Loader2,
  RefreshCw,
  History,
  Settings,
  LifeBuoy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import { ConsolidationJobCard } from "@/components/admin/pipeline/consolidation";
import { BatchHistorySection } from "@/components/admin/pipeline/consolidation";
import type {
  ConsolidationJob,
  BatchHistoryJob,
} from "@/components/admin/pipeline/consolidation";
import { useDocumentVisible } from "@/hooks/useDocumentVisible";

// ============================================================================
// Types
// ============================================================================

interface ActiveConsolidationsTabProps {
  className?: string;
}

// ============================================================================
// Main Component
// ============================================================================

export function ActiveConsolidationsTab({
  className,
}: ActiveConsolidationsTabProps) {
  const isDocumentVisible = useDocumentVisible();
  const [jobs, setJobs] = useState<ConsolidationJob[]>([]);
  const [historyJobs, setHistoryJobs] = useState<BatchHistoryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [pendingCancelBatchId, setPendingCancelBatchId] = useState<
    string | null
  >(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Fetch active consolidation jobs
  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/pipeline/active-consolidations");
      if (!response.ok) throw new Error("Failed to fetch jobs");
      const data = await response.json();
      const activeJobs = data.jobs || [];
      setJobs(activeJobs);

      // If no active jobs, show history automatically
      if (activeJobs.length === 0) {
        setShowHistory(true);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch batch history
  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/consolidation/jobs");
      if (!response.ok) return;
      const data = await response.json();
      setHistoryJobs(data.jobs || []);
    } catch {
      // Silently fail for history
    }
  }, []);

  useEffect(() => {
    void Promise.all([fetchJobs(), fetchHistory()]);
  }, [fetchJobs, fetchHistory]);

  useEffect(() => {
    if (!isDocumentVisible || jobs.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      void Promise.all([fetchJobs(), fetchHistory()]);
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchHistory, fetchJobs, isDocumentVisible, jobs.length]);

  // Cancel a batch
  const handleCancelClick = (batchId: string) => {
    setPendingCancelBatchId(batchId);
    setConfirmCancelOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!pendingCancelBatchId) return;
    setConfirmCancelOpen(false);

    const batchId = pendingCancelBatchId;
    setCancellingId(batchId);
    try {
      const res = await fetch(`/api/admin/consolidation/${batchId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Job cancelled");
        await Promise.all([fetchJobs(), fetchHistory()]);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to cancel job");
      }
    } catch {
      toast.error("Failed to cancel job");
    } finally {
      setCancellingId(null);
    }

    setPendingCancelBatchId(null);
  };

  // Apply results from a completed batch
  const handleApply = async (batchId: string) => {
    setApplyingId(batchId);
    try {
      const res = await fetch(`/api/admin/consolidation/${batchId}/apply`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        const successCount = data.success_count ?? 0;
        const errorCount = data.error_count ?? 0;
        const applyErrors: string[] = data.errors ?? [];
        if (applyErrors.length > 0) {
          console.error("[Consolidation Apply] Per-product errors:", applyErrors.join("\n"));
          toast.error(
            `Applied ${successCount} product${successCount !== 1 ? "s" : ""} (${errorCount} error${errorCount !== 1 ? "s" : ""})\n${applyErrors.join("\n")}`,
            { duration: 10000 },
          );
        } else {
          toast.success(
            `Applied ${successCount} product${successCount !== 1 ? "s" : ""}` +
              (errorCount > 0
                ? ` (${errorCount} error${errorCount !== 1 ? "s" : ""})`
                : ""),
          );
        }
        await Promise.all([fetchJobs(), fetchHistory()]);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to apply results");
      }
    } catch {
      toast.error("Failed to apply results");
    } finally {
      setApplyingId(null);
    }
  };

  // Refresh status for a single job (read-only)
  const handleRefreshJob = async (batchId: string) => {
    setRefreshingId(batchId);
    try {
      const res = await fetch(`/api/admin/consolidation/${batchId}`);
      if (res.ok) {
        toast.success("Status refreshed");
        await Promise.all([fetchJobs(), fetchHistory()]);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to refresh status");
      }
    } catch {
      toast.error("Failed to refresh status");
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDeleteJob = async (batchId: string) => {
    if (!window.confirm("Delete this consolidation job? Products still in consolidating will be returned to scraped.")) return;

    setDeletingId(batchId);
    try {
      const res = await fetch(`/api/admin/consolidation/${batchId}?delete=true`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Consolidation deleted");
        await Promise.all([fetchJobs(), fetchHistory()]);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete consolidation");
      }
    } catch {
      toast.error("Failed to delete consolidation");
    } finally {
      setDeletingId(null);
    }
  };

  // Refresh all jobs (read-only — just re-fetch)
  const handleRefreshAll = async () => {
    await Promise.all([fetchJobs(), fetchHistory()]);
    toast.success("Queue refreshed");
  };

  const [resettingStranded, setResettingStranded] = useState(false);

  // Recover stuck products
  const handleRecoverStranded = async () => {
    if (!window.confirm("This will reset all products stuck in 'consolidating' back to 'scraped'. Please ensure there are no active batches before proceeding. Continue?")) return;
    
    setResettingStranded(true);
    try {
      const res = await fetch("/api/admin/consolidation/reset", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        if (data.reset_count > 0) {
          toast.success(`Recovered ${data.reset_count} stranded product${data.reset_count !== 1 ? "s" : ""} back to scraped stage`);
        } else {
          toast.info("No stranded products found");
        }
      } else {
        toast.error(data.error || "Failed to recover stranded products");
      }
    } catch {
      toast.error("Failed to recover stranded products");
    } finally {
      setResettingStranded(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`rounded-none border border-destructive/20 bg-destructive/[0.02] p-3 ${className}`}
      >
        <p className="text-sm font-bold uppercase text-destructive tracking-tight">
          Queue Failure: {error}
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex justify-end gap-2 border-b border-border pb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open('/admin/settings', '_blank')}
          className="rounded-none border border-border font-semibold text-[10px] h-8 transition-all"
        >
          <Settings className="mr-2 h-4 w-4" />
          AI Settings
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshAll}
          className="rounded-none border border-border font-semibold text-[10px] h-8 transition-all"
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Refresh
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRecoverStranded}
          disabled={resettingStranded}
          className="rounded-none border border-border font-semibold text-[10px] h-8 transition-all text-muted-foreground hover:text-destructive hover:bg-destructive/[0.02]"
        >
          {resettingStranded ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <LifeBuoy className="mr-2 h-3.5 w-3.5" />
          )}
          Recover Stranded
        </Button>
        <Button
          variant={showHistory ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            setShowHistory(!showHistory);
            if (!showHistory) fetchHistory();
          }}
          className={cn(
            "rounded-none border border-border font-semibold text-[10px] h-8 transition-all",
            showHistory ? "bg-foreground text-background" : "bg-card text-foreground",
          )}
        >
          <History className="mr-2 h-3.5 w-3.5" />
          Archive
        </Button>
      </div>

      <div className="rounded-none border border-border bg-muted/20 px-4 py-3 text-[10px] font-semibold text-muted-foreground tracking-tight">
        <span className="text-foreground">DeepSeek consolidation</span>: clicking Consolidate on the scraped tab submits and runs the job.
        This tab is only for reviewing progress, applying completed results, deleting jobs, and recovery.
      </div>

      {/* Active Jobs */}
      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-border rounded-none">
          <LayoutGrid className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold text-muted-foreground">
            Queue Empty
          </h3>
          <p className="text-[10px] font-semibold text-muted-foreground/60 tracking-tight mt-1">
            No active consolidation jobs detected
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {jobs.map((job) => (
            <ConsolidationJobCard
              key={job.id}
              job={job}
              onCancel={handleCancelClick}
              onApply={handleApply}
              onRefresh={handleRefreshJob}
              onDelete={handleDeleteJob}
              cancellingId={cancellingId}
              deletingId={deletingId}
              applyingId={applyingId}
              refreshingId={refreshingId}
            />
          ))}
        </div>
      )}

      {/* Batch History Section */}
      {showHistory && (
        <div className="mt-4">
          <BatchHistorySection
            historyJobs={historyJobs}
            onApply={handleApply}
            applyingId={applyingId}
          />
        </div>
      )}

      <ConfirmationDialog
        open={confirmCancelOpen}
        onOpenChange={(open) => {
          setConfirmCancelOpen(open);
          if (!open) setPendingCancelBatchId(null);
        }}
        onConfirm={handleConfirmCancel}
        title="Abort Queue Job"
        description="This will cancel the queue job and stop processing remaining items."
        confirmLabel="Abort Job"
        variant="destructive"
        isLoading={!!cancellingId}
      />
    </div>
  );
}
