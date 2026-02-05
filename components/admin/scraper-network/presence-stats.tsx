/**
 * PresenceStats - Summary statistics for runner presence
 *
 * Displays aggregate counts and statuses of all runners
 * in a row of metric cards.
 */

'use client';

import { useMemo } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { RunnerPresence } from '@/lib/realtime/types';
import { useRunnerPresence } from '@/lib/realtime';
import { Users, Zap, Coffee, Power, Activity } from 'lucide-react';

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

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  description?: string;
  variant?: 'default' | 'accent';
  trend?: {
    direction: 'up' | 'down' | 'stable';
    value: string;
  };
}

function StatCard({ title, value, icon, description, variant = 'default', trend }: StatCardProps) {
  return (
    <div className={cn(statCardVariants({ variant }))}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
            {value}
          </p>
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
          {description && (
            <p className="text-xs text-slate-400">{description}</p>
          )}
        </div>
      )}
    </div>
  );
}

interface PresenceStatsProps {
  /** Initial runners to include in counts */
  initialRunners?: RunnerPresence[];
  /** Show detailed breakdown */
  detailed?: boolean;
  /** Click handler for viewing all runners */
  onViewAll?: () => void;
}

/**
 * Calculate runner statistics from presence data
 */
function calculateStats(runners: RunnerPresence[]) {
  const total = runners.length;
  const online = runners.filter((r) => r.status === 'online').length;
  const busy = runners.filter((r) => r.status === 'busy').length;
  const idle = runners.filter((r) => r.status === 'idle').length;
  const offline = runners.filter((r) => r.status === 'offline').length;

  const totalActive = runners.reduce((sum, r) => sum + r.active_jobs, 0);
  const avgActivePerBusy =
    busy > 0 ? Math.round((totalActive / busy) * 10) / 10 : 0;

  return {
    total,
    online,
    busy,
    idle,
    offline,
    totalActive,
    avgActivePerBusy,
    utilizationPercent: total > 0 ? Math.round(((online + busy) / total) * 100) : 0,
  };
}

/**
 * PresenceStats Component
 *
 * @example
 * ```tsx
 * <PresenceStats
 *   detailed={true}
 *   onViewAll={() => setShowAll(true)}
 * />
 * ```
 */
export function PresenceStats({
  initialRunners = [],
  detailed = false,
  onViewAll,
}: PresenceStatsProps) {
  const {
    runners,
    isConnected,
    getOnlineCount,
    getBusyCount,
  } = useRunnerPresence({
    autoConnect: true,
  });

  // Merge initial runners with realtime runners
  const allRunners = useMemo(() => {
    const runnerMap = new Map<string, RunnerPresence>();
    initialRunners.forEach((r) => runnerMap.set(r.runner_id, r));
    Object.values(runners).forEach((r) => runnerMap.set(r.runner_id, r));
    return Array.from(runnerMap.values());
  }, [initialRunners, runners]);

  const stats = useMemo(() => calculateStats(allRunners), [allRunners]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Runner Status
        </h2>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              isConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
            )}
          />
          <span className="text-sm text-slate-500">
            {isConnected ? 'Live' : 'Connecting'}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div
        className={cn(
          'grid gap-3',
          detailed
            ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'
            : 'grid-cols-2 md:grid-cols-4'
        )}
      >
        {/* Total Runners */}
        <StatCard
          title="Total"
          value={stats.total}
          icon={<Users className="h-5 w-5" />}
          description="all runners"
          variant="accent"
        />

        {/* Online */}
        <StatCard
          title="Online"
          value={stats.online}
          icon={<Power className="h-5 w-5" />}
          description={`${stats.utilizationPercent}% utilization`}
          trend={
            stats.online > 0
              ? { direction: 'up', value: `${stats.online} active` }
              : undefined
          }
        />

        {/* Busy (Processing) */}
        <StatCard
          title="Busy"
          value={stats.busy}
          icon={<Zap className="h-5 w-5" />}
          description={`${stats.totalActive} total jobs`}
          variant="accent"
        />

        {/* Idle */}
        <StatCard
          title="Idle"
          value={stats.idle}
          icon={<Coffee className="h-5 w-5" />}
          description="waiting for work"
        />

        {/* Offline (only in detailed view) */}
        {detailed && (
          <StatCard
            title="Offline"
            value={stats.offline}
            icon={<Activity className="h-5 w-5" />}
            description="disconnected"
          />
        )}

        {/* Average Load (only in detailed view) */}
        {detailed && (
          <StatCard
            title="Avg Load"
            value={stats.avgActivePerBusy}
            icon={<Zap className="h-5 w-5" />}
            description="jobs per busy runner"
            variant="accent"
          />
        )}
      </div>

      {/* View All Link */}
      {onViewAll && (
        <button
          onClick={onViewAll}
          className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        >
          View All Runners →
        </button>
      )}
    </div>
  );
}
