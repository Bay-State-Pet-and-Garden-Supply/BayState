'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  Terminal,
  ChevronDown,
  ChevronUp,
  Info,
  AlertTriangle,
  AlertCircle,
  Search,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useJobSubscription } from '@/lib/realtime/useJobSubscription';
import { useLogSubscription } from '@/lib/realtime/useLogSubscription';
import {
  mergeScrapeJobLogs,
  progressUpdateFromJobRecord,
  type ScrapeJobProgressUpdate,
} from '@/lib/scraper-logs';
import type { ScrapeJobLog } from '@/app/admin/scrapers/runs/actions';

interface LogViewerProps {
  jobId: string;
  logs: ScrapeJobLog[];
  initialProgress?: ScrapeJobProgressUpdate | null;
  className?: string;
}

const logLevelConfig = {
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', label: 'INFO' },
  warning: { icon: AlertTriangle, color: 'text-yellow-700', bg: 'bg-yellow-50', label: 'WARN' },
  error: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'ERROR' },
  debug: { icon: Terminal, color: 'text-muted-foreground', bg: 'bg-muted', label: 'DEBUG' },
  critical: { icon: AlertCircle, color: 'text-red-700', bg: 'bg-red-100', label: 'CRITICAL' },
} as const;

type LogLevel = keyof typeof logLevelConfig;

function getLogLevel(level: string): LogLevel {
  return (level.toLowerCase() in logLevelConfig
    ? level.toLowerCase()
    : 'info') as LogLevel;
}

function formatProgressLabel(progress: ScrapeJobProgressUpdate | null | undefined): string {
  if (!progress) {
    return 'Waiting for live progress...';
  }

  const segments = [progress.status];
  if (progress.phase) {
    segments.push(progress.phase);
  }
  if (progress.current_sku) {
    segments.push(progress.current_sku);
  }
  if (typeof progress.items_processed === 'number' && typeof progress.items_total === 'number') {
    segments.push(`${progress.items_processed}/${progress.items_total}`);
  }
  return segments.join(' • ');
}

