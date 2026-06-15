import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";
interface ChunkDetail {
  id: string;
  jobId: string;
  chunkIndex: number;
  upcCount: number;
  plannedWorkUnits: number;
  upcSliceIndex: number | null;
  siteGroupKey: string | null;
  siteGroupLabel: string | null;
  siteDomain: string | null;
  status: "pending" | "running" | "completed" | "failed";
  claimedBy: string | null;
  claimedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  upcsProcessed: number;
  upcsSuccessful: number;
  upcsFailed: number;
  errorMessage: string | null;
}

interface ActiveJob {
  id: string;
  jobType: string | null;
  officialBrandPhase: string | null;
  upcCount: number;
  scrapers: string[];
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  completedAt: string | null;
  progress: number;
  runnerName: string | null;
  progressMessage: string | null;
  progressPhase: string | null;
  currentUpc: string | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth(request);
  if (!auth.authorized) {
    return auth.response;
  }

  const supabase = await createAdminClient();

  // Fetch active jobs (pending/running)
  const { data: activeJobs, error: activeJobsError } = await supabase
    .from("enrichment_jobs")
    .select(
      "id, config, status, created_at, completed_at, updated_at, upcs, claimed_by, started_at, heartbeat_at, last_log_message, last_log_level, last_log_at, progress_percent, progress_message, progress_phase, current_upc, items_processed, items_total",
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
    .from("enrichment_jobs")
    .select(
      "id, config, status, created_at, completed_at, updated_at, upcs, claimed_by, started_at, heartbeat_at, last_log_message, last_log_level, last_log_at, progress_percent, progress_message, progress_phase, current_upc, items_processed, items_total",
    )
    .in("status", ["completed", "failed"])
    .gte("completed_at", oneHourAgo)
    .order("completed_at", { ascending: false })
    .limit(10);

  if (recentJobsError) {
    console.error("[Active Runs] Failed to fetch recent jobs:", recentJobsError);
  }

  const allJobs = [...(activeJobs || []), ...(recentJobs || [])];

  if (allJobs.length === 0) {
    return NextResponse.json({ jobs: [], recentJobs: [] });
  }

  const jobIds = allJobs.map((j) => j.id);

  // Fetch full attempts detail for all jobs
  const { data: attempts, error: attemptsError } = await supabase
    .from("enrichment_attempts")
    .select(
      "id, job_id, upc, status, claimed_by, started_at, completed_at, error_message",
    )
    .in("job_id", jobIds);

  if (attemptsError) {
    console.error("[Active Runs] Failed to fetch attempts:", attemptsError);
    return NextResponse.json(
      { error: "Failed to fetch job attempts" },
      { status: 500 },
    );
  }

  // Group attempts by job ID
  const attemptsByJob = new Map<string, ChunkDetail[]>();
  for (const attempt of attempts || []) {
    const detail: ChunkDetail = {
      id: attempt.id,
      jobId: attempt.job_id,
      chunkIndex: 0, // Placeholder
      upcCount: 1,
      plannedWorkUnits: 1,
      upcSliceIndex: null,
      siteGroupKey: null,
      siteGroupLabel: null,
      siteDomain: null,
      status: attempt.status as "pending" | "running" | "completed" | "failed",
      claimedBy: attempt.claimed_by || null,
      claimedAt: null,
      startedAt: attempt.started_at || null,
      completedAt: attempt.completed_at || null,
      upcsProcessed: 1,
      upcsSuccessful: attempt.status === 'completed' ? 1 : 0,
      upcsFailed: attempt.status === 'failed' ? 1 : 0,
      errorMessage: attempt.error_message || null,
    };

    const existing = attemptsByJob.get(attempt.job_id) || [];
    existing.push(detail);
    attemptsByJob.set(attempt.job_id, existing);
  }

  function mapJob(job: (typeof allJobs)[number]): ActiveJob {
    const jobAttempts = attemptsByJob.get(job.id) || [];
    const chunkSummary = {
      total: jobAttempts.length || job.upcs?.length || 0,
      pending: jobAttempts.filter((c) => c.status === "pending").length,
      running: jobAttempts.filter((c) => c.status === "running").length,
      completed: jobAttempts.filter((c) => c.status === "completed").length,
      failed: jobAttempts.filter((c) => c.status === "failed").length,
    };

    const fallbackProgress =
      chunkSummary.total > 0
        ? Math.round((chunkSummary.completed / chunkSummary.total) * 100)
        : 0;

    return {
      id: job.id,
      jobType: "enrichment",
      officialBrandPhase: null,
      upcCount: Array.isArray(job.upcs) ? job.upcs.length : 0,
      scrapers: isRecord(job.config) && Array.isArray(job.config.scrapers) ? (job.config.scrapers as string[]) : [],
      status: job.status as "pending" | "running" | "completed" | "failed" | "cancelled",
      createdAt: job.created_at,
      completedAt: job.completed_at || null,
      progress: job.progress_percent ?? fallbackProgress,
      runnerName: job.claimed_by || null,
      progressMessage: job.progress_message || null,
      progressPhase: job.progress_phase || null,
      currentUpc: job.current_upc || null,
      itemsProcessed: job.items_processed || null,
      itemsTotal: job.items_total || null,
      lastLogMessage: job.last_log_message || null,
      lastLogLevel: job.last_log_level || null,
      lastLogAt: job.last_log_at || null,
      lastUpdateAt: job.updated_at,
      heartbeatAt: job.heartbeat_at || null,
      chunks: jobAttempts,
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
