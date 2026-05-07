"use client";

import { useState } from "react";
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  Zap,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, formatTimestamp } from "./shared";
import type { BatchHistoryJob } from "./shared";

// ============================================================================
// Types
// ============================================================================

interface BatchHistorySectionProps {
  historyJobs: BatchHistoryJob[];
  onApply: (id: string) => void;
  applyingId: string | null;
}

// ============================================================================
// BatchHistoryCard (internal)
// ============================================================================

function BatchHistoryCard({
  job,
  onApply,
  applyingId,
}: {
  job: BatchHistoryJob;
  onApply: (id: string) => void;
  applyingId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const metadata = job.metadata || {};
  const applySummary = metadata.apply_summary as
    | Record<string, unknown>
    | undefined;
  const qualityMetrics = metadata.quality_metrics as
    | Record<string, number>
    | undefined;
  const llmModel = metadata.llm_model as string | undefined;
  const isApplied = !!applySummary;
  const canApply = job.status === "completed" && !isApplied;

  return (
    <div className="rounded-none border border-border bg-card p-4 transition-colors hover:bg-accent/5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={job.status} />
            <span className="text-sm font-semibold text-foreground truncate">
              {job.description || `Batch ${job.id.slice(0, 8)}`}
            </span>
            {llmModel && (
              <Badge variant="secondary" className="rounded-none border border-border bg-muted font-semibold text-[9px] h-4 tracking-widest">
                {llmModel}
              </Badge>
            )}
            {job.auto_apply && (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 rounded-none border border-border bg-muted text-muted-foreground font-semibold h-4 tracking-widest"
              >
                Auto
              </Badge>
            )}
            {isApplied && (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 rounded-none border border-green-600 bg-green-50 text-green-700 font-semibold h-4 tracking-widest"
              >
                Applied
              </Badge>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold text-muted-foreground tracking-widest">
            <span>{formatTimestamp(job.created_at)}</span>
            <span>•</span>
            <span>{job.total_requests} units</span>
            {job.completed_requests > 0 && (
              <>
                <span>•</span>
                <span className="text-green-600">
                  {job.completed_requests} OK
                </span>
              </>
            )}
            {job.estimated_cost > 0 && (
              <>
                <span>•</span>
                <span>${job.estimated_cost.toFixed(3)}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canApply && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onApply(job.openai_batch_id || job.id)}
              disabled={applyingId === (job.openai_batch_id || job.id)}
              className="rounded-none border border-border bg-brand-burgundy hover:bg-brand-burgundy/90 text-background font-semibold text-[10px] h-7 px-3 active:translate-x-[1px] active:translate-y-[1px] transition-all tracking-widest"
            >
              {applyingId === (job.openai_batch_id || job.id) ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Zap className="mr-1 h-3 w-3 fill-current" />
              )}
              Apply
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="h-7 w-7 p-0 hover:bg-muted"
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="mt-3 space-y-3 border-t border-dashed border-border pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10px] font-semibold text-muted-foreground tracking-widest">
            <div className="flex flex-col gap-1">
              <span>Batch ID</span>
              <span className="font-mono text-foreground normal-case text-xs">
                {job.openai_batch_id || job.id}
              </span>
            </div>
            {job.completed_at && (
              <div className="flex flex-col gap-1">
                <span>Completion Time</span>
                <span className="text-foreground text-xs">
                  {formatTimestamp(job.completed_at)}
                </span>
              </div>
            )}
          </div>

          {/* Quality Metrics */}
          {qualityMetrics && (
            <div className="rounded-none border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-semibold text-foreground mb-2">
                Quality & Taxonomy Metrics
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="flex flex-col">
                  <span className="text-[9px] font-semibold text-muted-foreground tracking-widest">Matched</span>
                  <span className="text-sm font-bold text-foreground">{qualityMetrics.matched_brand_count ?? 0}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-semibold text-muted-foreground tracking-widest">Unresolved</span>
                  <span className="text-sm font-bold text-destructive">{qualityMetrics.unresolved_brand_count ?? 0}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-semibold text-muted-foreground tracking-widest">Modified</span>
                  <span className="text-sm font-bold text-foreground">{qualityMetrics.overwritten_field_count ?? 0}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-semibold text-muted-foreground tracking-widest">Preserved</span>
                  <span className="text-sm font-bold text-status-success">{qualityMetrics.preserved_existing_field_count ?? 0}</span>
                </div>
              </div>
            </div>
          )}

          {/* Apply Summary */}
          {applySummary && (
            <div className="rounded-none border border-status-success bg-status-success/10 p-3">
              <p className="text-[10px] font-semibold text-status-success mb-2">
                Finalization Summary
              </p>
              <div className="flex items-center gap-6">
                <div className="flex flex-col">
                  <span className="text-[9px] font-semibold text-status-success tracking-widest">Applied</span>
                  <span className="text-sm font-bold text-status-success">{(applySummary.success_count as number) ?? 0}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-semibold text-destructive tracking-widest">Failed</span>
                  <span className="text-sm font-bold text-destructive">{(applySummary.error_count as number) ?? 0}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-semibold text-status-success tracking-widest">Total Units</span>
                  <span className="text-sm font-bold text-status-success">{(applySummary.total as number) ?? 0}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// BatchHistorySection
// ============================================================================

export function BatchHistorySection({
  historyJobs,
  onApply,
  applyingId,
}: BatchHistorySectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-t border-border pt-4">
        <History className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-muted-foreground">
          Recent Batches
        </h3>
        <span className="text-[10px] font-semibold text-muted-foreground tracking-widest">Last 20</span>
      </div>

      {historyJobs.length === 0 ? (
        <p className="text-sm font-semibold text-muted-foreground text-center py-4 tracking-widest">
          No batch history yet
        </p>
      ) : (
        historyJobs.map((job) => (
          <BatchHistoryCard
            key={job.id}
            job={job}
            onApply={onApply}
            applyingId={applyingId}
          />
        ))
      )}
    </div>
  );
}

