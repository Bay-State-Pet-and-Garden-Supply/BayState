/**
 * JobProgressIndicator - Real-time job progress display
 *
 * Shows progress bars for running jobs based on durable
 * progress fields stored on scrape_jobs.
 */

'use client';

import { useMemo, useState, useCallback } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { JobAssignment } from '@/lib/realtime/types';
import { useJobSubscription } from '@/lib/realtime';
import { progressUpdateFromJobRecord, type ScrapeJobProgressUpdate } from '@/lib/scraper-logs';
import { Progress } from '@/components/ui/progress';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';

const statusVariants = cva('flex items-center gap-1.5', {
  variants: {
    status: {
      pending: 'text-amber-600 dark:text-amber-400',
      claimed: 'text-sky-600 dark:text-sky-400',
      running: 'text-blue-600 dark:text-blue-400',
      completed: 'text-emerald-600 dark:text-emerald-400',
      failed: 'text-red-600 dark:text-red-400',
      cancelled: 'text-slate-500',
    },
  },
  defaultVariants: {
    status: 'pending',
  },
});

interface JobProgressItemProps {
  job: JobAssignment;
  progress: ScrapeJobProgressUpdate | null | undefined;
  showProgress?: boolean;
  showDetails?: boolean;
  showElapsed?: boolean;
  onClick?: () => void;
}

/**
 * Calculate elapsed time
 */
function formatElapsed(startIso: string, endIso?: string): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const elapsedSec = Math.floor((end - start) / 1000);

  if (elapsedSec < 60) return `${elapsedSec}s`;
  if (elapsedSec < 3600) return `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`;
  return `${Math.floor(elapsedSec / 3600)}h ${Math.floor((elapsedSec % 3600) / 60)}m`;
}

/**
 * Get status icon
 */
function getStatusIcon(status: JobAssignment['status']) {
  switch (status) {
    case 'pending':
      return <Clock className="h-4 w-4" />;
    case 'claimed':
      return <Zap className="h-4 w-4 text-sky-500" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin" />;
    case 'completed':
      return <CheckCircle2 className="h-4 w-4" />;
    case 'failed':
      return <XCircle className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
}

/**
 * JobProgressItem Component
 */
function JobProgressItem({
  job,
  progress,
  showProgress = true,
  showDetails = true,
  showElapsed = true,
  onClick,
}: JobProgressItemProps) {
  const [expanded, setExpanded] = useState(false);
  const isClickable = typeof onClick === 'function';

  const elapsed = useMemo(() => {
    return formatElapsed(job.created_at);
  }, [job.created_at]);

  return (
    <div
      className={cn(
        'p-4 rounded-xl border border-slate-200 dark:border-slate-700',
        isClickable ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors' : undefined,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        {isClickable ? (
          <button
            type="button"
            onClick={onClick}
            className="flex items-center gap-3 rounded text-left"
          >
            <div className={cn(statusVariants({ status: job.status }))}>
              {getStatusIcon(job.status)}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {job.scrapers?.join(', ') || 'Unknown Scraper'}
              </p>
              <p className="text-xs text-slate-500 font-mono">{(job.job_id || job.id).slice(0, 8)}</p>
            </div>
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <div className={cn(statusVariants({ status: job.status }))}>
              {getStatusIcon(job.status)}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {job.scrapers?.join(', ') || 'Unknown Scraper'}
              </p>
              <p className="text-xs text-slate-500 font-mono">{(job.job_id || job.id).slice(0, 8)}</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          {showElapsed && job.status === 'running' && (
            <span className="text-xs text-slate-500">{elapsed}</span>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {/* Progress Bar (for running jobs) */}
      {showProgress && job.status === 'running' && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-500">Progress</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {progress?.progress ?? 0}%
            </span>
          </div>
          <Progress value={progress?.progress ?? 0} className="h-2" />
          {progress?.message ? (
            <p className="mt-2 text-xs text-slate-500">
              {progress.message}
            </p>
          ) : null}
        </div>
      )}

      {/* Details */}
      {expanded && showDetails && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">SKUs</span>
            <span className="text-slate-700 dark:text-slate-300">
              {job.skus?.length || 0}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Started</span>
            <span className="text-slate-700 dark:text-slate-300">
              {new Date(job.created_at).toLocaleString()}
            </span>
          </div>
          {job.runner_id && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Runner</span>
              <span className="text-slate-700 dark:text-slate-300 font-mono">
                {job.runner_id.slice(0, 8)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface JobProgressIndicatorProps {
  /** Filter by specific jobs */
  jobIds?: string[];
  /** Show progress bars */
  showProgress?: boolean;
  /** Show elapsed time */
  showElapsed?: boolean;
  /** Maximum running jobs to show */
  maxItems?: number;
  /** Click handler for job details */
  onJobClick?: (job: JobAssignment) => void;
}

/**
 * JobProgressIndicator Component
 *
 * @example
 * ```tsx
 * <JobProgressIndicator
 *   showProgress={true}
 *   onJobClick={(job) => setSelectedJob(job)}
 * />
 * ```
 */
export function JobProgressIndicator({
  jobIds,
  showProgress = true,
  showElapsed = true,
  maxItems = 10,
  onJobClick,
}: JobProgressIndicatorProps) {
  const { jobs, isConnected } = useJobSubscription({
    autoConnect: true,
    jobIds,
  });

  // Get running jobs
  const runningJobs = useMemo(() => {
    return jobs.running.filter((job) => {
      if (jobIds && jobIds.length > 0 && !jobIds.includes(job.id)) {
        return false;
      }
      return true;
    });
  }, [jobs.running, jobIds]);

  // Get progress for each job
  const getProgressForJob = useCallback(
    (job: JobAssignment): ScrapeJobProgressUpdate | null => {
      return progressUpdateFromJobRecord(job);
    },
    []
  );

  // Sort by newest first
  const sortedJobs = useMemo(() => {
    return [...runningJobs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [runningJobs]);

  // Limit items
  const displayJobs = sortedJobs.slice(0, maxItems);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">
            Running Jobs
          </h3>
          <span className="text-xs text-slate-500">
            ({displayJobs.length} of {runningJobs.length})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              isConnected ? 'bg-emerald-500' : 'bg-amber-500'
            )}
          />
          <span className="text-xs text-slate-500">
            {isConnected ? 'Live' : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* Job List */}
      {displayJobs.length > 0 ? (
        <div className="space-y-3">
          {displayJobs.map((job) => (
            <JobProgressItem
              key={job.id}
              job={job}
              progress={getProgressForJob(job)}
              showProgress={showProgress}
              showElapsed={showElapsed}
              onClick={() => onJobClick?.(job)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Zap className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
          <p className="text-slate-500">No jobs running</p>
          <p className="text-xs text-slate-400 mt-1">
            Jobs will appear here when started
          </p>
        </div>
      )}
    </div>
  );
}
