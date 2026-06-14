"use client";

import { useEffect, useMemo, useCallback, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { adminFetch } from "@/lib/admin/api-client";
import { useJobSubscription } from "@/lib/realtime/useJobSubscription";
import { useAttemptsSubscription } from "@/lib/realtime/useAttemptsSubscription";

import { ExtractingSidebarList } from "./ExtractingSidebarList";
import { ExtractingDetailPane } from "./ExtractingDetailPane";
import { compareMonitoringJobs } from "./extracting-utils";

export function ActiveEnrichmentsTab() {
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedJobId = searchParams.get("jobId") || null;

  const {
    jobs: realtimeJobs,
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

  const resolveJob = async ({
    jobId,
    confirmMessage,
    successMessage,
    errorMessage,
  }: {
    jobId: string;
    confirmMessage: string;
    successMessage: string;
    errorMessage: string;
  }) => {
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setCancellingJobId(jobId);
    try {
      const res = await adminFetch(`/api/admin/enrichment/jobs?id=${jobId}`, {
        method: "DELETE",
      });
      if (res.status === 404) {
        toast.info("The enrichment pipeline has been removed. This job is no longer active.");
        void forceSyncJobs();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(successMessage);
        void forceSyncJobs();
      } else {
        toast.error(data.error || errorMessage);
      }
    } catch (err) {
      console.error("Error resolving enrichment job:", err);
      toast.error(errorMessage);
    } finally {
      setCancellingJobId(null);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    await resolveJob({
      jobId,
      confirmMessage: "Are you sure you want to cancel this enrichment run?",
      successMessage: "Enrichment run cancelled successfully",
      errorMessage: "Failed to cancel enrichment run",
    });
  };

  const handleRecoverJob = async (jobId: string) => {
    await resolveJob({
      jobId,
      confirmMessage:
        "Recover this stalled extraction job? Remaining attempts will be cancelled and stranded products will be returned to Imported when possible.",
      successMessage: "Stalled extraction job recovered",
      errorMessage: "Failed to recover stalled extraction job",
    });
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
            onRecoverJob={handleRecoverJob}
            isCancelling={cancellingJobId === selectedJobId}
          />
        </div>
      </div>
    </div>
  );
}
