import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";

export interface ChunkDetail {
  id: string;
  jobId: string;
  chunkIndex: number;
  skuCount: number;
  plannedWorkUnits: number;
  skuSliceIndex: number | null;
  siteGroupKey: string | null;
  siteGroupLabel: string | null;
  siteDomain: string | null;
  status: "pending" | "running" | "completed" | "failed";
  claimedBy: string | null;
  claimedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  skusProcessed: number;
  skusSuccessful: number;
  skusFailed: number;
  errorMessage: string | null;
}

export interface ActiveJob {
  id: string;
  skuCount: number;
  scrapers: string[];
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  completedAt: string | null;
  progress: number;
  runnerName: string | null;
  progressMessage: string | null;
  progressPhase: string | null;
  currentSku: string | null;
  itemsProcessed: number | null;
  itemsTotal: number | null;
  lastLogMessage: string | null;
  lastLogLevel: string | null;
  lastLogAt: string | null;
  lastUpdateAt: string | null;
  heartbeatAt: string | null;
  /** Per-chunk breakdown for this job */
  chunks: ChunkDetail[];
  /** Aggregate chunk counts for quick summary */
  chunkSummary: {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
}

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.authorized) {
    return auth.response;
  }

  const supabase = await createClient();

  // Fetch active jobs (pending/claimed/running)
  const { data: activeJobs, error: activeJobsError } = await supabase
    .from("scrape_jobs")
    .select(
      "id, status, created_at, completed_at, updated_at, scrapers, skus, runner_name, heartbeat_at, progress_percent, progress_message, progress_phase, progress_updated_at, current_sku, items_processed, items_total, last_event_at, last_log_at, last_log_level, last_log_message",
    )
    .in("status", ["pending", "claimed", "running"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (activeJobsError) {
    console.error("[Active Runs] Failed to fetch active jobs:", activeJobsError);
    return NextResponse.json(
      { error: "Failed to fetch active jobs" },
      { status: 500 },
    );
  }

  // Fetch recent completed/failed jobs (last 1 hour, up to 10)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentJobs, error: recentJobsError } = await supabase
    .from("scrape_jobs")
    .select(
      "id, status, created_at, completed_at, updated_at, scrapers, skus, runner_name, heartbeat_at, progress_percent, progress_message, progress_phase, progress_updated_at, current_sku, items_processed, items_total, last_event_at, last_log_at, last_log_level, last_log_message",
    )
    .in("status", ["completed", "failed"])
    .gte("completed_at", oneHourAgo)
    .order("completed_at", { ascending: false })
    .limit(10);

  if (recentJobsError) {
    console.error("[Active Runs] Failed to fetch recent jobs:", recentJobsError);
    // Non-fatal: continue with active jobs only
  }

  const allJobs = [...(activeJobs || []), ...(recentJobs || [])];

  if (allJobs.length === 0) {
    return NextResponse.json({ jobs: [], recentJobs: [] });
  }

  const jobIds = allJobs.map((j) => j.id);

  // Fetch full chunk detail for all jobs
  const { data: chunks, error: chunksError } = await supabase
    .from("scrape_job_chunks")
    .select(
      "id, job_id, chunk_index, skus, status, claimed_by, claimed_at, started_at, completed_at, skus_processed, skus_successful, skus_failed, error_message, planned_work_units, sku_slice_index, site_group_key, site_group_label, site_domain",
    )
    .in("job_id", jobIds)
    .order("chunk_index", { ascending: true });

  if (chunksError) {
    console.error("[Active Runs] Failed to fetch chunks:", chunksError);
    return NextResponse.json(
      { error: "Failed to fetch job chunks" },
      { status: 500 },
    );
  }

  // Group chunks by job ID
  const chunksByJob = new Map<string, ChunkDetail[]>();
  for (const chunk of chunks || []) {
    const detail: ChunkDetail = {
      id: chunk.id,
      jobId: chunk.job_id,
      chunkIndex: chunk.chunk_index,
      skuCount: Array.isArray(chunk.skus) ? chunk.skus.length : 0,
      plannedWorkUnits: typeof chunk.planned_work_units === "number" ? chunk.planned_work_units : 0,
      skuSliceIndex: typeof chunk.sku_slice_index === "number" ? chunk.sku_slice_index : null,
      siteGroupKey: typeof chunk.site_group_key === "string" ? chunk.site_group_key : null,
      siteGroupLabel: typeof chunk.site_group_label === "string" ? chunk.site_group_label : null,
      siteDomain: typeof chunk.site_domain === "string" ? chunk.site_domain : null,
      status: chunk.status,
      claimedBy: chunk.claimed_by || null,
      claimedAt: chunk.claimed_at || null,
      startedAt: chunk.started_at || null,
      completedAt: chunk.completed_at || null,
      skusProcessed: chunk.skus_processed ?? 0,
      skusSuccessful: chunk.skus_successful ?? 0,
      skusFailed: chunk.skus_failed ?? 0,
      errorMessage: chunk.error_message || null,
    };

    const existing = chunksByJob.get(chunk.job_id) || [];
    existing.push(detail);
    chunksByJob.set(chunk.job_id, existing);
  }

  function mapJob(job: (typeof allJobs)[number]): ActiveJob {
    const jobChunks = chunksByJob.get(job.id) || [];
    const chunkSummary = {
      total: jobChunks.length,
      pending: jobChunks.filter((c) => c.status === "pending").length,
      running: jobChunks.filter((c) => c.status === "running").length,
      completed: jobChunks.filter((c) => c.status === "completed").length,
      failed: jobChunks.filter((c) => c.status === "failed").length,
    };

    const fallbackProgress =
      chunkSummary.total > 0
        ? Math.round((chunkSummary.completed / chunkSummary.total) * 100)
        : 0;

    const status =
      job.status === "claimed" ? "running" : (job.status as ActiveJob["status"]);
    const progress =
      typeof job.progress_percent === "number"
        ? job.progress_percent
        : fallbackProgress;

    return {
      id: job.id,
      skuCount: Array.isArray(job.skus) ? job.skus.length : 0,
      scrapers: job.scrapers || [],
      status,
      createdAt: job.created_at,
      completedAt: job.completed_at || null,
      progress,
      runnerName: job.runner_name || null,
      progressMessage: job.progress_message || null,
      progressPhase: job.progress_phase || null,
      currentSku: job.current_sku || null,
      itemsProcessed:
        typeof job.items_processed === "number" ? job.items_processed : null,
      itemsTotal: typeof job.items_total === "number" ? job.items_total : null,
      lastLogMessage: job.last_log_message || null,
      lastLogLevel: job.last_log_level || null,
      lastLogAt: job.last_log_at || null,
      lastUpdateAt:
        job.progress_updated_at ||
        job.last_event_at ||
        job.updated_at ||
        job.created_at,
      heartbeatAt: job.heartbeat_at || null,
      chunks: jobChunks,
      chunkSummary,
    };
  }

  const activeResponse = (activeJobs || []).map(mapJob);
  const recentResponse = (recentJobs || []).map(mapJob);

  return NextResponse.json({
    jobs: activeResponse,
    recentJobs: recentResponse,
  });
}
