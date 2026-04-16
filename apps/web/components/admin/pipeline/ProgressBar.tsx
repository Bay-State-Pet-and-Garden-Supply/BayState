/**
 * ProgressBar - ETL Pipeline progress indicator with smooth animations
 * 
 * Props:
 * - progress: number (0-100) - clamped to valid range
 * - status: JobStatus - determines color
 * - eta?: string - optional ETA text (e.g., "~2m remaining")
 * - animated?: boolean - enable smooth transitions (default: true)
 */

'use client';

import { cn } from '@/lib/utils';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

interface ProgressBarProps {
  progress: number;
  status: JobStatus;
  eta?: string;
  animated?: boolean;
  className?: string;
}

const STATUS_COLORS: Record<JobStatus, string> = {
  pending: 'bg-muted',
  running: 'bg-blue-600',
  completed: 'bg-green-600',
  failed: 'bg-red-600',
  cancelled: 'bg-muted',
};

export function ProgressBar({
  progress,
  status,
  eta,
  animated = true,
  className,
}: ProgressBarProps) {
  // Clamp progress to valid range
  const clampedProgress = Math.max(0, Math.min(100, progress));
  
  // Determine if showing indeterminate state
  const isIndeterminate = clampedProgress === 0 && status === 'running';
  
  // Determine if showing completed state
  const isCompleted = status === 'completed';
  
  // Determine if showing failed state
  const isFailed = status === 'failed' || status === 'cancelled';
  
  // Get the progress bar color based on status
  const progressColor = STATUS_COLORS[status];

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between text-[10px] mb-1 font-black uppercase tracking-tighter">
        <span className="text-zinc-500">Progress</span>
        <span className="text-zinc-950">
          {clampedProgress}%
          {eta && status === 'running' && (
            <span className="ml-2 text-zinc-500">{eta}</span>
          )}
        </span>
      </div>
      
      <div 
        className="h-3 w-full overflow-hidden rounded-none bg-zinc-100 border-2 border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
        role="progressbar"
        aria-valuenow={clampedProgress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progress: ${clampedProgress}%`}
      >
        <div
          className={cn(
            'h-full rounded-none border-r-2 border-zinc-950',
            progressColor,
            animated && 'transition-all duration-500 ease-out',
            isIndeterminate && 'animate-pulse',
            isCompleted && 'duration-300',
            isFailed && 'duration-300'
          )}
          style={{ 
            width: isIndeterminate ? '30%' : `${clampedProgress}%`,
            marginLeft: isIndeterminate ? 0 : undefined,
          }}
        />
      </div>
    </div>
  );
}
