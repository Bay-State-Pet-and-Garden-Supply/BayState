/**
 * JobAssignmentFeed - Live feed of job assignments
 *
 * A scrollable, real-time feed showing job creation,
 * assignment, and status changes.
 */

'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { JobAssignment } from '@/lib/realtime/types';
import { useJobSubscription } from '@/lib/realtime';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  Loader2,
  ScrollText,
} from 'lucide-react';

const feedItemVariants = cva(
  'flex items-start gap-3 p-3 rounded-lg border transition-all',
  {
    variants: {
      status: {
        pending:
          'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800',
        running:
          'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
        completed:
          'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800',
        failed:
          'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
        cancelled:
          'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700',
      },
    },
    defaultVariants: {
      status: 'pending',
    },
  }
);

interface JobAssignmentFeedProps {
  /** Filter by specific status */
  statusFilter?: ('pending' | 'running' | 'completed' | 'failed' | 'cancelled')[];
  /** Filter by scraper names */
  scraperNames?: string[];
  /** Maximum items to show */
  maxItems?: number;
  /** Show compact variant */
  compact?: boolean;
  /** Click handler for job details */
  onJobClick?: (job: JobAssignment) => void;
  /** Show timestamp */
  showTimestamp?: boolean;
}

interface FeedItemProps {
  job: JobAssignment;
  compact?: boolean;
  showTimestamp?: boolean;
  onClick?: () => void;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Get status icon based on job status
 */
function getStatusIcon(status: JobAssignment['status']) {
  switch (status) {
    case 'pending':
      return <Clock className="h-4 w-4 text-amber-500" />;
    case 'running':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'cancelled':
      return <AlertCircle className="h-4 w-4 text-slate-500" />;
    default:
      return <Clock className="h-4 w-4 text-slate-400" />;
  }
}

/**
 * Feed Item Component
 */
function FeedItem({ job, compact = false, showTimestamp = true, onClick }: FeedItemProps) {
  const statusColor = {
    pending: 'text-amber-600 dark:text-amber-400',
    running: 'text-blue-600 dark:text-blue-400',
    completed: 'text-emerald-600 dark:text-emerald-400',
    failed: 'text-red-600 dark:text-red-400',
    cancelled: 'text-slate-500',
  };

  return (
    <div onClick={onClick} className={cn(feedItemVariants({ status: job.status }), 'cursor-pointer')}>
      <div className="flex-shrink-0 mt-0.5">{getStatusIcon(job.status)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-500 truncate">{job.job_id.slice(0, 8)}</span>
          <span className={cn('text-xs font-medium uppercase', statusColor[job.status])}>
            {job.status}
          </span>
        </div>
        {!compact && (
          <>
            <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
              {job.scrapers?.join(', ') || 'No scrapers'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {job.skus?.length || 0} SKU{job.skus?.length !== 1 ? 's' : ''}
            </p>
          </>
        )}
        {job.runner_id && (
          <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
            <ArrowRight className="h-3 w-3" />
            <span>{job.runner_id.slice(0, 8)}</span>
          </div>
        )}
      </div>
      {showTimestamp && (
        <div className="flex-shrink-0 text-xs text-slate-400">{formatTimestamp(job.created_at)}</div>
      )}
    </div>
  );
}

/**
 * JobAssignmentFeed Component
 *
 * @example
 * ```tsx
 * <JobAssignmentFeed
 *   statusFilter={['pending', 'running']}
 *   onJobClick={(job) => setSelectedJob(job)}
 * />
 * ```
 */
export function JobAssignmentFeed({
  statusFilter,
  scraperNames,
  maxItems = 50,
  compact = false,
  onJobClick,
  showTimestamp = true,
}: JobAssignmentFeedProps) {
  const {
    jobs,
    counts,
    isConnected,
    latestJob,
    refetch,
  } = useJobSubscription({
    autoConnect: true,
    scraperNames,
    onJobCreated: (job) => {
      console.log(`[JobAssignmentFeed] New job: ${job.id}`);
    },
    onJobUpdated: (job) => {
      console.log(`[JobAssignmentFeed] Job updated: ${job.id} -> ${job.status}`);
    },
  });

  // Combine all jobs and filter
  const allJobs = useMemo(() => {
    const combined: JobAssignment[] = [
      ...jobs.pending,
      ...jobs.running,
      ...jobs.completed,
      ...jobs.failed,
      ...jobs.cancelled,
    ];

    // Sort by created_at descending (newest first)
    combined.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Filter by status if specified
    if (statusFilter && statusFilter.length > 0) {
      return combined.filter((job) => statusFilter.includes(job.status));
    }

    return combined;
  }, [jobs, statusFilter]);

  // Limit items
  const displayJobs = useMemo(() => {
    return allJobs.slice(0, maxItems);
  }, [allJobs, maxItems]);

  // Auto-scroll to new items
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [displayJobs, autoScroll]);

  // Group jobs by status for summary
  const statusCounts = useMemo(() => {
    return {
      pending: jobs.pending.length,
      running: jobs.running.length,
      completed: jobs.completed.length,
      failed: jobs.failed.length,
      cancelled: jobs.cancelled.length,
      total: allJobs.length,
    };
  }, [jobs, allJobs.length]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-slate-500" />
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Job Feed</h3>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            {statusCounts.pending}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            {statusCounts.running}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {statusCounts.completed}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {statusCounts.failed}
          </span>
        </div>
      </div>

      {/* Auto-scroll toggle */}
      <div className="flex items-center gap-2 py-2">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-600"
          />
          Auto-scroll to new
        </label>
      </div>

      {/* Feed */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-2 pr-2"
        style={{ maxHeight: 'calc(100vh - 300px)' }}
      >
        {displayJobs.length > 0 ? (
          displayJobs.map((job) => (
            <FeedItem
              key={job.id}
              job={job}
              compact={compact}
              showTimestamp={showTimestamp}
              onClick={() => onJobClick?.(job)}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ScrollText className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
            <p className="text-slate-500">No jobs yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Jobs will appear here when created
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700">
        <span className="text-xs text-slate-500">
          Showing {displayJobs.length} of {allJobs.length}
        </span>
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
    </div>
  );
}
