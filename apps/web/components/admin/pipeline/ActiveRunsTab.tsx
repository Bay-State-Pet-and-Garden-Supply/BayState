"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Play,
  Clock,
  Loader2,
  XCircle,
  CheckCircle,
  ExternalLink,
  History,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
  AlertCircle,
  Bug,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { TimelineView } from "./TimelineView";
import { ChunkStatusTable, ChunkSummaryLine } from "./ChunkStatusTable";
import type { ChunkDetail } from "./ChunkStatusTable";
import { ProgressBar } from "./ProgressBar";
import { useJobSubscription } from "@/lib/realtime/useJobSubscription";
import { useLogSubscription } from "@/lib/realtime/useLogSubscription";
import type { LogEntry } from "@/lib/realtime/useLogSubscription";
import type { JobAssignment } from "@/lib/realtime/types";
import { progressUpdateFromJobRecord } from "@/lib/scraper-logs";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import { useDocumentVisible } from "@/hooks/useDocumentVisible";

interface ActiveJob {
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
  chunks: ChunkDetail[];
  chunkSummary: {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
}

type TimeRange = "1h" | "6h" | "24h" | "7d" | "30d";

interface ActiveRunsTabProps {
  className?: string;
}

const LOG_LEVEL_CONFIG: Record<
  string,
  { icon: typeof Info; color: string; bgColor: string }
> = {
  debug: { icon: Bug, color: "text-zinc-500", bgColor: "bg-zinc-100" },
  info: { icon: Info, color: "text-blue-950", bgColor: "bg-blue-100" },
  warning: {
    icon: AlertTriangle,
    color: "text-zinc-950",
    bgColor: "bg-brand-gold",
  },
  error: { icon: AlertCircle, color: "text-white", bgColor: "bg-brand-burgundy" },
  critical: { icon: AlertCircle, color: "text-white", bgColor: "bg-brand-burgundy" },
};

function LogLevelBadge({ level }: { level: string }) {
  const config = LOG_LEVEL_CONFIG[level.toLowerCase()] || LOG_LEVEL_CONFIG.info;
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-none border border-zinc-950 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter shadow-[1px_1px_0px_rgba(0,0,0,1)] ${config.bgColor} ${config.color}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {level}
    </span>
  );
}

function ConnectionIndicator({ isConnected }: { isConnected: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
      {isConnected ? (
        <>
          <div className="h-3 w-3 bg-brand-forest-green border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)] animate-pulse" />
          <span className="text-brand-forest-green">Connected</span>
        </>
      ) : (
        <>
          <div className="h-3 w-3 bg-zinc-400 border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]" />
          <span className="text-zinc-500">Offline</span>
        </>
      )}
    </div>
  );
}

