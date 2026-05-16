'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useJobConsole } from '@/hooks/useJobConsole';
import { ProgressRail } from './ProgressRail';
import { ConsoleViewer } from './ConsoleViewer';
import { Terminal, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JobConsoleDrawerProps {
  jobId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function JobConsoleDrawer({ jobId, isOpen, onClose }: JobConsoleDrawerProps) {
  const { phases, allLogs, isLoading, isConnected } = useJobConsole({ jobId });
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);

  // Auto-select the active phase or the last completed one
  useEffect(() => {
    if (phases.length > 0 && !selectedPhaseId) {
      const active = phases.find(p => p.status === 'running');
      setSelectedPhaseId(active?.id || phases[phases.length - 1].id);
    }
  }, [phases, selectedPhaseId]);

  const selectedPhase = useMemo(() => 
    phases.find(p => p.id === selectedPhaseId) || phases[phases.length - 1]
  , [phases, selectedPhaseId]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="sm:max-w-4xl border-l-4 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,1)] p-0 flex flex-col rounded-none"
      >
        <SheetHeader className="p-6 border-b-4 border-zinc-900 bg-zinc-50 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              <SheetTitle className="text-2xl font-black uppercase tracking-tighter">
                Scraper Console
              </SheetTitle>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-white border-2 border-zinc-900 px-2 py-0.5">
                <div className={cn("h-2 w-2 rounded-none", isConnected ? "bg-emerald-500" : "bg-amber-500 animate-pulse")} />
                <span className="text-[10px] font-black uppercase tracking-tighter">
                  {isConnected ? 'Live' : 'Syncing'}
                </span>
              </div>
            </div>
          </div>
          <SheetDescription className="font-mono text-xs text-zinc-500">
            {jobId ? `Monitoring Job: ${jobId}` : 'Select a job to view diagnostics'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex overflow-hidden bg-white">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-zinc-900" />
              <p className="font-black uppercase tracking-tighter text-sm">Loading Job History...</p>
            </div>
          ) : (
            <>
              {/* Left: Progress Rail */}
              <div className="w-72 border-r-4 border-zinc-900 bg-zinc-50 overflow-y-auto">
                <ProgressRail 
                  phases={phases} 
                  selectedId={selectedPhaseId} 
                  onSelect={setSelectedPhaseId} 
                />
              </div>

              {/* Right: Console Content */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <ConsoleViewer 
                  phase={selectedPhase} 
                  allLogs={allLogs}
                  jobId={jobId}
                />
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
