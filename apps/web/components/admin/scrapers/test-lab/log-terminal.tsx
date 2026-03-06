'use client';

import React, { useState, useEffect, useRef } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrapeJobLog } from '@/lib/realtime/types';

interface LogTerminalProps {
  logs: ScrapeJobLog[];
  isConnected: boolean;
  onClearLogs?: () => void;
  isCollapsed?: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
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

function LogEntryLine({ log }: { log: ScrapeJobLog }) {
  const [expanded, setExpanded] = useState(false);
  const level = getLogLevel(log.level);
  const config = logLevelConfig[level] || logLevelConfig.info;
  const Icon = config.icon;
  const logTimestamp =
    'created_at' in log && typeof log.created_at === 'string' && log.created_at.length > 0
      ? log.created_at
      : log.timestamp;

  const hasDetails = log.details && Object.keys(log.details).length > 0 && typeof log.details === 'object';

  return (
    <div className="flex flex-col gap-1 py-1 hover:bg-gray-800 px-2 rounded cursor-pointer" onClick={() => hasDetails && setExpanded(!expanded)}>
      <div className="flex gap-3">
        <div className="flex-shrink-0 w-16 flex items-center gap-1">
          <span className={`text-[10px] font-mono ${config.color}`}>
            {format(new Date(logTimestamp), 'HH:mm:ss')}
          </span>
        </div>
        <div className="flex-shrink-0 w-16">
          <Badge variant="outline" className={`text-[10px] ${config.bg} ${config.color} border-0 px-1 py-0`}>
            <Icon className="mr-1 h-2.5 w-2.5" />
            {config.label}
          </Badge>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-xs text-gray-200 break-all">
            {log.message}
          </div>
        </div>
      </div>
      {expanded && hasDetails && (
        <div className="ml-36 text-xs bg-gray-950 p-2 rounded border border-gray-800 overflow-x-auto text-gray-400">
          <pre className="font-mono">
            {JSON.stringify(log.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function LogTerminal({ 
  logs, 
  isConnected, 
  onClearLogs,
  isCollapsed: controlledIsCollapsed,
  onCollapse,
  onExpand
}: LogTerminalProps) {
  const [isExpanded, setIsExpanded] = useState(!controlledIsCollapsed);
  const [filter, setFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (controlledIsCollapsed !== undefined) {
      setIsExpanded(!controlledIsCollapsed);
    }
  }, [controlledIsCollapsed]);

  const handleExpand = () => {
    setIsExpanded(true);
    onExpand?.();
  };

  const handleCollapse = () => {
    setIsExpanded(false);
    onCollapse?.();
  };

  useEffect(() => {
    if (isExpanded && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, isExpanded]);

  const filteredLogs = logs.filter((log: ScrapeJobLog) => {
    const matchesSearch = filter === '' || 
      log.message.toLowerCase().includes(filter.toLowerCase());
    const matchesLevel = levelFilter === 'all' || log.level.toLowerCase() === levelFilter.toLowerCase();
    return matchesSearch && matchesLevel;
  });

  const displayLogs = filteredLogs.slice(-500);

  const logCounts = {
    all: logs.length,
    info: logs.filter((l: ScrapeJobLog) => l.level.toLowerCase() === 'info').length,
    warn: logs.filter((l: ScrapeJobLog) => ['warn', 'warning'].includes(l.level.toLowerCase())).length,
    error: logs.filter((l: ScrapeJobLog) => l.level.toLowerCase() === 'error').length,
    debug: logs.filter((l: ScrapeJobLog) => l.level.toLowerCase() === 'debug').length,
  };

  if (!isExpanded) {
    return (
      <div data-testid="log-terminal" className="flex items-center justify-between bg-gray-900 border-t border-gray-800 p-2 text-gray-400">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4" />
          <span className="text-sm font-medium">Terminal ({logs.length} logs)</span>
          {isConnected ? (
            <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200 text-[10px] h-5 px-1.5 gap-1 ml-2">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
              </span>
              Live
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground text-[10px] h-5 px-1.5 ml-2">Offline</Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleExpand} className="h-6 w-6 p-0 hover:bg-gray-800">
          <ChevronUp className="h-4 w-4" />
          <span className="sr-only">Expand</span>
        </Button>
      </div>
    );
  }

  return (
    <div data-testid="log-terminal" className="flex flex-col h-full bg-gray-900 border-t border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between p-2 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-200">Terminal</span>
          {isConnected ? (
            <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200 text-[10px] h-5 px-1.5 gap-1 ml-2">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
              </span>
              Live
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground text-[10px] h-5 px-1.5 ml-2">Offline</Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <Button 
              variant="outline" 
              size="sm" 
              className={`h-6 text-[10px] px-2 border-gray-700 ${levelFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-transparent text-gray-400 hover:text-white'}`}
              onClick={() => setLevelFilter('all')}
            >
              All ({logCounts.all})
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className={`h-6 text-[10px] px-2 border-gray-700 ${levelFilter === 'info' ? 'bg-blue-900/50 text-blue-400' : 'bg-transparent text-gray-400 hover:text-white'}`}
              onClick={() => setLevelFilter('info')}
            >
              Info ({logCounts.info})
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className={`h-6 text-[10px] px-2 border-gray-700 ${levelFilter === 'warn' ? 'bg-yellow-900/50 text-yellow-400' : 'bg-transparent text-gray-400 hover:text-white'}`}
              onClick={() => setLevelFilter('warn')}
            >
              Warn ({logCounts.warn})
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className={`h-6 text-[10px] px-2 border-gray-700 ${levelFilter === 'error' ? 'bg-red-900/50 text-red-400' : 'bg-transparent text-gray-400 hover:text-white'}`}
              onClick={() => setLevelFilter('error')}
            >
              Error ({logCounts.error})
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className={`h-6 text-[10px] px-2 border-gray-700 ${levelFilter === 'debug' ? 'bg-gray-800 text-gray-300' : 'bg-transparent text-gray-400 hover:text-white'}`}
              onClick={() => setLevelFilter('debug')}
            >
              Debug ({logCounts.debug})
            </Button>
          </div>
          
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-500" />
            <Input
              placeholder="Filter logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-6 pl-7 text-[10px] bg-gray-800 border-gray-700 text-gray-200 placeholder:text-gray-500"
            />
          </div>
          
          {onClearLogs && (
            <Button variant="ghost" size="sm" onClick={onClearLogs} className="h-6 text-[10px] text-gray-400 hover:text-white hover:bg-gray-800 px-2">
              Clear
            </Button>
          )}

          <Button variant="ghost" size="sm" onClick={handleCollapse} className="h-6 w-6 p-0 text-gray-400 hover:text-white hover:bg-gray-800">
            <ChevronDown className="h-4 w-4" />
            <span className="sr-only">Collapse</span>
          </Button>
        </div>
      </div>

      <div ref={logContainerRef} className="flex-1 overflow-y-auto p-2 scroll-smooth">
        {displayLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
            <Terminal className="h-8 w-8 opacity-20" />
            <p className="text-sm">No logs</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {displayLogs.map((log) => (
              <LogEntryLine key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
