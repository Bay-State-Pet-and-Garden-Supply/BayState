"use client";
import { JobAssignment, EnrichmentAttempt } from "@/lib/realtime/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EnrichmentAttemptCard, EnrichmentJobLogsConsole } from "./ActiveEnrichmentsTab";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Activity, Loader2 } from "lucide-react";

interface ExtractingDetailPaneProps {
  job: JobAssignment | null;
  attempt: EnrichmentAttempt | null;
  onCancelJob: (jobId: string) => void;
  isCancelling: boolean;
}

export function ExtractingDetailPane({ job, attempt, onCancelJob, isCancelling }: ExtractingDetailPaneProps) {
  if (!job || !attempt) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-12 text-center">
        <Activity className="h-12 w-12 mb-4 opacity-20" />
        <h3 className="font-bold text-lg">Select a UPC to view details</h3>
        <p className="text-sm max-w-xs mx-auto mt-2">Choose an active extraction item from the left list to monitor its live telemetry and console output.</p>
      </div>
    );
  }

  const progressPercent = job.total_count ? Math.round(((job.completed_count ?? 0) / job.total_count) * 100) : 0;

  return (
    <ScrollArea className="h-full bg-zinc-50/50 dark:bg-zinc-950/20">
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Job Context Header */}
        <div className="bg-card border border-border/80 p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Job Runner {job.id.slice(0, 8)}</span>
              <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider">{job.status}</Badge>
            </div>
            {(job.status === 'running' || job.status === 'claimed' || job.status === 'queued') && (
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={() => onCancelJob(job.id)}
                disabled={isCancelling}
                className="h-7 text-[10px] font-bold gap-2"
              >
                {isCancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                CANCEL JOB
              </Button>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
              <span>OVERALL PROGRESS</span>
              <span>{progressPercent}% ({job.completed_count}/{job.total_count})</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        </div>

        {/* Selected Attempt Details */}
        <div className="grid grid-cols-1 gap-6">
           <EnrichmentAttemptCard attempt={attempt} />
           <div className="border border-border/80 rounded-lg overflow-hidden">
             <EnrichmentJobLogsConsole jobId={job.id} />
           </div>
        </div>
      </div>
    </ScrollArea>
  );
}
