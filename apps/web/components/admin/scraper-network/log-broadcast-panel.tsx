/**
 * LogBroadcastPanel - transient runner broadcast diagnostics
 */

'use client';

import { useMemo, useCallback, useRef, useEffect } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { useJobBroadcasts } from '@/lib/realtime';
import type { ScrapeJobLogEntry } from '@/lib/scraper-logs';
import { Terminal, X, AlertTriangle, Info, XCircle, Bug } from 'lucide-react';

const logLevelVariants = cva('rounded px-2 py-0.5 text-xs font-medium uppercase', {
  variants: {
    level: {
      debug: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
      info: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
      warning: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
      error: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
      critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    },
  },
  defaultVariants: {
    level: 'info',
  },
});

interface LogBroadcastPanelProps {
  jobIds?: string[];
  runnerIds?: string[];
  maxLogs?: number;
  compact?: boolean;
  autoScroll?: boolean;
  onLogClick?: (log: ScrapeJobLogEntry) => void;
  onClear?: () => void;
}

function getLevelIcon(level: ScrapeJobLogEntry['level']) {
  switch (level) {
    case 'debug':
      return <Bug className="h-3.5 w-3.5" />;
    case 'warning':
      return <AlertTriangle className="h-3.5 w-3.5" />;
    case 'error':
    case 'critical':
      return <XCircle className="h-3.5 w-3.5" />;
    default:
      return <Info className="h-3.5 w-3.5" />;
  }
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function LogItem({
  log,
  compact = false,
  onClick,
}: {
  log: ScrapeJobLogEntry;
  compact?: boolean;
  onClick?: () => void;
}) {
  const isClickable = typeof onClick === 'function';

  return (
    <div
      className={cn(
        'rounded py-1.5',
        compact && 'py-1',
      )}
    >
      {isClickable ? (
        <button
          type="button"
          onClick={onClick}
          className="flex w-full items-start gap-2 rounded text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          <span className="shrink-0 font-mono text-xs text-slate-400">{formatTime(log.timestamp)}</span>
          <span className={cn(logLevelVariants({ level: log.level }))}>{getLevelIcon(log.level)}</span>
          {!compact ? (
            <span className="shrink-0 font-mono text-xs text-slate-400">[{log.job_id.slice(0, 8)}]</span>
          ) : null}
          {!compact ? (
            <span className="shrink-0 font-mono text-xs text-slate-400">
              {(log.runner_name || log.runner_id || 'runner').slice(0, 8)}
            </span>
          ) : null}
          <span className="flex-1 break-all font-mono text-sm text-slate-700 dark:text-slate-300">
            {log.message}
          </span>
        </button>
      ) : (
        <div className="flex items-start gap-2">
          <span className="shrink-0 font-mono text-xs text-slate-400">{formatTime(log.timestamp)}</span>
          <span className={cn(logLevelVariants({ level: log.level }))}>{getLevelIcon(log.level)}</span>
          {!compact ? (
            <span className="shrink-0 font-mono text-xs text-slate-400">[{log.job_id.slice(0, 8)}]</span>
          ) : null}
          {!compact ? (
            <span className="shrink-0 font-mono text-xs text-slate-400">
              {(log.runner_name || log.runner_id || 'runner').slice(0, 8)}
            </span>
          ) : null}
          <span className="flex-1 break-all font-mono text-sm text-slate-700 dark:text-slate-300">
            {log.message}
          </span>
        </div>
      )}

      {(log.scraper_name || log.sku || log.phase) && !compact ? (
        <div className="ml-[7.5rem] mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
          {log.phase ? <span>{log.phase}</span> : null}
          {log.scraper_name ? <span className="font-mono">{log.scraper_name}</span> : null}
          {log.sku ? <span className="font-mono text-amber-500">{log.sku}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function LogBroadcastPanel({
  jobIds,
  runnerIds,
  maxLogs = 100,
  compact = false,
  autoScroll = true,
  onLogClick,
  onClear,
}: LogBroadcastPanelProps) {
  const { logs, isConnected, clearLogs } = useJobBroadcasts({
    autoConnect: true,
    maxLogs,
  });

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (jobIds?.length && !jobIds.includes(log.job_id)) {
        return false;
      }
      if (runnerIds?.length && log.runner_id && !runnerIds.includes(log.runner_id)) {
        return false;
      }
      return true;
    });
  }, [jobIds, logs, runnerIds]);

  const counts = useMemo(
    () => ({
      total: filteredLogs.length,
      debug: filteredLogs.filter((log) => log.level === 'debug').length,
      info: filteredLogs.filter((log) => log.level === 'info').length,
      warning: filteredLogs.filter((log) => log.level === 'warning').length,
      error: filteredLogs.filter((log) => ['error', 'critical'].includes(log.level)).length,
    }),
    [filteredLogs],
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current && filteredLogs.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [autoScroll, filteredLogs.length]);

  const handleClear = useCallback(() => {
    clearLogs();
    onClear?.();
  }, [clearLogs, onClear]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-slate-500" />
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Broadcast Diagnostics</h3>
          <span className="text-xs text-slate-500">({counts.total})</span>
        </div>

        <div className="flex items-center gap-2">
          {(['debug', 'info', 'warning', 'error'] as const).map((level) => (
            <button
              type="button"
              key={level}
              className={cn('rounded px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-80', logLevelVariants({ level }))}
            >
              {level.toUpperCase()} {counts[level]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 py-2 text-xs">
        <span className="text-slate-500">
          {counts.total} transient event{counts.total !== 1 ? 's' : ''}
        </span>
        {counts.error > 0 ? (
          <span className="font-medium text-red-600">
            {counts.error} error{counts.error !== 1 ? 's' : ''}
          </span>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-0.5 pr-2 font-mono text-sm"
        style={{ maxHeight: 'calc(100vh - 250px)' }}
      >
        {filteredLogs.length > 0 ? (
          filteredLogs.map((log) => (
            <LogItem key={log.id} log={log} compact={compact} onClick={() => onLogClick?.(log)} />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Terminal className="mb-4 h-12 w-12 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-500">No broadcast diagnostics yet</p>
            <p className="mt-1 text-xs text-slate-400">
              These events are transient and optional. Use persisted job logs for authoritative history.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <span className={cn('inline-block h-2 w-2 rounded-full', isConnected ? 'bg-emerald-500' : 'bg-amber-500')} />
          <span className="text-xs text-slate-500">{isConnected ? 'Broadcast Connected' : 'Broadcast Connecting...'}</span>
        </div>

        <button
          type="button"
          onClick={handleClear}
          className="flex items-center gap-1 px-3 py-1 text-xs text-slate-500 transition-colors hover:text-slate-700 dark:hover:text-slate-300"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      </div>
    </div>
  );
}