function LogEntry({ log }: { log: ScrapeJobLog }) {
  const level = getLogLevel(log.level);
  const config = logLevelConfig[level];
  const Icon = config.icon;

  return (
    <div className="flex gap-3 rounded px-2 py-2 hover:bg-slate-800/60">
      <div className="w-20 shrink-0">
        <span className={`text-xs font-mono ${config.color}`}>
          {format(new Date(log.timestamp), 'HH:mm:ss')}
        </span>
      </div>

      <div className="w-16 shrink-0">
        <Badge variant="outline" className={`border-0 text-xs ${config.bg} ${config.color}`}>
          <Icon className="mr-1 h-3 w-3" />
          {config.label}
        </Badge>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {log.phase ? (
            <Badge variant="secondary" className="text-[10px] uppercase">
              {log.phase}
            </Badge>
          ) : null}
          {log.scraper_name ? (
            <span className="text-[11px] font-mono text-slate-400">{log.scraper_name}</span>
          ) : null}
          {log.sku ? (
            <span className="text-[11px] font-mono text-amber-300">{log.sku}</span>
          ) : null}
          {log.runner_name ? (
            <span className="text-[11px] text-slate-500">{log.runner_name}</span>
          ) : null}
          {typeof log.sequence === 'number' ? (
            <span className="text-[11px] text-slate-500">#{log.sequence}</span>
          ) : null}
        </div>

        <div className="mt-1 font-mono text-sm break-all text-slate-100">
          {log.message}
        </div>

        {log.source ? (
          <div className="mt-1 text-[11px] text-slate-500">
            Source: <span className="font-mono">{log.source}</span>
          </div>
        ) : null}

        {log.details && Object.keys(log.details).length > 0 ? (
          <div className="mt-2 overflow-x-auto rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300">
            <pre className="font-mono whitespace-pre-wrap">
              {JSON.stringify(log.details, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function LogViewer({
  jobId,
  logs: initialLogs,
  initialProgress = null,
  className,
}: LogViewerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [filter, setFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const logContainerRef = useRef<HTMLDivElement>(null);

  const { logs: persistedRealtimeLogs, isConnected: dbConnected } = useLogSubscription({
    jobId,
    maxEntries: 2000,
  });

  const {
    isConnected: jobConnected,
    getJob,
  } = useJobSubscription({
    autoConnect: true,
    jobIds: [jobId],
    maxJobsPerStatus: 10,
  });

  const mergedLogs = useMemo(() => {
    return mergeScrapeJobLogs(
      initialLogs,
      persistedRealtimeLogs,
      2000,
    );
  }, [initialLogs, persistedRealtimeLogs]);

  const currentJob = getJob(jobId);
  const liveProgress = currentJob
    ? progressUpdateFromJobRecord(currentJob)
    : initialProgress;
  const isConnected = dbConnected || jobConnected;

  useEffect(() => {
    if (isExpanded && logContainerRef.current && mergedLogs.length > 0) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [isExpanded, mergedLogs.length]);

  const filteredLogs = useMemo(() => {
    return mergedLogs.filter((log) => {
      const haystack = [
        log.message,
        log.runner_name,
        log.scraper_name,
        log.sku,
        log.phase,
        log.source,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = filter === '' || haystack.includes(filter.toLowerCase());
      const matchesLevel = levelFilter === 'all' || log.level === levelFilter;
      return matchesSearch && matchesLevel;
    });
  }, [filter, levelFilter, mergedLogs]);

  const logCounts = useMemo(
    () => ({
      all: mergedLogs.length,
      info: mergedLogs.filter((log) => log.level === 'info').length,
      warning: mergedLogs.filter((log) => log.level === 'warning').length,
      error: mergedLogs.filter((log) => ['error', 'critical'].includes(log.level)).length,
      debug: mergedLogs.filter((log) => log.level === 'debug').length,
    }),
    [mergedLogs],
  );

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Terminal className="h-4 w-4" />
            Execution Logs ({mergedLogs.length})
            {isConnected ? (
              <Badge
                variant="outline"
                className="ml-2 h-5 gap-1 border-green-200 bg-green-50 px-1.5 text-[10px] text-green-600"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                </span>
                Live
              </Badge>
            ) : (
              <Badge variant="outline" className="ml-2 h-5 px-1.5 text-[10px] text-muted-foreground">
                Offline
              </Badge>
            )}
          </CardTitle>

          <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <div className="flex items-center gap-2 font-medium text-slate-700">
            <Loader2 className={`h-3.5 w-3.5 ${isConnected ? 'animate-spin text-primary' : 'text-slate-400'}`} />
            {formatProgressLabel(liveProgress)}
          </div>
          {liveProgress?.message ? (
            <p className="mt-1 text-slate-500">{liveProgress.message}</p>
          ) : null}
        </div>

        <div className="mt-2 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter logs, SKUs, scrapers, or phases..."
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>

          <select
            value={levelFilter}
            onChange={(event) => setLevelFilter(event.target.value)}
            className="h-8 rounded border bg-card px-2 text-xs"
          >
            <option value="all">All ({logCounts.all})</option>
            <option value="info">Info ({logCounts.info})</option>
            <option value="warning">Warn ({logCounts.warning})</option>
            <option value="error">Error ({logCounts.error})</option>
            <option value="debug">Debug ({logCounts.debug})</option>
          </select>
        </div>
      </CardHeader>

      {isExpanded ? (
        <CardContent>
          <div
            ref={logContainerRef}
            className="max-h-[32rem] overflow-y-auto rounded-lg border bg-slate-900 p-3 text-slate-100"
          >
            {filteredLogs.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {mergedLogs.length === 0
                  ? 'No logs available for this run yet.'
                  : 'No logs match your filters.'}
              </p>
            ) : (
              filteredLogs.map((log) => <LogEntry key={log.id} log={log} />)
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Showing {filteredLogs.length} of {mergedLogs.length} logs
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}
