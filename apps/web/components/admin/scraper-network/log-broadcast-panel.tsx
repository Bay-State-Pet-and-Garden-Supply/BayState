/**
 * LogBroadcastPanel - Real-time log display from runner broadcasts
 *
 * Displays transient log events received via Supabase Broadcast API
 * from scraper runners during job execution.
 */

'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { ScrapeJobLog } from '@/lib/realtime/types';
import { useJobBroadcasts } from '@/lib/realtime';
import { Terminal, Filter, X, Search, Clock, AlertTriangle, Info, XCircle, Bug } from 'lucide-react';

const logLevelVariants = cva(
  'px-2 py-0.5 rounded text-xs font-medium uppercase',
  {
    variants: {
      level: {
        DEBUG: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
        INFO: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
        WARN: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
        ERROR: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
      },
    },
    defaultVariants: {
      level: 'INFO',
    },
  }
);

interface LogBroadcastPanelProps {
  /** Filter by specific job IDs */
  jobIds?: string[];
  /** Filter by runner IDs */
  runnerIds?: string[];
  /** Maximum logs to keep */
  maxLogs?: number;
  /** Show compact variant */
  compact?: boolean;
  /** Auto-scroll to new logs */
  autoScroll?: boolean;
  /** Click handler for log details */
  onLogClick?: (log: ScrapeJobLog) => void;
  /** Clear logs handler */
  onClear?: () => void;
}

interface LogItemProps {
  log: ScrapeJobLog;
  compact?: boolean;
  onClick?: () => void;
}

/**
 * Get icon for log level
 */
function getLevelIcon(level: ScrapeJobLog['level']) {
  switch (level) {
    case 'DEBUG':
      return <Bug className="h-3.5 w-3.5" />;
    case 'INFO':
      return <Info className="h-3.5 w-3.5" />;
    case 'WARN':
      return <AlertTriangle className="h-3.5 w-3.5" />;
    case 'ERROR':
      return <XCircle className="h-3.5 w-3.5" />;
    default:
      return <Info className="h-3.5 w-3.5" />;
  }
}

/**
 * Format timestamp
 */
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Log Item Component
 */
function LogItem({ log, compact = false, onClick }: LogItemProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-start gap-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors',
        compact && 'py-1'
      )}
    >
      {/* Timestamp */}
      <span className="flex-shrink-0 text-xs text-slate-400 font-mono">
        {formatTime(log.timestamp)}
      </span>

      {/* Level Badge */}
      <span className={cn(logLevelVariants({ level: log.level }))}>
        {getLevelIcon(log.level)}
      </span>

      {/* Job ID (if not filtering) */}
      {!compact && (
        <span className="flex-shrink-0 text-xs text-slate-400 font-mono">
          [{log.job_id.slice(0, 8)}]
        </span>
      )}

      {/* Runner ID */}
      {!compact && (
        <span className="flex-shrink-0 text-xs text-slate-400 font-mono">
          {log.runner_id.slice(0, 8)}
        </span>
      )}

      {/* Message */}
      <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 font-mono break-all">
        {log.message}
      </span>
    </div>
  );
}

/**
 * LogBroadcastPanel Component
 *
 * @example
 * ```tsx
 * <LogBroadcastPanel
 *   jobIds={['job-123']}
 *   onLogClick={(log) => setSelectedLog(log)}
 * />
 * ```
 */
export function LogBroadcastPanel({
  jobIds,
  runnerIds,
  maxLogs = 100,
  compact = false,
  autoScroll = true,
  onLogClick,
  onClear,
}: LogBroadcastPanelProps) {
  const {
    logs,
    isConnected,
    clearLogs,
  } = useJobBroadcasts({
    autoConnect: true,
    maxLogs,
  });

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (jobIds && jobIds.length > 0 && !jobIds.includes(log.job_id)) {
        return false;
      }
      if (runnerIds && runnerIds.length > 0 && !runnerIds.includes(log.runner_id)) {
        return false;
      }
      return true;
    });
  }, [logs, jobIds, runnerIds]);

  // Count by level
  const counts = useMemo(() => {
    return {
      total: filteredLogs.length,
      DEBUG: filteredLogs.filter((l) => l.level === 'DEBUG').length,
      INFO: filteredLogs.filter((l) => l.level === 'INFO').length,
      WARN: filteredLogs.filter((l) => l.level === 'WARN').length,
      ERROR: filteredLogs.filter((l) => l.level === 'ERROR').length,
    };
  }, [filteredLogs]);

  // Auto-scroll ref
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [filteredLogs, autoScroll]);

  // Clear handler
  const handleClear = useCallback(() => {
    clearLogs();
    onClear?.();
  }, [clearLogs, onClear]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-slate-500" />
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Live Logs</h3>
          <span className="text-xs text-slate-500">
            ({counts.total})
          </span>
        </div>

        {/* Level Filters */}
        <div className="flex items-center gap-2">
          {(['DEBUG', 'INFO', 'WARN', 'ERROR'] as const).map((level) => (
            <button
              key={level}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                logLevelVariants({ level }),
                'hover:opacity-80'
              )}
            >
              {level} {counts[level]}
            </button>
          ))}
        </div>
      </div>

      {/* Log Count */}
      <div className="flex items-center gap-4 py-2 text-xs">
        <span className="text-slate-500">
          {counts.total} log{counts.total !== 1 ? 's' : ''}
        </span>
        {counts.ERROR > 0 && (
          <span className="text-red-600 font-medium">
            {counts.ERROR} error{counts.ERROR !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Logs Container */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto font-mono text-sm space-y-0.5 pr-2"
        style={{ maxHeight: 'calc(100vh - 250px)' }}
      >
        {filteredLogs.length > 0 ? (
          filteredLogs.map((log) => (
            <LogItem
              key={log.id}
              log={log}
              compact={compact}
              onClick={() => onLogClick?.(log)}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Terminal className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
            <p className="text-slate-500">No logs yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Logs will appear when runners broadcast events
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              isConnected ? 'bg-emerald-500' : 'bg-amber-500'
            )}
          />
          <span className="text-xs text-slate-500">
            {isConnected ? 'Connected' : 'Connecting...'}
          </span>
        </div>

        <button
          onClick={handleClear}
          className="flex items-center gap-1 px-3 py-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      </div>
    </div>
  );
}
