import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import {
  mapBatchJobStatusToRunStatus,
  mapEnrichmentJobStatusToRunStatus,
  getConsolidationStageLabel,
  getEnrichmentStageLabel,
  PIPELINE_RUN_KIND_LABELS,
} from "@/lib/pipeline/run-types";
import type {
  PipelineRunSummary,
  PipelineRunKind,
  PipelineEvent,
} from "@/lib/pipeline/run-types";

/**
 * GET /api/admin/pipeline/runs
 *
 * Provider-normalized pipeline runs aggregation.
 * Returns both consolidation runs (batch_jobs) and scrape runs (scrape_jobs)
 * as canonical PipelineRunSummary objects.
 *
 * This is the single frontend-consumed endpoint. Provider-specific status
 * details are mapped server-side.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) {
    return auth.response;
  }

  const supabase = await createAdminClient();

  // --------------------------------------------------------------------------
  // 1. Fetch active consolidation runs (batch_jobs)
  // --------------------------------------------------------------------------
  const last48Hours = new Date(
    Date.now() - 48 * 60 * 60 * 1000,
  ).toISOString();

  const { data: batchJobs, error: batchError } = await supabase
    .from("batch_jobs")
    .select(
      "id, provider, provider_batch_id, status, execution_mode, description, created_at, updated_at, completed_at, total_requests, completed_requests, failed_requests, metadata",
    )
    .or(
      `status.not.in.(completed,failed,expired,cancelled),and(status.in.(completed,failed,expired,cancelled),created_at.gt.${last48Hours})`,
    )
    .order("created_at", { ascending: false })
    .limit(15);

  if (batchError) {
    console.error("[Pipeline Runs] Failed to fetch batch jobs:", batchError);
    return NextResponse.json(
      { error: "Failed to fetch pipeline runs" },
      { status: 500 },
    );
  }

  // Fetch item counts for consolidation runs
  const batchJobIds = (batchJobs || []).map((j) => j.id);
  const itemCountsByJob = new Map<
    string,
    { pending: number; running: number; completed: number; failed: number }
  >();

  if (batchJobIds.length > 0) {
    try {
      const { data: items } = await supabase
        .from("batch_job_items")
        .select("batch_job_id, status")
        .in("batch_job_id", batchJobIds);

      for (const item of items || []) {
        const jobId = item.batch_job_id as string;
        const counts = itemCountsByJob.get(jobId) || {
          pending: 0,
          running: 0,
          completed: 0,
          failed: 0,
        };
        const status = item.status as string;
        if (status === "pending") counts.pending += 1;
        else if (status === "running") counts.running += 1;
        else if (status === "completed") counts.completed += 1;
        else if (status === "failed") counts.failed += 1;
        itemCountsByJob.set(jobId, counts);
      }
    } catch (itemError) {
      console.warn(
        "[Pipeline Runs] Failed to fetch batch_job_items:",
        itemError,
      );
    }
  }

  // --------------------------------------------------------------------------
  // 2. Fetch active enrichment runs (enrichment_jobs)
  // --------------------------------------------------------------------------
  const { data: enrichmentJobs, error: enrichmentError } = await supabase
    .from("enrichment_jobs")
    .select(
      "id, status, upcs, total_count, completed_count, failed_count, model, mode, config, token_usage, cost_estimate, error_message, created_by, claimed_by, started_at, completed_at, created_at, updated_at",
    )
    .or(
      `status.not.in.(completed,completed_with_errors,failed,cancelled),and(status.in.(completed,completed_with_errors,failed,cancelled),created_at.gt.${last48Hours})`,
    )
    .order("created_at", { ascending: false })
    .limit(20);

  if (enrichmentError) {
    console.error("[Pipeline Runs] Failed to fetch enrichment jobs:", enrichmentError);
    return NextResponse.json(
      { error: "Failed to fetch pipeline runs" },
      { status: 500 },
    );
  }

  // --------------------------------------------------------------------------
  // 3. Map consolidation runs → PipelineRunSummary
  // --------------------------------------------------------------------------
  const consolidationRuns: PipelineRunSummary[] = (batchJobs || []).map(
    (job) => {
      const total = job.total_requests || 0;
      const completed = job.completed_requests || 0;
      const failed = job.failed_requests || 0;
      const processed = completed + failed;

      const itemCounts = itemCountsByJob.get(job.id);
      const pendingCount = itemCounts?.pending ?? Math.max(total - processed, 0);
      const runningCount = itemCounts?.running ?? 0;
      const completedItems = itemCounts?.completed ?? completed;
      const failedItems = itemCounts?.failed ?? failed;

      const normalizedStatus = mapBatchJobStatusToRunStatus(
        job.status,
        failedItems,
      );

      return {
        id: job.id,
        kind: "consolidation" as PipelineRunKind,
        label: job.description || `Consolidation Job`,
        status: normalizedStatus,
        provider: job.provider || undefined,
        executionMode: job.execution_mode || "direct_chat_chunks",
        model:
          (job.metadata as Record<string, unknown> | null)?.llm_model as
            | string
            | undefined,
        totalItems: total,
        completedItems,
        failedItems,
        runningItems: runningCount,
        pendingItems: pendingCount,
        progressPercent:
          total > 0 ? Math.round((processed / total) * 100) : 0,
        startedAt: job.created_at,
        updatedAt: job.updated_at || undefined,
        completedAt: job.completed_at || undefined,
        currentStageLabel: getConsolidationStageLabel(
          normalizedStatus,
          pendingCount,
          runningCount,
          total,
          job.execution_mode,
        ),
        nextAction:
          normalizedStatus === "completed"
            ? "apply_results"
            : normalizedStatus === "completed_with_errors"
              ? "apply_results"
              : normalizedStatus === "failed" && failedItems > 0
                ? "retry_failed"
                : normalizedStatus === "failed"
                  ? "review_errors"
                  : undefined,
      } satisfies PipelineRunSummary;
    },
  );

  // --------------------------------------------------------------------------
  // 4. Map enrichment runs → PipelineRunSummary
  // --------------------------------------------------------------------------
  const enrichmentRuns: PipelineRunSummary[] = (enrichmentJobs || []).map(
    (job) => {
      const total = job.total_count || 0;
      const completed = job.completed_count || 0;
      const failed = job.failed_count || 0;
      const normalizedStatus = mapEnrichmentJobStatusToRunStatus(job.status);
      const kind: PipelineRunKind = "enrichment";

      return {
        id: job.id,
        kind,
        label: "Product Enrichment",
        status: normalizedStatus,
        model: job.model || undefined,
        executionMode: job.mode || "mixed",
        totalItems: total,
        completedItems: completed,
        failedItems: failed,
        runningItems: Math.max(total - completed - failed, 0),
        pendingItems: 0,
        progressPercent:
          total > 0 ? Math.round(((completed + failed) / total) * 100) : 0,
        startedAt: job.created_at,
        updatedAt: job.updated_at || undefined,
        completedAt: job.completed_at || undefined,
        currentStageLabel: getEnrichmentStageLabel(
          normalizedStatus,
          Math.max(total - completed - failed, 0),
          Math.max(total - completed - failed, 0),
          total
        ),
        nextAction:
          normalizedStatus === "completed"
            ? "apply_results"
            : normalizedStatus === "completed_with_errors"
              ? "review_errors"
              : normalizedStatus === "failed"
                ? "review_errors"
                : undefined,
      } satisfies PipelineRunSummary;
    },
  );

  // --------------------------------------------------------------------------
  // 5. Merge and return
  // --------------------------------------------------------------------------
  const runs = [...consolidationRuns, ...enrichmentRuns];

  // Sort by startedAt descending, with active runs first
  const activeFirst = runs.sort((a, b) => {
    const aActive = a.status === "running" || a.status === "queued" ? 0 : 1;
    const bActive = b.status === "running" || b.status === "queued" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return (b.startedAt || "").localeCompare(a.startedAt || "");
  });

  return NextResponse.json({ runs: activeFirst });
}
