import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminAuth } from "@/lib/admin/api-auth";

interface ActiveJob {
  id: string;
  skuCount: number;
  scrapers: string[];
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
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
}

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.authorized) {
    return auth.response;
  }

  const supabase = await createClient();
  const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: jobs, error: jobsError } = await supabase
    .from("scrape_jobs")
    .select(
      "id, status, created_at, updated_at, scrapers, skus, runner_name, heartbeat_at, progress_percent, progress_message, progress_phase, progress_updated_at, current_sku, items_processed, items_total, last_event_at, last_log_at, last_log_level, last_log_message",
    )
    .in("status", ["pending", "claimed", "running"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (jobsError) {
    console.error("[Active Runs] Failed to fetch jobs:", jobsError);
    return NextResponse.json(
      { error: "Failed to fetch active jobs" },
      { status: 500 },
    );
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ jobs: [] });
  }

  const jobIds = jobs.map((j) => j.id);

  const { data: chunks, error: chunksError } = await supabase
    .from("scrape_job_chunks")
    .select("job_id, status")
    .in("job_id", jobIds);

  if (chunksError) {
    console.error("[Active Runs] Failed to fetch chunks:", chunksError);
    return NextResponse.json(
      { error: "Failed to fetch job progress" },
      { status: 500 },
    );
  }

  const chunksByJob = new Map<string, { completed: number; total: number }>();

  for (const chunk of chunks || []) {
    const current = chunksByJob.get(chunk.job_id) || { completed: 0, total: 0 };
    current.total += 1;
    if (chunk.status === "completed") {
      current.completed += 1;
    }
    chunksByJob.set(chunk.job_id, current);
  }

  const response: ActiveJob[] = jobs.map((job) => {
    const chunkProgress = chunksByJob.get(job.id) || { completed: 0, total: 0 };
    const fallbackProgress =
      chunkProgress.total > 0
        ? Math.round((chunkProgress.completed / chunkProgress.total) * 100)
        : 0;

    const status = job.status === "claimed" ? "running" : job.status;
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
    };
  });

  return NextResponse.json({ jobs: response });
}
