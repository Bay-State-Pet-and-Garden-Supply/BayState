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

export interface BatchHistorySectionProps {
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
  const isApplied = !!applySummary;
  const canApply = job.status === "completed" && !isApplied;

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <StatusBadge status={job.status} />
          <span className="text-sm font-medium text-foreground truncate">
            {job.description || `Batch ${job.id.slice(0, 12)}`}
          </span>
          {job.auto_apply && (
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700"
            >
              Auto
            </Badge>
          )}
          {isApplied && (
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 bg-green-50 text-green-700"
            >
              Applied
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {canApply && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onApply(job.openai_batch_id || job.id)}
              disabled={applyingId === (job.openai_batch_id || job.id)}
              className="text-xs"
            >
              {applyingId === (job.openai_batch_id || job.id) ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Zap className="mr-1 h-3 w-3" />
              )}
              Apply
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-muted-foreground"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatTimestamp(job.created_at)}</span>
        <span>•</span>
        <span>{job.total_requests} products</span>
        {job.completed_requests > 0 && (
          <>
            <span>•</span>
            <span className="text-green-600">
              {job.completed_requests} success
            </span>
          </>
        )}
        {job.failed_requests > 0 && (
          <>
            <span>•</span>
            <span className="text-red-600">{job.failed_requests} failed</span>
          </>
        )}
        {job.estimated_cost > 0 && (
          <>
            <span>•</span>
            <span>${job.estimated_cost.toFixed(4)}</span>
          </>
        )}
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Batch ID:</span>
              <span className="ml-1 font-mono text-muted-foreground">
                {job.openai_batch_id || job.id}
              </span>
            </div>
            {job.completed_at && (
              <div>
                <span className="text-muted-foreground">Completed:</span>
                <span className="ml-1 text-muted-foreground">
                  {formatTimestamp(job.completed_at)}
                </span>
              </div>
            )}
          </div>

          {/* Quality Metrics */}
          {qualityMetrics && (
            <div className="rounded-md bg-muted p-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Quality Metrics
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>
                  Matched brands: {qualityMetrics.matched_brand_count ?? 0}
                </span>
                <span>
                  Unresolved brands:{" "}
                  {qualityMetrics.unresolved_brand_count ?? 0}
                </span>
                <span>
                  Fields overwritten:{" "}
                  {qualityMetrics.overwritten_field_count ?? 0}
                </span>
                <span>
                  Fields preserved:{" "}
                  {qualityMetrics.preserved_existing_field_count ?? 0}
                </span>
              </div>
            </div>
          )}

          {/* Apply Summary */}
          {applySummary && (
            <div className="rounded-md bg-green-50 p-2">
              <p className="text-xs font-medium text-green-700 mb-1">
                Apply Summary
              </p>
              <div className="flex items-center gap-3 text-xs text-green-600">
                <span>
                  {(applySummary.success_count as number) ?? 0} applied
                </span>
                <span>{(applySummary.error_count as number) ?? 0} errors</span>
                <span>{(applySummary.total as number) ?? 0} total</span>
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
      <div className="flex items-center gap-2 border-t pt-4">
        <History className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-muted-foreground">
          Recent Batches
        </h3>
        <span className="text-xs text-muted-foreground">Last 20</span>
      </div>

      {historyJobs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
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