function JobLogPanel({ jobId, logs }: { jobId: string; logs: LogEntry[] }) {
  const jobLogs = useMemo(
    () => logs.filter((l) => l.job_id === jobId),
    [jobId, logs]
  );

  if (jobLogs.length === 0) {
    return (
      <div className="px-2 py-4 text-xs text-zinc-500 font-black uppercase tracking-tighter text-center border-t border-zinc-950 bg-zinc-50">
        No log entries yet — logs will stream in real time.
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-950 bg-zinc-50">
      <ScrollArea className="max-h-64">
        <div className="divide-y-2 divide-zinc-950/10">
          {jobLogs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-2 px-2 py-1.5 text-xs hover:bg-white transition-colors"
            >
              <LogLevelBadge level={log.level} />
              <span className="flex-1 text-zinc-900 font-mono break-all leading-relaxed">
                {log.message}
              </span>
              <span className="text-zinc-500 font-black uppercase tracking-tighter tabular-nums shrink-0">
                {new Date(log.created_at ?? log.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function toActiveJob(job: JobAssignment): ActiveJob {
  const liveProgress = progressUpdateFromJobRecord(job);

  return {
    id: job.id,
    skuCount: job.skus?.length ?? 0,
    scrapers: job.scrapers ?? [],
    status:
      job.status === "claimed"
        ? "running"
        : (job.status as ActiveJob["status"]),
    createdAt: job.created_at,
    completedAt: null,
    progress: liveProgress?.progress ?? 0,
    runnerName: job.runner_name ?? liveProgress?.runner_name ?? null,
    progressMessage: liveProgress?.message ?? null,
    progressPhase: liveProgress?.phase ?? null,
    currentSku: liveProgress?.current_sku ?? null,
    itemsProcessed: liveProgress?.items_processed ?? null,
    itemsTotal: liveProgress?.items_total ?? null,
    lastLogMessage: job.last_log_message ?? null,
    lastLogLevel: job.last_log_level ?? null,
    lastLogAt: job.last_log_at ?? null,
    lastUpdateAt:
      liveProgress?.timestamp ??
      job.last_event_at ??
      job.updated_at ??
      job.created_at,
    heartbeatAt: job.heartbeat_at ?? null,
    // Chunks are populated from the API, not from realtime
    chunks: [],
    chunkSummary: { total: 0, pending: 0, running: 0, completed: 0, failed: 0 },
  };
}

/** Panels to expand within a job card */
type ExpandPanel = "chunks" | "logs";

function JobStatusBadge({ status }: { status: ActiveJob["status"] }) {
  const statusMap = {
    running: {
      className: "bg-blue-100 text-blue-950",
      icon: <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />,
      label: "Running",
    },
    completed: {
      className: "bg-brand-forest-green text-white",
      icon: <CheckCircle className="mr-1.5 h-3 w-3" />,
      label: "Completed",
    },
    failed: {
      className: "bg-brand-burgundy text-white",
      icon: <AlertCircle className="mr-1.5 h-3 w-3" />,
      label: "Failed",
    },
    cancelled: {
      className: "bg-zinc-500 text-white",
      icon: <XCircle className="mr-1.5 h-3 w-3" />,
      label: "Cancelled",
    },
    pending: {
      className: "bg-brand-gold text-zinc-950",
      icon: <Clock className="mr-1.5 h-3 w-3" />,
      label: "Pending",
    },
  };

  const config = statusMap[status] || statusMap.pending;

  return (
    <span
      className={`inline-flex items-center rounded-none border border-zinc-950 px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter shadow-[1px_1px_0px_rgba(0,0,0,1)] ${config.className}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

function JobCard({
  job,
  logs,
  expandedPanel,
  onTogglePanel,
  onCancelClick,
  cancellingId,
  logCount,
}: {
  job: ActiveJob;
  logs: LogEntry[];
  expandedPanel: ExpandPanel | null;
  onTogglePanel: (panel: ExpandPanel) => void;
  onCancelClick: (jobId: string) => void;
  cancellingId: string | null;
  logCount: number;
}) {
  const hasChunks = job.chunkSummary.total > 0;
  const isActive = job.status === "pending" || job.status === "running";

  return (
    <div className="rounded-none border border-zinc-950 bg-white shadow-[1px_1px_0px_rgba(0,0,0,1)] overflow-hidden">
      <div className="p-2 sm:p-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-black uppercase tracking-tighter text-zinc-950">
                Job {job.id.slice(0, 8)}
              </h3>
              <JobStatusBadge status={job.status} />
            </div>
            <p className="text-xs font-black uppercase tracking-tighter text-zinc-500 mt-1">
              {job.scrapers.join(", ")}
            </p>
            <p className="text-[10px] font-black uppercase tracking-tighter text-zinc-400 mt-0.5">
              {job.skuCount} SKUs • Started{" "}
              {new Date(job.createdAt).toLocaleString()}
              {job.completedAt && (
                <> • Finished {new Date(job.completedAt).toLocaleString()}</>
              )}
            </p>
            {typeof job.itemsTotal === "number" ? (
              <p className="text-[10px] font-black uppercase tracking-tighter text-zinc-400 mt-0.5">
                {job.itemsTotal} Work Units
                {job.chunkSummary.total > 0 ? ` • ${job.chunkSummary.total} Chunks` : ""}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {job.runnerName ? (
                <span className="rounded-none border border-zinc-950 bg-zinc-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                  Runner: {job.runnerName}
                </span>
              ) : null}
              {job.progressPhase ? (
                <span className="rounded-none border border-zinc-950 bg-zinc-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-tighter shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                  {job.progressPhase}
                </span>
              ) : null}
              {job.currentSku ? (
                <span className="font-mono text-[10px] font-bold text-zinc-950 bg-zinc-50 border border-zinc-200 px-1.5 py-0.5">
                  {job.currentSku}
                </span>
              ) : null}
              {typeof job.itemsProcessed === "number" &&
              typeof job.itemsTotal === "number" ? (
                <span className="text-[10px] font-black uppercase tracking-tighter text-zinc-500">
                  {job.itemsProcessed}/{job.itemsTotal}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Progress Section */}
        <div className="mt-2">
          <ProgressBar 
            progress={job.progress} 
            status={job.status} 
            className="mb-1"
          />
          
          {hasChunks && (
            <div className="flex items-center gap-2 mb-1">
              <ChunkSummaryLine summary={job.chunkSummary} />
            </div>
          )}

          {(job.progressMessage || job.lastLogMessage) && (
            <div className="mt-2 space-y-1">
              {job.progressMessage ? (
                <p className="text-xs font-bold text-zinc-900">
                  {job.progressMessage}
                </p>
              ) : null}
              {job.lastLogMessage ? (
                <div className="flex items-center gap-2 text-zinc-500">
                  {job.lastLogLevel ? (
                    <LogLevelBadge level={job.lastLogLevel} />
                  ) : null}
                  <span className="line-clamp-1 text-[11px] font-medium">
                    {job.lastLogMessage}
                  </span>
                  {job.lastLogAt ? (
                    <span className="shrink-0 tabular-nums text-[10px] font-black uppercase tracking-tighter">
                      {new Date(job.lastLogAt).toLocaleTimeString()}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-2 flex items-center justify-between pt-2 border-t border-zinc-950/5">
          <div className="flex items-center gap-2">
            {/* Chunks Toggle */}
            {hasChunks && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onTogglePanel("chunks")}
                className={`text-[10px] h-7 gap-1.5 ${expandedPanel === "chunks" ? "bg-zinc-100" : ""}`}
              >
                <Layers className="h-3.5 w-3.5" />
                {job.chunkSummary.total} Chunks
                {expandedPanel === "chunks" ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>
            )}

            {/* Logs Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onTogglePanel("logs")}
              className={`text-[10px] h-7 gap-1.5 ${expandedPanel === "logs" ? "bg-zinc-100" : ""}`}
            >
              Logs
              {logCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-0.5 text-[9px] px-1.5 py-0 rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
                >
                  {logCount}
                </Badge>
              )}
              {expandedPanel === "logs" ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {isActive && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onCancelClick(job.id)}
                disabled={cancellingId === job.id}
                className="h-7 w-7 p-0"
              >
                {cancellingId === job.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
            <Button variant="outline" size="sm" asChild className="h-7 w-7 p-0">
              <Link href={`/admin/scrapers/runs/${job.id}`}>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Expandable Panels */}
      {expandedPanel === "chunks" && hasChunks && (
        <ChunkStatusTable chunks={job.chunks} />
      )}
      {expandedPanel === "logs" && <JobLogPanel jobId={job.id} logs={logs} />}
    </div>
  );
}

export function ActiveRunsTab({ className }: ActiveRunsTabProps) {
  const isDocumentVisible = useDocumentVisible();
  const router = useRouter();
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [recentJobs, setRecentJobs] = useState<ActiveJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [pendingCancelJobId, setPendingCancelJobId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");
  const [timeRange, setTimeRange] = useState<TimeRange>("1h");
  const [expandedPanels, setExpandedPanels] = useState<Map<string, ExpandPanel>>(new Map());

  // Supabase Realtime: subscribe to scrape_jobs changes
  const { isConnected: jobsConnected, jobs: realtimeJobs } = useJobSubscription(
    {
      maxJobsPerStatus: 50,
      onJobCreated: (job) => {
        toast.info(`New job created: ${job.id.slice(0, 8)}...`);
      },
      onJobUpdated: (job) => {
        if (job.status === "completed") {
          toast.success(`Job ${job.id.slice(0, 8)} completed`);
        } else if (job.status === "failed") {
          toast.error(`Job ${job.id.slice(0, 8)} failed`);
        }
      },
    },
  );

  // Supabase Realtime: subscribe to scrape_job_logs for live streaming
  const { logs, isConnected: logsConnected } = useLogSubscription({
    maxEntries: 500,
  });
  const isRealtimeConnected = jobsConnected || logsConnected;

  // Fetch jobs with chunk data from API
  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/pipeline/active-runs");
      if (!response.ok) throw new Error("Failed to fetch jobs");
      const data = await response.json();

      const activeJobs: ActiveJob[] = (data.jobs || []).filter(
        (job: ActiveJob) =>
          job.status === "pending" || job.status === "running",
      );
      setJobs(activeJobs);
      setRecentJobs(data.recentJobs || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  // Poll for chunk updates when active jobs exist (5s interval)
  useEffect(() => {
    if (!isDocumentVisible) return;

    const hasActiveJobs = jobs.some(
      (j) => j.status === "pending" || j.status === "running",
    );
    if (!hasActiveJobs) return;

    const interval = setInterval(() => {
      void fetchJobs();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchJobs, isDocumentVisible, jobs]);

  // Fallback polling when realtime is disconnected (slower)
  useEffect(() => {
    if (!isDocumentVisible || isRealtimeConnected) return;

    const interval = setInterval(() => {
      void fetchJobs();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchJobs, isDocumentVisible, isRealtimeConnected]);

  // Memoize the specific job arrays to stabilize the effect dependency
  const pendingJobs = realtimeJobs.pending;
  const runningJobs = realtimeJobs.running;
  const completedJobs = realtimeJobs.completed;
  const failedJobs = realtimeJobs.failed;
  const cancelledJobs = realtimeJobs.cancelled;

  // Merge realtime job updates into active jobs (preserving chunk data from API)
  useEffect(() => {
    const activeRealtimeJobs = [...pendingJobs, ...runningJobs];

    if (activeRealtimeJobs.length > 0) {
      setJobs((prev) => {
        const jobMap = new Map(prev.map((j) => [j.id, j]));
        let hasChanges = false;

        activeRealtimeJobs.forEach((rj) => {
          const nextJob = toActiveJob(rj);
          const existing = jobMap.get(rj.id);

          if (existing) {
            // Preserve chunk data from last API fetch
            nextJob.chunks = existing.chunks;
            nextJob.chunkSummary = existing.chunkSummary;
          }

          if (
            !existing ||
            existing.status !== nextJob.status ||
            existing.progress !== nextJob.progress ||
            existing.runnerName !== nextJob.runnerName ||
            existing.progressMessage !== nextJob.progressMessage
          ) {
            jobMap.set(rj.id, nextJob);
            hasChanges = true;
          }
        });

        if (!hasChanges) return prev;
        return Array.from(jobMap.values()).sort(
          (left, right) =>
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime(),
        );
      });
    }
  }, [pendingJobs, runningJobs, completedJobs, failedJobs, cancelledJobs]);

  const handleCancelClick = (jobId: string) => {
    setPendingCancelJobId(jobId);
    setConfirmCancelOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!pendingCancelJobId) return;
    setConfirmCancelOpen(false);

    const jobId = pendingCancelJobId;
    setCancellingId(jobId);
    try {
      const res = await fetch(`/api/admin/scrapers/runs/${jobId}/cancel`, {
        method: "POST",
      });

      if (res.ok) {
        toast.success("Job cancelled");
        fetchJobs();
      } else {
        toast.error("Failed to cancel job");
      }
    } catch {
      toast.error("Failed to cancel job");
    } finally {
      setCancellingId(null);
    }

    setPendingCancelJobId(null);
  };

  const togglePanel = (jobId: string, panel: ExpandPanel) => {
    setExpandedPanels((prev) => {
      const next = new Map(prev);
      if (next.get(jobId) === panel) {
        next.delete(jobId);
      } else {
        next.set(jobId, panel);
      }
      return next;
    });
  };

  // Transform ActiveJob[] to TimelineJob[]
  const timelineJobs = useMemo(() => {
    return jobs.map((job) => ({
      id: job.id,
      name: `Job ${job.id.slice(0, 8)}`,
      startTime: new Date(job.createdAt),
      status: job.status,
      runner: job.scrapers.join(", "),
    }));
  }, [jobs]);

  const getJobLogCount = useCallback(
    (jobId: string) => logs.filter((l) => l.job_id === jobId).length,
    [logs],
  );

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`rounded-none border border-zinc-950 bg-red-50 p-4 shadow-[1px_1px_0px_rgba(0,0,0,1)] ${className}`}
      >
        <p className="text-sm font-black uppercase text-red-600">Error: {error}</p>
      </div>
    );
  }

  const hasNoData = jobs.length === 0 && recentJobs.length === 0;

  if (hasNoData) {
    return (
      <div
        className={`flex flex-col items-center justify-center py-12 text-center ${className}`}
      >
        <Play className="h-12 w-12 text-gray-300 mb-4" />
        <h3 className="text-lg font-black uppercase tracking-tighter text-foreground">
          No active scraper jobs
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Scraper jobs will appear here when running
        </p>
        <div className="mt-4">
          <ConnectionIndicator isConnected={isRealtimeConnected} />
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {jobs.length} active job{jobs.length !== 1 ? "s" : ""}
          </span>
          <ConnectionIndicator isConnected={isRealtimeConnected} />
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("list")}
            >
              List
            </Button>
            <Button
              variant={viewMode === "timeline" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("timeline")}
            >
              Timeline
            </Button>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/scrapers/runs">
            <History className="mr-2 h-4 w-4" />
            View All Runs
          </Link>
        </Button>
      </div>

      {viewMode === "timeline" ? (
        <TimelineView
          jobs={timelineJobs}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          onJobClick={(job) => router.push(`/admin/scrapers/runs/${job.id}`)}
        />
      ) : (
        <>
          {/* Active Jobs */}
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              logs={logs}
              expandedPanel={expandedPanels.get(job.id) ?? null}
              onTogglePanel={(panel) => togglePanel(job.id, panel)}
              onCancelClick={handleCancelClick}
              cancellingId={cancellingId}
              logCount={getJobLogCount(job.id)}
            />
          ))}

          {/* Recent Completed/Failed Jobs */}
          {recentJobs.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2">
                  Recent (last hour)
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {recentJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  logs={logs}
                  expandedPanel={expandedPanels.get(job.id) ?? null}
                  onTogglePanel={(panel) => togglePanel(job.id, panel)}
                  onCancelClick={handleCancelClick}
                  cancellingId={cancellingId}
                  logCount={getJobLogCount(job.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmationDialog
        open={confirmCancelOpen}
        onOpenChange={(open) => {
          setConfirmCancelOpen(open);
          if (!open) setPendingCancelJobId(null);
        }}
        onConfirm={handleConfirmCancel}
        title="Cancel Job"
        description="Are you sure you want to cancel this job?"
        confirmLabel="Cancel Job"
        variant="destructive"
        isLoading={!!cancellingId}
      />
    </div>
  );
}
