"use client";

import { useEffect, useState } from "react";
import { Play, Square, Clock, Loader2 } from "lucide-react";
import { useScraperJobs } from "@/hooks/use-scraper-jobs";
import { ScrapeJob } from "@/types/scraper";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function formatDuration(startTime: string): string {
  const start = new Date(startTime);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function truncateJobId(id: string): string {
  if (id.length <= 8) return id;
  return `${id.slice(0, 8)}...`;
}

function formatStartTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface JobRowProps {
  job: ScrapeJob;
  onStop: (jobId: string) => void;
}

function JobRow({ job, onStop }: JobRowProps) {
  const [duration, setDuration] = useState(formatDuration(job.created_at));
  
  // Update duration every second
  useEffect(() => {
    const interval = setInterval(() => {
      setDuration(formatDuration(job.created_at));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [job.created_at]);
  
  // For now, show indeterminate progress since ScrapeJob doesn't have chunks info
  // If chunks_completed and total_chunks are added later, this can be updated
  const progressValue = undefined; // undefined = indeterminate
  
  return (
    <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
      {/* Job ID */}
      <div className="w-20 flex-shrink-0">
        <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
          {truncateJobId(job.id)}
        </code>
      </div>
      
      {/* Start Time */}
      <div className="w-24 flex-shrink-0">
        <span className="text-sm text-muted-foreground">
          {formatStartTime(job.created_at)}
        </span>
      </div>
      
      {/* Duration */}
      <div className="w-24 flex-shrink-0 flex items-center gap-1">
        <Clock className="h-3 w-3 text-muted-foreground" />
        <span className="text-sm font-medium">{duration}</span>
      </div>
      
      {/* Progress */}
      <div className="flex-1">
        {progressValue !== undefined ? (
          <Progress value={progressValue} className="h-2" />
        ) : (
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            <Progress value={100} className="h-2 animate-pulse" />
            <span className="text-xs text-muted-foreground">Processing...</span>
          </div>
        )}
      </div>
      
      {/* Status Badge */}
      <Badge variant="default" className="bg-green-500">
        <Play className="h-3 w-3 mr-1" />
        Running
      </Badge>
      
      {/* Stop Button */}
      <Button
        variant="destructive"
        size="sm"
        onClick={() => onStop(job.id)}
        className="flex-shrink-0"
      >
        <Square className="h-3 w-3 mr-1" />
        Stop
      </Button>
    </div>
  );
}

export function ActiveJobsStream() {
  const { jobs, isLoading, loadMore, hasMore } = useScraperJobs();
  
  // Filter for running jobs only
  const runningJobs = jobs.filter((job) => job.status === "running");
  
  const handleStopJob = (jobId: string) => {
    // Placeholder: call cancelJob action when implemented
    console.log(`Stop job requested: ${jobId}`);
    // TODO: Implement cancelJob action via Supabase RPC or API endpoint
  };
  
  // Handle loading state
  if (isLoading && jobs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Active Jobs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading jobs...
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            Active Jobs
            {runningJobs.length > 0 && (
              <Badge variant="secondary">{runningJobs.length}</Badge>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {runningJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Play className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No active jobs</p>
            <p className="text-xs">All scrapers are idle</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Header Row */}
            <div className="flex items-center gap-4 px-4 text-xs font-medium text-muted-foreground uppercase">
              <div className="w-20 flex-shrink-0">Job ID</div>
              <div className="w-24 flex-shrink-0">Started</div>
              <div className="w-24 flex-shrink-0">Duration</div>
              <div className="flex-1">Progress</div>
              <div className="w-20 flex-shrink-0"></div>
              <div className="w-16 flex-shrink-0"></div>
            </div>
            
            {/* Job Rows */}
            {runningJobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                onStop={handleStopJob}
              />
            ))}
            
            {/* Load More */}
            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                onClick={loadMore}
                className="w-full mt-4"
              >
                Load More
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
