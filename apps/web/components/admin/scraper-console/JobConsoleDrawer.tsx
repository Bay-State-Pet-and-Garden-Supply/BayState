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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        className="sm:max-w-4xl border-l border-border shadow-xl p-0 flex flex-col rounded-l-2xl"
      >
        <SheetHeader className="p-6 border-b border-border bg-muted/20 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-primary" />
              <SheetTitle className="text-2xl font-bold tracking-tight">
                Scraper Console
              </SheetTitle>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-background border border-border px-2.5 py-0.5 rounded-full">
                <div className={cn("h-2 w-2 rounded-full", isConnected ? "bg-emerald-500" : "bg-amber-500 animate-pulse")} />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {isConnected ? 'Live' : 'Syncing'}
                </span>
              </div>
            </div>
          </div>
          <SheetDescription className="font-mono text-xs text-muted-foreground">
            {jobId ? `Monitoring Job: ${jobId}` : 'Select a job to view diagnostics'}
          </SheetDescription>
        </SheetHeader>
 
        <div className="flex-1 flex overflow-hidden bg-background">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="font-semibold tracking-tight text-sm text-muted-foreground">Loading Job History...</p>
            </div>
          ) : (
            <>
              {/* Left: Progress Rail */}
              <div className="w-72 border-r border-border bg-muted/10 overflow-y-auto">
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
