"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Activity,
  Server
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/admin/api-client";

import { useJobSubscription } from "@/lib/realtime/useJobSubscription";
import { useRunnerPresence } from "@/lib/realtime/useRunnerPresence";
import { useAttemptsSubscription } from "@/lib/realtime/useAttemptsSubscription";
import type { JobAssignment, EnrichmentAttempt } from "@/lib/realtime/types";

import { ExtractingSidebarList } from "./ExtractingSidebarList";
import { ExtractingDetailPane } from "./ExtractingDetailPane";

/**
 * Cluster Telemetry Panel
 */
function ScraperClusterTelemetry() {
  const { getOnlineCount, getBusyCount, isConnected } = useRunnerPresence();

  const onlineCount = getOnlineCount();
  const busyCount = getBusyCount();
  const idleCount = Math.max(0, onlineCount - busyCount);

  return (
    <Card className="border border-border/80 bg-card/65 backdrop-blur-md shadow-sm overflow-hidden">
      <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/5 border border-border/50 rounded-lg">
            <Server className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold uppercase tracking-wide text-foreground">Scraper Cluster</h4>
              <span className="inline-flex items-center gap-1 bg-white border border-border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter">
                <span className={cn("h-1.5 w-1.5 rounded-none", isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500")} />
                {isConnected ? "Realtime Link" : "Offline"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Observing background crawl4ai orchestration agents
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 md:gap-8 w-full md:w-auto border-t md:border-t-0 pt-3 md:pt-0 border-border/50">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground font-medium">Online Nodes</span>
            <span className="text-lg font-black text-foreground font-mono">{onlineCount}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground font-medium">Busy</span>
            <span className="text-lg font-black text-emerald-500 font-mono">{busyCount}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground font-medium">Idle Ready</span>
            <span className="text-lg font-black text-zinc-500 font-mono">{idleCount}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Invisible component to handle attempts subscription for a specific job
 */
function JobAttemptsSubscriber({ 
  jobId, 
  status,
  onAttemptsChange 
}: { 
  jobId: string; 
  status: string;
  onAttemptsChange: (jobId: string, attempts: EnrichmentAttempt[]) => void 
}) {
  const isActive = status === "running" || status === "claimed" || status === "queued" || status === "pending";
  const { attempts } = useAttemptsSubscription({ 
    jobId, 
    autoConnect: isActive 
  });
  
  useEffect(() => {
    onAttemptsChange(jobId, attempts);
  }, [jobId, attempts, onAttemptsChange]);

  return null;
}

/**
 * Main active enrichments view component
 */
export function ActiveEnrichmentsTab() {
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  
  // Selection state for master-detail view
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [attemptsMap, setAttemptsMap] = useState<Record<string, EnrichmentAttempt[]>>({});

  // Connect to Supabase Enrichment Jobs table real-time changes
  const {
    jobs: realtimeJobs,
    error: jobsError,
    refetch: forceSyncJobs
  } = useJobSubscription({
    maxJobsPerStatus: 50,
  });

  const handleCancelJob = async (jobId: string) => {
    if (!window.confirm("Are you sure you want to cancel this enrichment run?")) return;

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

  // Ensure stable combined active jobs for grouping
  const allJobs = useMemo(() => {
    const combined = [
      ...realtimeJobs.running,
      ...realtimeJobs.queued,
      ...realtimeJobs.pending,
      ...realtimeJobs.completed,
      ...realtimeJobs.completed_with_errors,
      ...realtimeJobs.failed,
      ...realtimeJobs.cancelled,
    ];
    // Filter out duplicates just in case
    const seen = new Set<string>();
    return combined.filter(job => {
      if (seen.has(job.id)) return false;
      seen.add(job.id);
      return true;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [realtimeJobs]);

  const handleSelectAttempt = useCallback((jobId: string, attemptId: string) => {
    setSelectedJobId(jobId);
    setSelectedAttemptId(attemptId);
  }, []);

  const handleAttemptsChange = useCallback((jobId: string, attempts: EnrichmentAttempt[]) => {
    setAttemptsMap(prev => {
      // Only update if actually different to avoid render loops
      if (prev[jobId] === attempts) return prev;
      return { ...prev, [jobId]: attempts };
    });
  }, []);

  const selectedJob = useMemo(() => 
    allJobs.find(j => j.id === selectedJobId) || null
  , [allJobs, selectedJobId]);

  const selectedAttempt = useMemo(() => {
    if (!selectedJobId || !selectedAttemptId) return null;
    return attemptsMap[selectedJobId]?.find(a => a.id === selectedAttemptId) || null;
  }, [attemptsMap, selectedJobId, selectedAttemptId]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Subscribers for active jobs */}
      {allJobs.map(job => (
        <JobAttemptsSubscriber 
          key={job.id} 
          jobId={job.id} 
          status={job.status}
          onAttemptsChange={handleAttemptsChange} 
        />
      ))}

      <ScraperClusterTelemetry />

      {jobsError && (
        <div className="rounded-none border border-rose-500/25 bg-rose-500/[0.02] p-3 text-rose-500 font-mono text-xs flex items-center gap-2 mt-4">
          <AlertCircle className="size-4 shrink-0" />
          <span>Realtime Connection Failure: {jobsError.message}. Retrying...</span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden border border-border mt-4 rounded-lg bg-background/50 shadow-inner">
        <div className="w-1/3 min-w-[320px] max-w-[450px]">
          <ExtractingSidebarList 
            jobs={allJobs}
            attempts={attemptsMap}
            selectedAttemptId={selectedAttemptId}
            onSelectAttempt={handleSelectAttempt}
          />
        </div>
        <div className="flex-1 min-w-0">
          <ExtractingDetailPane 
            job={selectedJob}
            attempt={selectedAttempt}
            onCancelJob={handleCancelJob}
            isCancelling={cancellingJobId === selectedJobId}
          />
        </div>
      </div>
    </div>
  );
}
