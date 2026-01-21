'use client';

import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import {
  Terminal,
  ChevronDown,
  ChevronUp,
  Info,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Search,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrapeJobLog } from '@/app/admin/scrapers/runs/actions';

interface LogViewerProps {
  logs: ScrapeJobLog[];
}

const logLevelConfig = {
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', label: 'INFO' },
  warn: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'WARN' },
  warning: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'WARN' },
  error: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'ERROR' },
  debug: { icon: Terminal, color: 'text-gray-600', bg: 'bg-gray-50', label: 'DEBUG' },
  success: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: 'SUCCESS' },
} as const;

type LogLevel = keyof typeof logLevelConfig;

function getLogLevel(level: string): LogLevel {
  return level.toLowerCase() as LogLevel;
}

function LogEntry({ log }: { log: ScrapeJobLog }) {
  const level = getLogLevel(log.level);
  const config = logLevelConfig[level] || logLevelConfig.info;
  const Icon = config.icon;

  return (
    <div className="flex gap-3 py-2 hover:bg-gray-50 px-2 rounded">
      <div className="flex-shrink-0 w-20 flex items-center gap-1">
        <span className={`text-xs font-mono ${config.color}`}>
          {format(new Date(log.created_at), 'HH:mm:ss')}
        </span>
      </div>
      <div className="flex-shrink-0 w-16">
        <Badge variant="outline" className={`text-xs ${config.bg} ${config.color} border-0`}>
          <Icon className="mr-1 h-3 w-3" />
          {config.label}
        </Badge>
      </div>
      <div className="flex-1 font-mono text-sm text-gray-700 break-all">
        {log.message}
      </div>
    </div>
  );
}

export function LogViewer({ logs }: LogViewerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [filter, setFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isExpanded && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, isExpanded]);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = filter === '' || 
      log.message.toLowerCase().includes(filter.toLowerCase());
    const matchesLevel = levelFilter === 'all' || log.level.toLowerCase() === levelFilter.toLowerCase();
    return matchesSearch && matchesLevel;
  });

  const logCounts = {
    all: logs.length,
    info: logs.filter(l => l.level.toLowerCase() === 'info').length,
    warn: logs.filter(l => ['warn', 'warning'].includes(l.level.toLowerCase())).length,
    error: logs.filter(l => l.level.toLowerCase() === 'error').length,
    success: logs.filter(l => l.level.toLowerCase() === 'success').length,
  };

  if (logs.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Execution Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">No logs available for this run.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Execution Logs ({logs.length})
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
        
        {/* Filters */}
        <div className="flex gap-2 mt-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" />
            <Input
              placeholder="Filter logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="h-8 px-2 text-xs border rounded bg-white"
          >
            <option value="all">All ({logCounts.all})</option>
            <option value="info">Info ({logCounts.info})</option>
            <option value="warn">Warn ({logCounts.warn})</option>
            <option value="error">Error ({logCounts.error})</option>
            <option value="success">Success ({logCounts.success})</option>
          </select>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent>
          <div
            ref={logContainerRef}
            className="max-h-96 overflow-y-auto border rounded-lg bg-gray-900 text-gray-100 p-3"
          >
            {filteredLogs.length === 0 ? (
              <p className="text-sm text-gray-600 text-center py-4">
                No logs match your filters.
              </p>
            ) : (
              filteredLogs.map((log) => (
                <LogEntry key={log.id} log={log} />
              ))
            )}
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Showing {filteredLogs.length} of {logs.length} logs
          </p>
        </CardContent>
      )}
    </Card>
  );
}
