"use client";

import { useEffect, useMemo, useCallback, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, Server } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/admin/api-client";
import { useJobSubscription } from "@/lib/realtime/useJobSubscription";
import { useRunnerPresence } from "@/lib/realtime/useRunnerPresence";
import { useAttemptsSubscription } from "@/lib/realtime/useAttemptsSubscription";

import { ExtractingSidebarList } from "./ExtractingSidebarList";
import { ExtractingDetailPane } from "./ExtractingDetailPane";
import { compareMonitoringJobs } from "./extracting-utils";

function ScraperClusterTelemetry({
  activeJobs,
  waitingJobs,
  jobsWithErrors,
  jobsConnected,
}: {
  activeJobs: number;
  waitingJobs: number;
  jobsWithErrors: number;
  jobsConnected: boolean;
}) {
  const { getOnlineCount, getBusyCount, isConnected } = useRunnerPresence();

  const onlineCount = getOnlineCount();
  const busyCount = getBusyCount();
  const idleCount = Math.max(0, onlineCount - busyCount);
  const realtimeHealthy = isConnected && jobsConnected;

  const metrics = [
    { label: "Online runners", value: onlineCount },
    { label: "Busy runners", value: busyCount },
    { label: "Idle runners", value: idleCount },
    { label: "Active jobs", value: activeJobs },
    { label: "Waiting jobs", value: waitingJobs },
    { label: "Jobs with errors", value: jobsWithErrors },
  ];

  return (
    <Card className="overflow-hidden border border-border/80 bg-card shadow-sm">
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="rounded-md border border-border/70 bg-muted/30 p-2">
                <Server className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-foreground">Extractor runners</h4>
                  <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        realtimeHealthy ? "bg-emerald-500" : "bg-amber-500",
                      )}
                    />
                    {realtimeHealthy ? "Realtime live" : "Feed degraded"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Queue health for extracting jobs and scraper capacity.
                </p>
              </div>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 xl:max-w-3xl">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-md border border-border/70 bg-muted/20 px-3 py-2"
              >
                <div className="text-[11px] font-medium text-muted-foreground">
                  {metric.label}
                </div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                  {metric.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ActiveEnrichmentsTab() {
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedJobId = searchParams.get("jobId") || null;

  const {
    jobs: realtimeJobs,
    counts,
    isConnected: isJobsConnected,
    error: jobsError,
    refetch: forceSyncJobs,
  } = useJobSubscription({
    maxJobsPerStatus: 50,
  });

  const {
    attempts: selectedJobAttempts,
    isConnected: isAttemptsConnected,
    error: attemptsError,
  } = useAttemptsSubscription({
    jobId: selectedJobId,
    autoConnect: Boolean(selectedJobId),
  });

  useEffect(() => {
    if (!searchParams.get("attemptId")) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("attemptId");
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [pathname, router, searchParams]);

  const handleCancelJob = async (jobId: string) => {
    if (!window.confirm("Are you sure you want to cancel this enrichment run?")) {
      return;
    }

    setCancellingJobId(jobId);
    try {
      const res = await adminFetch(`/api/admin/enrichment/jobs?id=${jobId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Enrichment run cancelled successfully");
        void forceSyncJobs();
      } else {
        toast.error(data.error || "Failed to cancel enrichment run");
      }
    } catch (err) {
      console.error("Error cancelling job:", err);
      toast.error("Failed to cancel enrichment run");
    } finally {
      setCancellingJobId(null);
    }
  };

  const allJobs = useMemo(() => {
    const combined = [
      ...realtimeJobs.running,
      ...realtimeJobs.queued,
      ...realtimeJobs.pending,
      ...realtimeJobs.completed_with_errors,
      ...realtimeJobs.failed,
      ...realtimeJobs.completed,
      ...realtimeJobs.cancelled,
    ];

    const seen = new Set<string>();
    return combined
      .filter((job) => {
        if (seen.has(job.id)) return false;
        seen.add(job.id);
        return true;
      })
      .sort(compareMonitoringJobs);
  }, [realtimeJobs]);

  const selectedJob = useMemo(
    () => allJobs.find((job) => job.id === selectedJobId) || null,
    [allJobs, selectedJobId],
  );

  const jobsWithErrorsCount = useMemo(
    () =>
      allJobs.filter(
        (job) =>
          job.status === "failed" ||
          job.status === "completed_with_errors" ||
          (job.failed_count ?? 0) > 0,
      ).length,
    [allJobs],
  );

  const handleSelectJob = useCallback(
    (jobId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("jobId", jobId);
      params.delete("attemptId");
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScraperClusterTelemetry
        activeJobs={counts.running}
        waitingJobs={counts.queued + counts.pending}
        jobsWithErrors={jobsWithErrorsCount}
        jobsConnected={isJobsConnected}
      />

      {jobsError && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-rose-500/25 bg-rose-500/[0.02] p-3 text-xs text-rose-500">
          <AlertCircle className="size-4 shrink-0" />
          <span>Realtime connection failure: {jobsError.message}. Retrying…</span>
        </div>
      )}

      <div className="mt-4 flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-background shadow-sm">
        <div className="w-[360px] min-w-[320px] max-w-[420px] border-r border-border">
          <ExtractingSidebarList
            jobs={allJobs}
            selectedJobId={selectedJobId}
            onSelectJob={handleSelectJob}
          />
        </div>
        <div className="min-w-0 flex-1">
          <ExtractingDetailPane
            job={selectedJob}
            attempts={selectedJobAttempts}
            attemptsConnected={isAttemptsConnected}
            attemptsError={attemptsError}
            onCancelJob={handleCancelJob}
            isCancelling={cancellingJobId === selectedJobId}
          />
        </div>
      </div>
    </div>
  );
}
