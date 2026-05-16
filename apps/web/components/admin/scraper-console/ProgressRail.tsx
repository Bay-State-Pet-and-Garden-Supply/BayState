'use client';

import { cn } from '@/lib/utils';
import { 
  CheckCircle2, 
  Circle, 
  Loader2, 
  AlertCircle,
  Search, 
  Globe, 
  Database, 
  Cpu,
  Fingerprint
} from 'lucide-react';
import type { JobPhase } from '@/lib/scraper-logs';

interface ProgressRailProps {
  phases: JobPhase[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const PHASE_ICONS: Record<string, any> = {
  'INITIALIZATION': Cpu,
  'SEARCH': Search,
  'NAVIGATION': Globe,
  'EXTRACTION': Database,
  'PERSISTENCE': Fingerprint,
};

function getPhaseIcon(label: string) {
  const upper = label.toUpperCase();
  for (const [key, icon] of Object.entries(PHASE_ICONS)) {
    if (upper.includes(key)) return icon;
  }
  return Circle;
}

export function ProgressRail({ phases, selectedId, onSelect }: ProgressRailProps) {
  if (phases.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-[10px] font-black uppercase text-zinc-400">Waiting for steps...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-6">
        Job Lifecycle
      </h4>
      
      <div className="space-y-0">
        {phases.map((phase, index) => {
          const Icon = getPhaseIcon(phase.label);
          const isSelected = selectedId === phase.id;
          
          return (
            <button
              key={phase.id}
              onClick={() => onSelect(phase.id)}
              className={cn(
                "w-full text-left relative flex items-start gap-4 pb-8 group outline-none",
                isSelected && "z-20"
              )}
            >
              {/* Vertical Line */}
              {index < phases.length - 1 && (
                <div 
                  className={cn(
                    "absolute left-[11px] top-6 w-1 h-full transition-colors",
                    phase.status === 'completed' ? "bg-zinc-900" : "bg-zinc-200"
                  )} 
                />
              )}
              
              {/* Node Icon */}
              <div className="relative z-10 mt-1">
                {phase.status === 'completed' ? (
                  <div className={cn(
                    "rounded-none p-1 border-2 transition-all",
                    isSelected ? "bg-emerald-500 border-zinc-900 text-white" : "bg-zinc-900 border-zinc-900 text-white"
                  )}>
                    <CheckCircle2 className="h-3 w-3" />
                  </div>
                ) : phase.status === 'running' ? (
                  <div className="bg-white text-zinc-900 rounded-none p-1 border-2 border-zinc-900 animate-pulse">
                    <Loader2 className="h-3 w-3 animate-spin" />
                  </div>
                ) : phase.status === 'failed' ? (
                  <div className="bg-brand-burgundy text-white rounded-none p-1 border-2 border-zinc-900">
                    <AlertCircle className="h-3 w-3" />
                  </div>
                ) : (
                  <div className="bg-white text-zinc-300 rounded-none p-1 border-2 border-zinc-200">
                    <Circle className="h-3 w-3" />
                  </div>
                )}
              </div>

              {/* Label & Details */}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-xs font-black uppercase tracking-tight transition-colors truncate",
                  isSelected ? "text-zinc-900 scale-105 origin-left" : "text-zinc-400",
                  phase.status !== 'idle' && !isSelected && "text-zinc-600"
                )}>
                  {phase.label}
                </p>
                {phase.status === 'running' && (
                  <p className="text-[9px] font-mono text-zinc-500 mt-0.5 animate-pulse">
                    In progress...
                  </p>
                )}
                {phase.status === 'completed' && phase.startTime && phase.endTime && (
                  <p className="text-[9px] font-mono text-zinc-400 mt-0.5">
                    {Math.round((new Date(phase.endTime).getTime() - new Date(phase.startTime).getTime()) / 1000)}s
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
