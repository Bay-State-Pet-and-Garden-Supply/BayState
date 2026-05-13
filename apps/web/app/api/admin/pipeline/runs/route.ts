import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
import {
  mapBatchJobStatusToRunStatus,
  mapScrapeJobStatusToRunStatus,
  determineScrapeJobKind,
  getConsolidationStageLabel,
  getScrapeStageLabel,
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
export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.authorized) {
    return auth.response;
  }

  const supabase = await createClient();

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
  // 2. Fetch active scrape runs (scrape_jobs)
  // --------------------------------------------------------------------------
  const { data: scrapeJobs, error: scrapeError } = await supabase
    .from("scrape_jobs")
    .select(
      "id, type, config, metadata, status, created_at, updated_at, completed_at, scrapers, skus, runner_name, progress_percent, progress_message, progress_phase, items_processed, items_total, last_log_message, last_log_level, last_log_at",
    )
    .in("status", ["pending", "claimed", "running"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (scrapeError) {
    console.error("[Pipeline Runs] Failed to fetch scrape jobs:", scrapeError);
    return NextResponse.json(
      { error: "Failed to fetch pipeline runs" },
      { status: 500 },
    );
  }

  // Also include recent completed/failed scrape jobs (last 1 hour)
  const oneHourAgo = new Date(
    Date.now() - 60 * 60 * 1000,
  ).toISOString();
  const { data: recentScrapeJobs } = await supabase
    .from("scrape_jobs")
    .select(
      "id, type, config, metadata, status, created_at, updated_at, completed_at, scrapers, skus, runner_name, progress_percent, progress_message, progress_phase, items_processed, items_total, last_log_message, last_log_level, last_log_at",
    )
    .in("status", ["completed", "failed", "cancelled"])
    .gte("completed_at", oneHourAgo)
    .order("completed_at", { ascending: false })
    .limit(10);

  // Fetch scrape_job_chunks for per-job failure counts
  const allScrapeJobIds = [
    ...(scrapeJobs || []).map((j) => j.id),
    ...(recentScrapeJobs || []).map((j) => j.id),
  ];
  const uniqueScrapeJobIds = [...new Set(allScrapeJobIds)];
  const chunkFailCountByJob = new Map<string, number>();
  if (uniqueScrapeJobIds.length > 0) {
    try {
      const { data: chunks } = await supabase
        .from("scrape_job_chunks")
        .select("job_id, status")
        .in("job_id", uniqueScrapeJobIds);

      for (const chunk of chunks || []) {
        if (chunk.status === "failed") {
          const jobId = chunk.job_id as string;
          chunkFailCountByJob.set(
            jobId,
            (chunkFailCountByJob.get(jobId) || 0) + 1,
          );
        }
      }
    } catch (chunkError) {
      console.warn(
        "[Pipeline Runs] Failed to fetch scrape_job_chunks:",
        chunkError,
      );
    }
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
  // 4. Map scrape runs → PipelineRunSummary
  // --------------------------------------------------------------------------
  const allScrapeJobs = [
    ...(scrapeJobs || []),
    ...(recentScrapeJobs || []),
  ];

  // Deduplicate by id
  const seenIds = new Set<string>();
  const uniqueScrapeJobs = allScrapeJobs.filter((job) => {
    if (seenIds.has(job.id)) return false;
    seenIds.add(job.id);
    return true;
  });

  const scrapeRuns: PipelineRunSummary[] = uniqueScrapeJobs.map((job) => {
    const jobType = typeof job.type === "string" ? job.type : null;
    const kind = determineScrapeJobKind(jobType);
    const normalizedStatus = mapScrapeJobStatusToRunStatus(job.status);
    const skuCount = Array.isArray(job.skus) ? job.skus.length : 0;
    const itemsProcessed =
      typeof job.items_processed === "number" ? job.items_processed : 0;
    const itemsTotal =
      typeof job.items_total === "number" ? job.items_total : skuCount;
    const progressPercent =
      typeof job.progress_percent === "number"
        ? job.progress_percent
        : itemsTotal > 0
          ? Math.round((itemsProcessed / itemsTotal) * 100)
          : 0;

    // Extract provider from config if available
    const config = job.config as Record<string, unknown> | undefined;
    const provider =
      (config?.search_provider as string) ||
      (config?.llm_provider as string) ||
      (job.runner_name as string) ||
      undefined;

    // Build events from log data
    const events: PipelineEvent[] = [];
    if (job.last_log_message) {
      events.push({
        timestamp: job.last_log_at || job.updated_at || job.created_at,
        level:
          job.last_log_level === "error"
            ? "error"
            : job.last_log_level === "warn"
              ? "warn"
              : "info",
        message: job.last_log_message,
      });
    }

    return {
      id: job.id,
      kind,
      label: PIPELINE_RUN_KIND_LABELS[kind],
      status: normalizedStatus,
      provider,
      totalItems: itemsTotal,
      completedItems: itemsProcessed,
      // Scrape failure counts derived from scrape_job_chunks where status === "failed".
      // This is a chunk-level count, not per-item — but it provides useful signal
      // for the frontend to know if errors occurred.
      failedItems: chunkFailCountByJob.get(job.id) || 0,
      runningItems:
        normalizedStatus === "running" ? itemsTotal - itemsProcessed : 0,
      pendingItems:
        normalizedStatus === "queued" ? itemsTotal : 0,
      progressPercent,
      startedAt: job.created_at,
      updatedAt: job.updated_at || undefined,
      completedAt: job.completed_at || undefined,
      currentStageLabel: getScrapeStageLabel(normalizedStatus, jobType),
      nextAction:
        normalizedStatus === "completed"
          ? "wait"
          : normalizedStatus === "failed"
            ? "review_errors"
            : undefined,
      recentEvents: events.length > 0 ? events : undefined,
    } satisfies PipelineRunSummary;
  });

  // --------------------------------------------------------------------------
  // 5. Merge and return
  // --------------------------------------------------------------------------
  const runs = [...consolidationRuns, ...scrapeRuns];

  // Sort by startedAt descending, with active runs first
  const activeFirst = runs.sort((a, b) => {
    const aActive = a.status === "running" || a.status === "queued" ? 0 : 1;
    const bActive = b.status === "running" || b.status === "queued" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return (b.startedAt || "").localeCompare(a.startedAt || "");
  });

  return NextResponse.json({ runs: activeFirst });
}
