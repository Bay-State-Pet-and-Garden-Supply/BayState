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
    <div className="rounded-none border-4 border-zinc-900 bg-white p-5 shadow-[8px_8px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[6px_6px_0px_rgba(0,0,0,1)]">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-black text-lg uppercase tracking-tighter text-zinc-900">
              {job.description || `Batch ${job.id.slice(0, 8)}`}
            </h3>
            <StatusBadge status={job.status} />
            {llmModel && (
              <Badge variant="outline" className="rounded-none border-2 border-zinc-900 bg-zinc-100 font-bold uppercase text-[10px]">
                <Cpu className="mr-1 h-3 w-3" />
                {llmModel}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-zinc-500 uppercase tracking-tight">
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
            variant="outline"
            size="sm"
            onClick={() => onSyncStatus(job.id)}
            disabled={syncingId === job.id}
            title="Refresh status from OpenAI"
            className="rounded-none border-2 border-zinc-900 hover:bg-zinc-100 h-9"
          >
            <RefreshCw
              className={`h-4 w-4 ${syncingId === job.id ? "animate-spin" : ""}`}
            />
          </Button>
          {!isTerminalStatus(job.status) && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onCancel(job.id)}
              disabled={cancellingId === job.id}
              title="Cancel batch"
              className="rounded-none border-2 border-zinc-900 h-9 font-bold uppercase"
            >
              {cancellingId === job.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancel
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border-2 border-zinc-900 p-3 bg-zinc-50">
          <p className="text-3xl font-black text-zinc-900 tracking-tighter">
            {job.totalProducts}
          </p>
          <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Total Products</p>
        </div>
        <div className="border-2 border-zinc-900 p-3 bg-blue-50/30">
          <p className="text-3xl font-black text-blue-700 tracking-tighter">
            {job.processedCount}
          </p>
          <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Processed</p>
        </div>
        <div className="border-2 border-zinc-900 p-3 bg-green-50/30">
          <p className="text-3xl font-black text-green-700 tracking-tighter">
            {job.successCount}
          </p>
          <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Success</p>
        </div>
        <div className="border-2 border-zinc-900 p-3 bg-red-50/30">
          <p
            className={`text-3xl font-black tracking-tighter ${job.errorCount > 0 ? "text-red-700" : "text-zinc-400"}`}
          >
            {job.errorCount}
          </p>
          <p className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Errors</p>
        </div>
      </div>

      {/* Error Warning */}
      {job.errorCount > 0 && (
        <div className="mt-4 flex items-center gap-2 border-2 border-red-900 bg-red-50 px-3 py-2 text-xs font-bold text-red-900 uppercase tracking-tight">
          <AlertTriangle className="h-4 w-4" />
          {job.errorCount} product{job.errorCount !== 1 ? "s" : ""} failed consolidation
        </div>
      )}

      {/* Progress Bar */}
      <div className="mt-6 space-y-2">
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
          <span className="text-zinc-500">Pipeline Progress</span>
          <span className="text-zinc-900">{job.progress}%</span>
        </div>
        <div className="h-4 w-full border-2 border-zinc-900 bg-zinc-100 p-[2px]">
          <div
            className="h-full bg-brand-burgundy transition-all duration-500"
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>

      {/* Apply Button for completed batches */}
      {job.status === "completed" && (
        <div className="mt-6 flex justify-end">
          <Button
            size="lg"
            onClick={() => onApply(job.id)}
            disabled={applyingId === job.id}
            className="rounded-none border-4 border-zinc-900 bg-brand-burgundy hover:bg-brand-burgundy/90 text-white font-black uppercase tracking-tighter h-12 px-8 shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
          >
            {applyingId === job.id ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Applying Results...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-5 w-5 fill-current" />
                Apply to Finalizing
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
