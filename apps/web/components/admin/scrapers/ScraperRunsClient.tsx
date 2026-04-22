'use client';

import { useState, useTransition, useMemo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Play,
  RotateCcw,
  History,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScraperRunRecord } from '@/lib/admin/scrapers/runs-types';
import { cancelScraperRun } from '@/app/admin/scrapers/runs/actions';
import { useJobSubscription } from "@/lib/realtime/useJobSubscription";
import { useLogSubscription } from "@/lib/realtime/useLogSubscription";
import { 
  ActiveJob, 
  ExpandPanel, 
  JobCard, 
  ConnectionIndicator, 
  toActiveJob,
  TimeRange
} from '@/components/admin/pipeline/job-utils';
import { TimelineView } from '@/components/admin/pipeline/TimelineView';
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import { useDocumentVisible } from "@/hooks/useDocumentVisible";

interface ScraperRunsClientProps {
  initialRuns: ScraperRunRecord[];
  totalCount: number;
}

function mapRunToActiveJob(run: ScraperRunRecord): ActiveJob {
  return {
    id: run.id,
    skuCount: run.total_skus,
    scrapers: [run.scraper_name],
    status: (run.status === 'claimed' ? 'running' : run.status) as ActiveJob['status'],
    createdAt: run.created_at,
    completedAt: run.completed_at,
    progress: run.progress_percent ?? 0,
    runnerName: run.runner_name ?? null,
    progressMessage: run.progress_message ?? null,
    progressPhase: run.progress_phase ?? null,
    currentSku: run.current_sku ?? null,
    itemsProcessed: run.items_processed ?? null,
    itemsTotal: run.items_total ?? null,
    lastLogMessage: run.last_log_message ?? null,
    lastLogLevel: run.last_log_level ?? null,
    lastLogAt: run.last_log_at ?? null,
    lastUpdateAt: run.updated_at ?? run.created_at,
    heartbeatAt: run.heartbeat_at ?? null,
    chunks: [],
    chunkSummary: { 
      total: 0, 
      pending: 0, 
      running: 0, 
      completed: 0, 
      failed: 0 
    },
  };
}

