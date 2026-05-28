"use client";
import { JobAssignment, EnrichmentAttempt } from "@/lib/realtime/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, AlertCircle, Clock, Activity } from "lucide-react";
import { useState } from "react";

interface ExtractingSidebarListProps {
  jobs: JobAssignment[];
  attempts: Record<string, EnrichmentAttempt[]>; // Map of jobId -> attempts
  selectedAttemptId: string | null;
  onSelectAttempt: (jobId: string, attemptId: string) => void;
}

export function ExtractingSidebarList({ 
  jobs, 
  attempts, 
  selectedAttemptId, 
  onSelectAttempt
}: ExtractingSidebarListProps) {
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set(jobs.filter(j => j.status === 'running').map(j => j.id)));

  const toggleJob = (jobId: string) => {
    const next = new Set(expandedJobs);
    if (next.has(jobId)) next.delete(jobId);
    else next.add(jobId);
    setExpandedJobs(next);
  };

  return (
    <ScrollArea className="h-full border-r border-border">
      <div className="p-3 space-y-4">
        {jobs.map(job => (
          <div key={job.id} className="space-y-1">
            <button 
              onClick={() => toggleJob(job.id)}
              className="w-full flex items-center justify-between p-2 hover:bg-accent/50 rounded-sm text-xs font-bold uppercase tracking-wider text-muted-foreground"
            >
              <div className="flex items-center gap-2">
                {expandedJobs.has(job.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <span>Run {job.id.slice(0, 8)}</span>
              </div>
              <span>{job.completed_count}/{job.total_count}</span>
            </button>
            
            {expandedJobs.has(job.id) && (
              <div className="pl-4 space-y-1">
                {attempts[job.id]?.length ? (
                  attempts[job.id].map(attempt => (
                    <button
                      key={attempt.id}
                      onClick={() => onSelectAttempt(job.id, attempt.id)}
                      className={cn(
                        "w-full text-left p-2 rounded-md transition-colors flex items-center justify-between gap-2",
                        selectedAttemptId === attempt.id ? "bg-primary/10 text-primary border border-primary/20" : "hover:bg-accent border border-transparent"
                      )}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-mono font-bold truncate">{attempt.upc}</span>
                        <span className="text-[10px] text-muted-foreground truncate">
                          {attempt.products_ingestion?.input?.name || "Unnamed Product"}
                        </span>
                      </div>
                      <div className="shrink-0">
                        {attempt.status === 'running' ? <Loader2 className="h-3 w-3 animate-spin text-emerald-500" /> :
                         attempt.status === 'success' ? <CheckCircle2 className="h-3 w-3 text-teal-500" /> :
                         attempt.status === 'failed' ? <AlertCircle className="h-3 w-3 text-rose-500" /> :
                         <Clock className="h-3 w-3 text-muted-foreground" />}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="p-3 text-[10px] text-muted-foreground italic flex items-center gap-2 border border-dashed border-border rounded-md bg-muted/20">
                    <Clock className="h-3 w-3" />
                    Waiting for scraper nodes to claim tasks...
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {jobs.length === 0 && (
          <div className="h-40 flex flex-col items-center justify-center text-center p-4">
            <Activity className="h-8 w-8 text-muted-foreground/20 mb-2" />
            <p className="text-xs text-muted-foreground">No active enrichment runs</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
