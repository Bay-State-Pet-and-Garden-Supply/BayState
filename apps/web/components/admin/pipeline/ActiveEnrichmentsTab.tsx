"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  LifeBuoy,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PIPELINE_RUN_STATUS_LABELS } from "@/lib/pipeline/run-types";
import type { PipelineRunStatus } from "@/lib/pipeline/run-types";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/admin/api-client";

interface EnrichmentJobSummary {
  id: string;
  status: string;
  model?: string;
  mode?: string;
  total_count: number;
  completed_count: number;
  failed_count: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  cost_estimate?: number;
  error_message?: string;
}

interface ActiveEnrichmentsTabProps {
  initialJobs?: EnrichmentJobSummary[];
}

const statusIconMap: Record<string, typeof Activity> = {
  queued: Clock,
  running: Loader2,
  completed: CheckCircle2,
  completed_with_errors: AlertCircle,
  failed: AlertCircle,
  cancelled: Clock,
};

const statusColorMap: Record<string, string> = {
  queued: "text-muted-foreground",
  running: "text-blue-500",
  completed: "text-green-500",
  completed_with_errors: "text-amber-500",
  failed: "text-red-500",
  cancelled: "text-muted-foreground",
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleString();
}

function getElapsed(startedAt?: string, completedAt?: string): string {
  if (!startedAt) return "--";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const diff = Math.floor((end - start) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

function getProgressPercent(job: EnrichmentJobSummary): number {
  if (job.total_count === 0) return 0;
  return Math.round((job.completed_count / job.total_count) * 100);
}

export function ActiveEnrichmentsTab({ initialJobs = [] }: ActiveEnrichmentsTabProps) {
  const [jobs, setJobs] = useState<EnrichmentJobSummary[]>(initialJobs);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resettingStranded, setResettingStranded] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminFetch("/api/admin/enrichment/jobs");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch enrichment jobs (${response.status})`);
      }
      const data = await response.json();
      setJobs(data.jobs ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error fetching enrichment jobs";
      console.error("Error fetching enrichment jobs:", err);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRecoverStranded = async () => {
    if (!window.confirm("This will abort all active enrichment runs and reset stuck 'extracting' products back to 'imported'. Continue?")) return;
    
    setResettingStranded(true);
    try {
      const res = await adminFetch("/api/admin/enrichment/reset", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        if (data.products_reset > 0 || data.jobs_cancelled > 0) {
          toast.success(`Recovered ${data.products_reset} stuck product(s) and cancelled ${data.jobs_cancelled} active job(s).`);
          fetchJobs();
        } else {
          toast.info("No stranded products or active jobs found");
        }
      } else {
        toast.error(data.error || "Failed to recover stranded products");
      }
    } catch {
      toast.error("Failed to recover stranded products");
    } finally {
      setResettingStranded(false);
    }
  };

  useEffect(() => {
    if (initialJobs.length === 0) {
      fetchJobs();
    }
  }, [initialJobs.length, fetchJobs]);

  // Poll every 15s if any job is running
  useEffect(() => {
    const hasActiveJobs = jobs.some(
      (job) => job.status === "queued" || job.status === "running"
    );
    if (!hasActiveJobs) return;

    const interval = setInterval(fetchJobs, 15000);
    return () => clearInterval(interval);
  }, [jobs, fetchJobs]);

  const activeJobs = jobs.filter(
    (job) => job.status === "queued" || job.status === "running"
  );
  const completedJobs = jobs.filter(
    (job) =>
      job.status === "completed" ||
      job.status === "completed_with_errors" ||
      job.status === "failed" ||
      job.status === "cancelled"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Active Enrichment Runs</h2>
          <p className="text-sm text-muted-foreground">
            AI-powered product extraction from target URLs
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchJobs} disabled={loading}>
            <RefreshCw className={cn("size-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecoverStranded}
            disabled={resettingStranded}
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/[0.02]"
          >
            {resettingStranded ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <LifeBuoy className="mr-2 size-4" />
            )}
            Recover Stranded
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-none border border-destructive/20 bg-destructive/[0.02] p-3">
          <p className="text-sm font-bold uppercase text-destructive tracking-tight flex items-center gap-2">
            <AlertCircle className="size-4" />
            Queue Failure: {error}
          </p>
        </div>
      )}

      {/* Active Runs */}
      {activeJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            In Progress ({activeJobs.length})
          </h3>
          {activeJobs.map((job) => {
            const StatusIcon = statusIconMap[job.status] ?? Activity;
            return (
              <Card key={job.id} className="border-blue-200 dark:border-blue-800">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusIcon
                        className={cn(
                          "size-4",
                          statusColorMap[job.status],
                          job.status === "running" && "animate-spin"
                        )}
                      />
                      <CardTitle className="text-sm font-medium">
                        Enrichment Run
                      </CardTitle>
                      <Badge variant="outline" className="text-xs">
                        {job.mode ?? "mixed"}
                      </Badge>
                      {job.model && (
                        <Badge variant="secondary" className="text-xs">
                          {job.model}
                        </Badge>
                      )}
                    </div>
                    <Badge
                      variant={
                        job.status === "running" ? "default" : "outline"
                      }
                    >
                      {PIPELINE_RUN_STATUS_LABELS[job.status as PipelineRunStatus] ?? job.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Progress</span>
                      <p className="font-medium">
                        {job.completed_count} / {job.total_count}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Failed</span>
                      <p className="font-medium">{job.failed_count}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Elapsed</span>
                      <p className="font-medium">
                        {getElapsed(job.started_at, job.completed_at)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Started</span>
                      <p className="font-medium">{formatDate(job.started_at)}</p>
                    </div>
                  </div>
                  {job.total_count > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              job.failed_count > 0
                                ? "bg-amber-500"
                                : "bg-blue-500"
                            )}
                            style={{
                              width: `${getProgressPercent(job)}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {getProgressPercent(job)}%
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Completed / Failed Runs */}
      {completedJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Recent Runs
          </h3>
          {completedJobs.slice(0, 10).map((job) => {
            const StatusIcon = statusIconMap[job.status] ?? Activity;
            return (
              <Card key={job.id}>
                <CardHeader className="pb-2 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusIcon
                        className={cn("size-4", statusColorMap[job.status])}
                      />
                      <span className="text-sm font-medium">
                        Enrichment Run
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {job.mode ?? "mixed"}
                      </Badge>
                      {job.model && (
                        <Badge variant="secondary" className="text-xs">
                          {job.model}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {getElapsed(job.started_at, job.completed_at)}
                      </span>
                      <Badge
                        variant={
                          job.status === "completed" ? "default" : "destructive"
                        }
                        className="text-xs"
                      >
                        {PIPELINE_RUN_STATUS_LABELS[job.status as PipelineRunStatus] ?? job.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Completed</span>
                      <p className="font-medium">
                        {job.completed_count} / {job.total_count}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Failed</span>
                      <p className="font-medium">{job.failed_count}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Created</span>
                      <p className="font-medium">{formatDate(job.created_at)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Cost</span>
                      <p className="font-medium">
                        {job.cost_estimate ? `$${Number(job.cost_estimate).toFixed(4)}` : "--"}
                      </p>
                    </div>
                  </div>
                  {job.error_message && (
                    <p className="mt-2 text-sm text-red-500">{job.error_message}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {jobs.length === 0 && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          <Activity className="size-12 mx-auto mb-3 opacity-40" />
          <p>No enrichment runs yet</p>
          <p className="text-sm">Select products in URL Review and start enrichment to see runs here.</p>
        </div>
      )}

      {loading && jobs.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
