/**
 * JobHeatmap - Color-coded table showing job distribution across runners
 *
 * A simple table-based heatmap where rows represent runners,
 * columns represent jobs, and cells show status with color coding.
 */

'use client';

import { useMemo, useState, useCallback } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { RunnerPresence, JobAssignment } from '@/lib/realtime/types';
import {
  useRunnerPresence,
  useJobSubscription,
} from '@/lib/realtime';
import { Users, Layers, CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react';

const cellVariants = cva(
  'px-3 py-2 text-center text-sm font-medium rounded-md transition-all',
  {
    variants: {
      status: {
        none: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
        pending:
          'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        running:
          'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
        completed:
          'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
        failed:
          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        cancelled:
          'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
      },
    },
    defaultVariants: {
      status: 'none',
    },
  }
);

interface JobHeatmapProps {
  /** Maximum jobs to show per runner */
  maxJobsPerRunner?: number;
  /** Maximum runners to show */
  maxRunners?: number;
  /** Show job counts */
  showCounts?: boolean;
  /** Click handler for cell */
  onCellClick?: (job: JobAssignment, runner: RunnerPresence | null) => void;
}

interface RunnerJobCell {
  runner: RunnerPresence;
  jobs: JobAssignment[];
}

/**
 * Get status from job
 */
function getJobStatus(job: JobAssignment): JobAssignment['status'] {
  return job.status;
}

/**
 * JobHeatmap Component
 *
 * @example
 * ```tsx
 * <JobHeatmap
 *   maxJobsPerRunner={5}
 *   onCellClick={(job, runner) => setSelectedJob(job)}
 * />
 * ```
 */
export function JobHeatmap({
  maxJobsPerRunner = 5,
  maxRunners = 10,
  showCounts = true,
  onCellClick,
}: JobHeatmapProps) {
  const { runners: presenceRunners } = useRunnerPresence({ autoConnect: true });
  const { jobs, counts, isConnected } = useJobSubscription({ autoConnect: true });

  // Build runner-job mapping
  const runnerJobs = useMemo((): RunnerJobCell[] => {
    const runnerMap = new Map<string, RunnerJobCell>();

    // Initialize with all presence runners
    Object.values(presenceRunners).forEach((runner) => {
      runnerMap.set(runner.runner_id, { runner, jobs: [] });
    });

    // Add jobs to their assigned runners
    const allJobs = [
      ...jobs.pending,
      ...jobs.running,
      ...jobs.completed,
      ...jobs.failed,
      ...jobs.cancelled,
    ];

    allJobs.forEach((job) => {
      if (job.runner_id) {
        const existing = runnerMap.get(job.runner_id);
        if (existing) {
          existing.jobs.push(job);
        } else {
          // Runner not in presence (offline or never connected)
          runnerMap.set(job.runner_id, {
            runner: {
              runner_id: job.runner_id,
              runner_name: job.runner_id.slice(0, 8),
              status: 'offline',
              active_jobs: 0,
              last_seen: new Date().toISOString(),
            },
            jobs: [job],
          });
        }
      }
    });

    // Convert to array and sort by status (online > busy > idle > offline)
    const sorted = Array.from(runnerMap.values()).sort((a, b) => {
      const statusOrder = { online: 0, busy: 1, idle: 2, offline: 3 };
      return statusOrder[a.runner.status] - statusOrder[b.runner.status];
    });

    return sorted.slice(0, maxRunners);
  }, [presenceRunners, jobs]);

  // Get all unique jobs across runners
  const allJobIds = useMemo(() => {
    const ids = new Set<string>();
    runnerJobs.forEach((rj) => {
      rj.jobs.slice(0, maxJobsPerRunner).forEach((job) => ids.add(job.id));
    });
    return Array.from(ids);
  }, [runnerJobs, maxJobsPerRunner]);

  // Get job by ID
  const getJobById = useCallback(
    (runnerId: string, jobId: string): JobAssignment | null => {
      const runnerJob = runnerJobs.find((rj) => rj.runner.runner_id === runnerId);
      return runnerJob?.jobs.find((j) => j.id === jobId) || null;
    },
    [runnerJobs]
  );

  // Get cell status
  const getCellStatus = (runnerId: string, jobId: string): JobAssignment['status'] | 'none' => {
    const job = getJobById(runnerId, jobId);
    return job ? getJobStatus(job) : 'none';
  };

  // Summary counts
  const summary = useMemo(() => {
    let pending = 0,
      running = 0,
      completed = 0,
      failed = 0;

    runnerJobs.forEach((rj) => {
      rj.jobs.forEach((job) => {
        if (job.status === 'pending') pending++;
        else if (job.status === 'running') running++;
        else if (job.status === 'completed') completed++;
        else if (job.status === 'failed') failed++;
      });
    });

    return { pending, running, completed, failed };
  }, [runnerJobs]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-slate-500" />
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Job Distribution</h3>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            {summary.pending}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-violet-500" />
            {summary.running}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {summary.completed}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {summary.failed}
          </span>
        </div>
      </div>

      {/* Heatmap Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider pb-2 pl-2">
                Runner
              </th>
              {allJobIds.slice(0, maxJobsPerRunner).map((jobId, idx) => (
                <th
                  key={jobId}
                  className="text-center text-xs font-medium text-slate-500 uppercase tracking-wider pb-2"
                >
                  Job {idx + 1}
                </th>
              ))}
              {showCounts && (
                <th className="text-center text-xs font-medium text-slate-500 uppercase tracking-wider pb-2">
                  Total
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {runnerJobs.map((rj) => (
              <tr key={rj.runner.runner_id} className="border-b border-slate-100 dark:border-slate-800">
                {/* Runner Name */}
                <td className="py-2 pl-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-block w-2 h-2 rounded-full',
                        rj.runner.status === 'online' && 'bg-emerald-500',
                        rj.runner.status === 'busy' && 'bg-amber-500',
                        rj.runner.status === 'idle' && 'bg-blue-500',
                        rj.runner.status === 'offline' && 'bg-slate-400'
                      )}
                    />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate max-w-[120px]">
                      {rj.runner.runner_name}
                    </span>
                    <span className="text-xs text-slate-400">
                      ({rj.runner.active_jobs})
                    </span>
                  </div>
                </td>

                {/* Job Cells */}
                {allJobIds.slice(0, maxJobsPerRunner).map((jobId) => {
                  const status = getCellStatus(rj.runner.runner_id, jobId);
                  const job = getJobById(rj.runner.runner_id, jobId);
                  return (
                    <td key={jobId} className="py-2">
                      <button
                        onClick={() => job && onCellClick?.(job, rj.runner)}
                        disabled={status === 'none'}
                        className={cn(
                          cellVariants({ status }),
                          status !== 'none' && 'cursor-pointer hover:opacity-80'
                        )}
                      >
                        {status === 'none' && '-'}
                        {status === 'pending' && <Clock className="h-4 w-4 mx-auto" />}
                        {status === 'running' && (
                          <Clock className="h-4 w-4 mx-auto animate-spin" />
                        )}
                        {status === 'completed' && (
                          <CheckCircle2 className="h-4 w-4 mx-auto" />
                        )}
                        {status === 'failed' && <XCircle className="h-4 w-4 mx-auto" />}
                        {status === 'cancelled' && (
                          <AlertCircle className="h-4 w-4 mx-auto" />
                        )}
                      </button>
                    </td>
                  );
                })}

                {/* Count */}
                {showCounts && (
                  <td className="py-2 text-center">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {rj.jobs.length}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
        <span className="text-xs text-slate-500">
          {runnerJobs.length} runner{runnerJobs.length !== 1 ? 's' : ''} shown
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