export function ScraperRunsClient({ initialRuns, totalCount }: ScraperRunsClientProps) {
  const isDocumentVisible = useDocumentVisible();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [expandedPanels, setExpandedPanels] = useState<Map<string, ExpandPanel>>(new Map());
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [pendingCancelJobId, setPendingCancelJobId] = useState<string | null>(null);
  
  // State for jobs with chunk data (fetched from API)
  const [apiJobs, setApiJobs] = useState<Map<string, ActiveJob>>(new Map());
  const [loadingChunks, setLoadingChunks] = useState(false);

  // Supabase Realtime: subscribe to scrape_jobs changes
  const { isConnected: jobsConnected, jobs: realtimeJobs } = useJobSubscription({
    maxJobsPerStatus: 50,
  });

  // Supabase Realtime: subscribe to scrape_job_logs for live streaming
  const { logs, isConnected: logsConnected } = useLogSubscription({
    maxEntries: 500,
  });
  const isRealtimeConnected = jobsConnected || logsConnected;

  // Fetch active jobs with chunk data
  const fetchActiveJobDetails = useCallback(async () => {
    try {
      setLoadingChunks(true);
      const response = await fetch("/api/admin/pipeline/active-runs");
      if (!response.ok) throw new Error("Failed to fetch job details");
      const data = await response.json();
      
      const newApiJobs = new Map<string, ActiveJob>();
      (data.jobs || []).forEach((job: ActiveJob) => {
        newApiJobs.set(job.id, job);
      });
      (data.recentJobs || []).forEach((job: ActiveJob) => {
        newApiJobs.set(job.id, job);
      });
      
      setApiJobs(newApiJobs);
    } catch (err) {
      console.error("Error fetching active job chunks:", err);
    } finally {
      setLoadingChunks(false);
    }
  }, []);

  useEffect(() => {
    void fetchActiveJobDetails();
  }, [fetchActiveJobDetails]);

  // Poll for updates when active jobs exist
  useEffect(() => {
    if (!isDocumentVisible) return;

    const interval = setInterval(() => {
      void fetchActiveJobDetails();
    }, 10000); // 10s interval for the Scrapers tab

    return () => clearInterval(interval);
  }, [fetchActiveJobDetails, isDocumentVisible]);

  // Use useMemo to merge initial server-side runs, API job details, and real-time updates
  const runs = useMemo(() => {
    // 1. Start with initial runs from server
    const jobMap = new Map<string, ActiveJob>(initialRuns.map(run => [run.id, mapRunToActiveJob(run)]));

    // 2. Overwrite with detailed API jobs (chunks/progress)
    apiJobs.forEach((job, id) => {
      jobMap.set(id, job);
    });

    // 3. Apply realtime updates
    const allRealtimeJobs = [
      ...realtimeJobs.pending,
      ...realtimeJobs.running,
      ...realtimeJobs.completed,
      ...realtimeJobs.failed,
      ...realtimeJobs.cancelled,
    ];

    allRealtimeJobs.forEach((rj) => {
      const nextJob = toActiveJob(rj);
      const existing = jobMap.get(rj.id);

      if (existing) {
        // Preserve detailed data from API fetch if available
        nextJob.chunks = existing.chunks;
        nextJob.chunkSummary = existing.chunkSummary;
        // Also preserve completedAt for historical accuracy
        if (rj.status === 'completed') {
          nextJob.completedAt = rj.updated_at ?? existing.completedAt;
        } else {
          nextJob.completedAt = existing.completedAt;
        }
      }

      jobMap.set(rj.id, nextJob);
    });

    return Array.from(jobMap.values()).sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime()
    );
  }, [initialRuns, apiJobs, realtimeJobs]);

  const runningCount = runs.filter((r) => r.status === 'running').length;
  const completedCount = runs.filter((r) => r.status === 'completed').length;
  const failedCount = runs.filter((r) => r.status === 'failed').length;

  const handleCancelClick = (jobId: string) => {
    setPendingCancelJobId(jobId);
    setConfirmCancelOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!pendingCancelJobId) return;
    setConfirmCancelOpen(false);

    const jobId = pendingCancelJobId;
    setCancellingId(jobId);
    
    startTransition(async () => {
      const result = await cancelScraperRun(jobId);
      if (result.success) {
        toast.success('Job cancelled');
        router.refresh();
        void fetchActiveJobDetails();
      } else {
        toast.error(result.error || 'Failed to cancel job');
      }
      setCancellingId(null);
      setPendingCancelJobId(null);
    });
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

  const timelineJobs = useMemo(() => {
    return runs.map((job) => ({
      id: job.id,
      name: `Job ${job.id.slice(0, 8)}`,
      startTime: new Date(job.createdAt),
      status: job.status,
      runner: job.scrapers.join(", "),
    }));
  }, [runs]);

  const getJobLogCount = useCallback(
    (jobId: string) => logs.filter((l) => l.job_id === jobId).length,
    [logs],
  );

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-none border-4 border-zinc-950 bg-brand-gold shadow-[4px_4px_0px_rgba(0,0,0,1)]">
            <History className="h-5 w-5 text-zinc-950" />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tighter text-zinc-950">Scraper Runs</h1>
            <div className="flex items-center gap-4">
              <p className="text-xs font-black uppercase tracking-tighter text-zinc-500">
                {totalCount} scrape job history
              </p>
              <ConnectionIndicator isConnected={isRealtimeConnected} />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2 mr-4 bg-zinc-100 p-1 border-2 border-zinc-950 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="rounded-none h-8 font-black uppercase tracking-tighter text-[10px]"
              onClick={() => setViewMode("list")}
            >
              List
            </Button>
            <Button
              variant={viewMode === "timeline" ? "default" : "ghost"}
              size="sm"
              className="rounded-none h-8 font-black uppercase tracking-tighter text-[10px]"
              onClick={() => setViewMode("timeline")}
            >
              Timeline
            </Button>
          </div>
          <Button variant="outline" asChild className="rounded-none border-2 border-zinc-950 font-black uppercase tracking-tighter shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all">
            <Link href="/admin/scrapers/network">
              <Play className="mr-2 h-4 w-4" />
              Runners
            </Link>
          </Button>
          <Button 
            variant="outline" 
            onClick={() => {
              router.refresh();
              void fetchActiveJobDetails();
            }} 
            disabled={isPending || loadingChunks}
            className="rounded-none border-2 border-zinc-950 font-black uppercase tracking-tighter shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all"
          >
            <RotateCcw className={`mr-2 h-4 w-4 ${isPending || loadingChunks ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="rounded-none border-4 border-zinc-950 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-tighter text-zinc-500">Total Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black uppercase tracking-tighter text-zinc-950">{totalCount}</div>
          </CardContent>
        </Card>

        <Card className="rounded-none border-4 border-zinc-950 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-tighter text-zinc-500">Running</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black uppercase tracking-tighter text-blue-700">{runningCount}</div>
          </CardContent>
        </Card>

        <Card className="rounded-none border-4 border-zinc-950 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-tighter text-zinc-500">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black uppercase tracking-tighter text-brand-forest-green">{completedCount}</div>
          </CardContent>
        </Card>

        <Card className="rounded-none border-4 border-zinc-950 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-tighter text-zinc-500">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black uppercase tracking-tighter text-brand-burgundy">{failedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Runs Content */}
      {viewMode === "timeline" ? (
        <TimelineView
          jobs={timelineJobs}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          onJobClick={(job) => router.push(`/admin/scrapers/runs/${job.id}`)}
        />
      ) : (
        <div className="space-y-4">
          {runs.length === 0 ? (
            <Card className="rounded-none border-4 border-zinc-950 shadow-[8px_8px_0px_rgba(0,0,0,1)] py-12 text-center">
              <p className="font-black uppercase tracking-tighter text-zinc-500">No scraper runs found.</p>
            </Card>
          ) : (
            runs.map((run) => (
              <JobCard
                key={run.id}
                job={run}
                logs={logs}
                expandedPanel={expandedPanels.get(run.id) ?? null}
                onTogglePanel={(panel) => togglePanel(run.id, panel)}
                onCancelClick={handleCancelClick}
                cancellingId={cancellingId}
                logCount={getJobLogCount(run.id)}
              />
            ))
          )}
        </div>
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

