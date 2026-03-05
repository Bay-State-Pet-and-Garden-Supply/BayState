/**
 * RunnerPresenceCard - Individual runner presence status card
 *
 * Displays a single runner's online status, current workload,
 * and metadata in a compact card format.
 */

'use client';

import { useMemo } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { RunnerPresence } from '@/lib/realtime/types';
import { Activity, Clock, Server, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

const statusVariants = cva(
  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
  {
    variants: {
      status: {
        online: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
        busy: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        idle: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        offline: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
      },
    },
    defaultVariants: {
      status: 'offline',
    },
  }
);

interface RunnerPresenceCardProps {
  /** Runner presence data to display */
  runner: RunnerPresence;
  /** Optional click handler for details */
  onClick?: (runner: RunnerPresence) => void;
  /** Show detailed information */
  showDetails?: boolean;
  /** Highlight if runner is newly online */
  isNew?: boolean;
  /** Compact variant for use in grids */
  compact?: boolean;
}

/**
 * Format relative time from ISO timestamp
 */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return date.toLocaleDateString();
}

/**
 * Get status icon based on runner status
 */
function getStatusIcon(status: RunnerPresence['status']) {
  switch (status) {
    case 'online':
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    case 'busy':
      return <Activity className="h-3.5 w-3.5" />;
    case 'idle':
      return <Clock className="h-3.5 w-3.5" />;
    case 'offline':
      return <XCircle className="h-3.5 w-3.5" />;
    default:
      return <AlertCircle className="h-3.5 w-3.5" />;
  }
}

/**
 * RunnerPresenceCard Component
 *
 * @example
 * ```tsx
 * <RunnerPresenceCard
 *   runner={presence}
 *   onClick={(r) => setSelectedRunner(r)}
 *   showDetails={true}
 * />
 * ```
 */
export function RunnerPresenceCard({
  runner,
  onClick,
  showDetails = true,
  isNew = false,
  compact = false,
}: RunnerPresenceCardProps) {
  const statusLabel = useMemo(() => {
    return runner.status.charAt(0).toUpperCase() + runner.status.slice(1);
  }, [runner.status]);

  const formattedLastSeen = useMemo(() => {
    return formatRelativeTime(runner.last_seen);
  }, [runner.last_seen]);

  const handleClick = () => {
    onClick?.(runner);
  };

  if (compact) {
    return (
      <div
        onClick={handleClick}
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700',
          'hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors',
          isNew && 'ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-900'
        )}
      >
        <div className="flex-shrink-0">
          <Server className="h-5 w-5 text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
            {runner.runner_name}
          </p>
          <p className="text-xs text-slate-500">
            {runner.active_jobs} active job{runner.active_jobs !== 1 ? 's' : ''}
          </p>
        </div>
        <div className={cn(statusVariants({ status: runner.status }))}>
          {getStatusIcon(runner.status)}
          <span>{statusLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'flex flex-col p-4 rounded-xl border border-slate-200 dark:border-slate-700',
        'hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors',
        isNew && 'ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-900'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
            <Server className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {runner.runner_name}
            </h3>
            <p className="text-xs text-slate-500 font-mono">{runner.runner_id}</p>
          </div>
        </div>
        <div className={cn(statusVariants({ status: runner.status }))}>
          {getStatusIcon(runner.status)}
          <span>{statusLabel}</span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
          <Activity className="h-4 w-4" />
          <span>{runner.active_jobs} active</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500">
          <Clock className="h-4 w-4" />
          <span>{formattedLastSeen}</span>
        </div>
      </div>

      {/* Metadata (optional) */}
      {showDetails && runner.metadata && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs text-slate-400">
            {Object.entries(runner.metadata)
              .slice(0, 3)
              .map(([key, value]) => `${key}: ${value}`)
              .join(' • ')}
          </p>
        </div>
      )}
    </div>
  );
}
