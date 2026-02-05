/**
 * DistributionStats - Summary statistics for job distribution
 *
 * Displays aggregate counts and status breakdown
 * for scrape jobs across all runners.
 */

'use client';

import { useMemo } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { JobAssignment } from '@/lib/realtime/types';
import { useJobSubscription } from '@/lib/realtime';
import {
  Layers,
  Clock,
  Zap,
  CheckCircle2,
  XCircle,
  AlertCircle,
  TrendingUp,
  Target,
} from 'lucide-react';

const statCardVariants = cva(
  'flex flex-col p-4 rounded-xl border transition-all',
  {
    variants: {
      variant: {
        default:
          'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700',
        accent:
          'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

interface DistributionStatsProps {
  /** Filter by scraper names */
  scraperNames?: string[];
  /** Show detailed metrics */
  detailed?: boolean;
  /** Click handler for viewing all jobs */
  onViewAll?: () => void;
}

function StatCard({
  title,
  value,
  icon,
  description,
  variant = 'default',
  trend,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  description?: string;
  variant?: 'default' | 'accent';
  trend?: {
    direction: 'up' | 'down' | 'stable';
    value: string;
  };
}) {
  return (
    <div className={cn(statCardVariants({ variant }))}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{value}</p>
        </div>
        <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
          {icon}
        </div>
      </div>
      {(description || trend) && (
        <div className="mt-2 flex items-center gap-2">
          {trend && (
            <span
              className={cn(
                'text-xs font-medium',
                trend.direction === 'up' && 'text-emerald-600',
                trend.direction === 'down' && 'text-red-600',
                trend.direction === 'stable' && 'text-slate-500'
              )}
            >
              {trend.direction === 'up' && '↑'}
              {trend.direction === 'down' && '↓'}
              {trend.value}
            </span>
          )}
          {description && <p className="text-xs text-slate-400">{description}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Calculate job distribution statistics
 */
function calculateDistribution(jobs: JobAssignment[]) {
  const total = jobs.length;
  const pending = jobs.filter((j) => j.status === 'pending').length;
  const running = jobs.filter((j) => j.status === 'running').length;
  const completed = jobs.filter((j) => j.status === 'completed').length;
  const failed = jobs.filter((j) => j.status === 'failed').length;
  const cancelled = jobs.filter((j) => j.status === 'cancelled').length;

  const totalSkus = jobs.reduce((sum, j) => sum + (j.skus?.length || 0), 0);
  const avgSkusPerJob = total > 0 ? Math.round((totalSkus / total) * 10) / 10 : 0;

  const uniqueRunners = new Set(jobs.filter((j) => j.runner_id).map((j) => j.runner_id)).size;

  const successRate =
    completed + failed + cancelled > 0
      ? Math.round((completed / (completed + failed + cancelled)) * 100)
      : 0;

  return {
    total,
    pending,
    running,
    completed,
    failed,
    cancelled,
    totalSkus,
    avgSkusPerJob,
    uniqueRunners,
    successRate,
  };
}

/**
 * DistributionStats Component
 *
 * @example
 * ```tsx
 * <DistributionStats
 *   detailed={true}
 *   onViewAll={() => setShowAll(true)}
 * />
 * ```
 */
export function DistributionStats({
  scraperNames,
  detailed = false,
  onViewAll,
}: DistributionStatsProps) {
  const { jobs, counts, isConnected, latestJob } = useJobSubscription({
    autoConnect: true,
    scraperNames,
  });

  // Combine all jobs
  const allJobs = useMemo(() => {
    return [
      ...jobs.pending,
      ...jobs.running,
      ...jobs.completed,
      ...jobs.failed,
      ...jobs.cancelled,
    ];
  }, [jobs]);

  const stats = useMemo(() => calculateDistribution(allJobs), [allJobs]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Job Distribution
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              isConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
            )}
          />
          <span className="text-sm text-slate-500">{isConnected ? 'Live' : 'Connecting'}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div
        className={cn(
          'grid gap-3',
          detailed
            ? 'grid-cols-2 md:grid-cols-4 lg:grid-cols-7'
            : 'grid-cols-2 md:grid-cols-4'
        )}
      >
        {/* Total Jobs */}
        <StatCard
          title="Total Jobs"
          value={stats.total}
          icon={<Layers className="h-5 w-5" />}
          description={`${stats.totalSkus} total SKUs`}
          variant="accent"
        />

        {/* Pending */}
        <StatCard
          title="Pending"
          value={stats.pending}
          icon={<Clock className="h-5 w-5" />}
          description="waiting for runners"
          trend={stats.pending > 0 ? { direction: 'up', value: `${stats.pending} pending` } : undefined}
        />

        {/* Running */}
        <StatCard
          title="Running"
          value={stats.running}
          icon={<Zap className="h-5 w-5" />}
          description={`${stats.uniqueRunners} active runners`}
          variant="accent"
        />

        {/* Completed */}
        <StatCard
          title="Completed"
          value={stats.completed}
          icon={<CheckCircle2 className="h-5 w-5" />}
          trend={
            stats.completed > 0
              ? { direction: 'up', value: `${stats.successRate}% success` }
              : undefined
          }
        />

        {/* Failed */}
        <StatCard
          title="Failed"
          value={stats.failed}
          icon={<XCircle className="h-5 w-5" />}
          variant="accent"
        />

        {/* Cancelled (only detailed) */}
        {detailed && (
          <StatCard
            title="Cancelled"
            value={stats.cancelled}
            icon={<AlertCircle className="h-5 w-5" />}
          />
        )}

        {/* Avg SKUs per Job (only detailed) */}
        {detailed && (
          <StatCard
            title="Avg SKUs/Job"
            value={stats.avgSkusPerJob}
            icon={<TrendingUp className="h-5 w-5" />}
            description="per job"
          />
        )}
      </div>

      {/* View All Link */}
      {onViewAll && (
        <button
          onClick={onViewAll}
          className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        >
          View All Jobs →
        </button>
      )}
    </div>
  );
}
