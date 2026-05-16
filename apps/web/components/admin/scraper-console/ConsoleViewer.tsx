'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Code2, ChevronDown, ChevronRight, Terminal, Info, AlertTriangle, AlertCircle, Bug } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScrapeJobLogEntry, JobPhase } from '@/lib/scraper-logs';

interface ConsoleViewerProps {
  phase?: JobPhase;
  allLogs: ScrapeJobLogEntry[];
  jobId: string | null;
}

const LOG_LEVEL_CONFIG = {
  debug: { icon: Bug, color: 'text-zinc-400' },
  info: { icon: Info, color: 'text-blue-600' },
  warning: { icon: AlertTriangle, color: 'text-amber-500' },
  error: { icon: AlertCircle, color: 'text-brand-burgundy' },
  critical: { icon: AlertCircle, color: 'text-brand-burgundy' },
};

function LogItem({ log }: { log: ScrapeJobLogEntry }) {
  const config = LOG_LEVEL_CONFIG[log.level] || LOG_LEVEL_CONFIG.info;
  const Icon = config.icon;
  const time = new Date(log.timestamp).toLocaleTimeString([], { hour12: false });

  return (
    <div className="flex gap-3 text-xs py-1.5 border-b border-zinc-100/50 hover:bg-zinc-50 transition-colors group">
      <span className="text-[10px] text-zinc-400 shrink-0 font-mono pt-0.5">{time}</span>
      <span className={cn("shrink-0 pt-0.5", config.color)}>
        <Icon className="h-3 w-3" />
      </span>
      <div className="flex-1 flex flex-col min-w-0">
        <span className={cn(
          "font-mono break-all leading-relaxed",
          log.level === 'error' ? "text-brand-burgundy font-bold" : "text-zinc-700"
        )}>
          {log.message}
        </span>
        {log.sku && (
          <span className="text-[9px] font-bold text-amber-600 uppercase mt-0.5">SKU: {log.sku}</span>
        )}
      </div>
    </div>
  );
}

export function ConsoleViewer({ phase, allLogs, jobId }: ConsoleViewerProps) {
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter logs for the selected phase, or show all if no phase selected
  const displayedLogs = useMemo(() => {
    if (!phase) return allLogs.slice(-100);
    return phase.logs;
  }, [phase, allLogs]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayedLogs.length]);

  if (!jobId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 p-12 text-center bg-zinc-50/30">
        <Terminal className="h-12 w-12 mb-4 opacity-20" />
        <p className="font-black uppercase tracking-tighter">No Job Selected</p>
        <p className="text-xs mt-1">Select a run from the lifecycle rail to view diagnostics.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Log Header */}
      <div className="px-4 py-2 bg-zinc-900 text-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-[10px] font-black uppercase tracking-tighter">
            {phase ? `Phase: ${phase.label}` : 'Recent Events'}
          </span>
        </div>
        <span className="text-[10px] font-mono text-zinc-400">
          {displayedLogs.length} Events
        </span>
      </div>

      {/* Log Stream */}
      <ScrollArea className="flex-1 bg-white">
        <div className="p-4 pt-2">
          {displayedLogs.length > 0 ? (
            displayedLogs.map((log) => (
              <LogItem key={log.id} log={log} />
            ))
          ) : (
            <div className="py-12 text-center">
              <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Waiting for logs...</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Metadata Inspector (Expandable Footer) */}
      <div className={cn(
        "border-t-4 border-zinc-900 transition-all flex flex-col",
        isInspectorOpen ? "h-80" : "h-11"
      )}>
        <button 
          onClick={() => setIsInspectorOpen(!isInspectorOpen)}
          className="w-full flex items-center justify-between px-4 min-h-[40px] bg-zinc-900 text-white hover:bg-zinc-800 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-black uppercase tracking-tighter">Structured Metadata</span>
          </div>
          <div className="flex items-center gap-4">
            {phase?.metadata && (
              <span className="text-[10px] font-mono text-zinc-400">
                {Object.keys(phase.metadata).length} Keys
              </span>
            )}
            {isInspectorOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </button>

        {isInspectorOpen && (
          <ScrollArea className="flex-1 bg-zinc-50 border-t border-zinc-200">
            <div className="p-4">
              {phase?.metadata && Object.keys(phase.metadata).length > 0 ? (
                <pre className="text-[10px] font-mono text-zinc-700 leading-relaxed overflow-x-auto">
                  {JSON.stringify(phase.metadata, null, 2)}
                </pre>
              ) : (
                <div className="h-full flex items-center justify-center py-12 text-zinc-400">
                  <p className="text-[10px] font-black uppercase tracking-tighter">No metadata for this phase</p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
