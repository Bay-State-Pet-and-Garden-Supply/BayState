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
import { 
  ActiveJob, 
  ExpandPanel, 
  TimeRange, 
  JobCard, 
  ConnectionIndicator, 
  toActiveJob 
} from "./job-utils";
import { useJobSubscription } from "@/lib/realtime/useJobSubscription";
import { useLogSubscription } from "@/lib/realtime/useLogSubscription";
import type { LogEntry } from "@/lib/realtime/useLogSubscription";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import { useDocumentVisible } from "@/hooks/useDocumentVisible";

interface ActiveRunsTabProps {
  className?: string;
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
