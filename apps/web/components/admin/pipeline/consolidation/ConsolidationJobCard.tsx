import {
  Brain,
  Loader2,
  XCircle,
  RefreshCw,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  StatusBadge,
  formatTimestamp,
  formatElapsed,
  isTerminalStatus,
} from "./shared";
import type { ConsolidationJob } from "./shared";

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
  return (
    <div className="rounded-lg border border-purple-100 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-brand-burgundy" />
            <h3 className="font-medium text-foreground">
              Batch {job.id.slice(0, 12)}
            </h3>
            <StatusBadge status={job.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Started {formatTimestamp(job.createdAt)} •{" "}
            {formatElapsed(job.createdAt)} ago
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSyncStatus(job.id)}
            disabled={syncingId === job.id}
            title="Refresh status from OpenAI"
            className="text-muted-foreground hover:text-muted-foreground"
          >
            <RefreshCw
              className={`h-4 w-4 ${syncingId === job.id ? "animate-spin" : ""}`}
            />
          </Button>
          {!isTerminalStatus(job.status) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCancel(job.id)}
              disabled={cancellingId === job.id}
              title="Cancel batch"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              {cancellingId === job.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mt-3 grid grid-cols-4 gap-4 text-center">
        <div>
          <p className="text-2xl font-semibold text-foreground">
            {job.totalProducts}
          </p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-blue-600">
            {job.processedCount}
          </p>
          <p className="text-xs text-muted-foreground">Processed</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-green-600">
            {job.successCount}
          </p>
          <p className="text-xs text-muted-foreground">Success</p>
        </div>
        <div>
          <p
            className={`text-2xl font-semibold ${job.errorCount > 0 ? "text-red-600" : "text-foreground"}`}
          >
            {job.errorCount}
          </p>
          <p className="text-xs text-muted-foreground">Errors</p>
        </div>
      </div>

      {/* Error Warning */}
      {job.errorCount > 0 && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          {job.errorCount} product{job.errorCount !== 1 ? "s" : ""} failed
          consolidation
        </div>
      )}

      {/* Progress Bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium text-foreground">{job.progress}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand-burgundy transition-all duration-500"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>

      {/* Apply Button for completed batches */}
      {job.status === "completed" && (
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            onClick={() => onApply(job.id)}
            disabled={applyingId === job.id}
            className="bg-primary hover:bg-primary/80 text-white"
          >
            {applyingId === job.id ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Apply Results
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
