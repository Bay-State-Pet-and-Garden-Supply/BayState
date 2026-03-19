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
  pending: 'bg-gray-400',
  running: 'bg-blue-600',
  completed: 'bg-green-600',
  failed: 'bg-red-600',
  cancelled: 'bg-gray-400',
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
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-600">Progress</span>
        <span className="font-medium text-gray-900">
          {clampedProgress}%
          {eta && status === 'running' && (
            <span className="ml-2 text-gray-500">{eta}</span>
          )}
        </span>
      </div>
      
      <div 
        className="h-2 w-full overflow-hidden rounded-full bg-gray-100"
        role="progressbar"
        aria-valuenow={clampedProgress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progress: ${clampedProgress}%`}
      >
        <div
          className={cn(
            'h-full rounded-full',
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
