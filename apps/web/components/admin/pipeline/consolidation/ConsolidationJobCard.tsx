import {
  Brain,
  Loader2,
  XCircle,
  RefreshCw,
  AlertTriangle,
  Zap,
  Cpu,
  Fingerprint,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  StatusBadge,
  formatTimestamp,
  formatElapsed,
  isTerminalStatus,
} from "./shared";
import type { ConsolidationJob } from "./shared";
import { Badge } from "@/components/ui/badge";

// ============================================================================
// Types
// ============================================================================

export interface ConsolidationJobCardProps {
  job: ConsolidationJob;
  onCancel: (id: string) => void;
  onApply: (id: string) => void;
  onSyncStatus: (id: string) => void;
  cancellingId: string | null;
  applyingId: string | null;
  syncingId: string | null;
}

// ============================================================================
// ConsolidationJobCard
// ============================================================================

export function ConsolidationJobCard({
  job,
  onCancel,
  onApply,
  onSyncStatus,
  cancellingId,
  applyingId,
  syncingId,
}: ConsolidationJobCardProps) {
  const llmModel = job.metadata?.llm_model as string | undefined;
  const llmProvider = job.metadata?.llm_provider as string | undefined;

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm transition-colors hover:bg-accent/5">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-base text-foreground">
              {job.description || `Batch ${job.id.slice(0, 8)}`}
            </h3>
            <StatusBadge status={job.status} />
            {llmModel && (
              <Badge variant="secondary" className="font-medium text-[10px] h-5">
                <Cpu className="mr-1 h-3 w-3" />
                {llmModel}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Fingerprint className="h-3 w-3" />
              <span className="font-mono">{job.id.slice(0, 12)}</span>
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
            onClick={() => onSyncStatus(job.id)}
            disabled={syncingId === job.id}
            title="Refresh status"
            className="h-8 w-8 p-0"
          >
            <RefreshCw
              className={`h-4 w-4 ${syncingId === job.id ? "animate-spin" : ""}`}
            />
          </Button>
          {!isTerminalStatus(job.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCancel(job.id)}
              disabled={cancellingId === job.id}
              className="h-8 text-xs font-semibold text-destructive border-destructive/20 hover:bg-destructive/5"
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
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-md border border-border p-3 bg-muted/20">
          <p className="text-2xl font-bold text-foreground">
            {job.totalProducts}
          </p>
          <p className="text-[10px] font-semibold text-muted-foreground">Total</p>
        </div>
        <div className="rounded-md border border-border p-3 bg-blue-50/20">
          <p className="text-2xl font-bold text-blue-600">
            {job.processedCount}
          </p>
          <p className="text-[10px] font-semibold text-muted-foreground">Processed</p>
        </div>
        <div className="rounded-md border border-border p-3 bg-green-50/20">
          <p className="text-2xl font-bold text-green-600">
            {job.successCount}
          </p>
          <p className="text-[10px] font-semibold text-muted-foreground">Success</p>
        </div>
        <div className="rounded-md border border-border p-3 bg-red-50/20">
          <p
            className={`text-2xl font-bold ${job.errorCount > 0 ? "text-red-600" : "text-muted-foreground"}`}
          >
            {job.errorCount}
          </p>
          <p className="text-[10px] font-semibold text-muted-foreground">Errors</p>
        </div>
      </div>

      {/* Error Warning */}
      {job.errorCount > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          {job.errorCount} product{job.errorCount !== 1 ? "s" : ""} failed consolidation
        </div>
      )}

      {/* Progress Bar */}
      <div className="mt-5 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
          <span>Pipeline Progress</span>
          <span className="text-foreground">{job.progress}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-brand-burgundy transition-all duration-500"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>

      {/* Apply Button for completed batches */}
      {job.status === "completed" && (
        <div className="mt-5 flex justify-end">
          <Button
            size="sm"
            onClick={() => onApply(job.id)}
            disabled={applyingId === job.id}
            className="h-9 px-6 bg-brand-burgundy hover:bg-brand-burgundy/90 text-white font-bold"
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
