import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';

interface TimelineJob {
  id: string;
  name: string;
  startTime: Date;
  endTime?: Date;
  status: JobStatus;
  runner?: string;
}

interface TimelineViewProps {
  jobs: TimelineJob[];
  timeRange: TimeRange;
  onJobClick?: (job: TimelineJob) => void;
  onTimeRangeChange?: (range: TimeRange) => void;
}

const STATUS_COLORS: Record<JobStatus, string> = {
  pending: 'bg-brand-gold',
  running: 'bg-blue-600',
  completed: 'bg-brand-forest-green',
  failed: 'bg-brand-burgundy',
  cancelled: 'bg-muted-foreground',
};

const TIME_RANGE_MS: Record<TimeRange, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export function TimelineView({
  jobs,
  timeRange,
  onJobClick,
  onTimeRangeChange,
}: TimelineViewProps) {
  const [hoveredJob, setHoveredJob] = useState<string | null>(null);

  const filteredJobs = useMemo(() => {
    const now = new Date().getTime();
    const rangeMs = TIME_RANGE_MS[timeRange];
    return jobs
      .filter((job) => now - job.startTime.getTime() <= rangeMs)
      .slice(0, 50);
  }, [jobs, timeRange]);

  const timeRangeMs = TIME_RANGE_MS[timeRange];
  const now = new Date().getTime();
  const startTime = now - timeRangeMs;

  const getJobPosition = (job: TimelineJob) => {
    const jobStart = Math.max(job.startTime.getTime(), startTime);
    const jobEnd = job.endTime?.getTime() || now;
    const duration = jobEnd - jobStart;

    const left = ((jobStart - startTime) / timeRangeMs) * 100;
    const width = Math.max((duration / timeRangeMs) * 100, 0.5);

    return { left: Math.max(0, left), width: Math.min(width, 100 - left) };
  };

  const formatDuration = (ms: number) => {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${Math.round(ms / 3600000)}h`;
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {(['1h', '6h', '24h', '7d', '30d'] as TimeRange[]).map((range) => (
              <Button
                key={range}
                variant={timeRange === range ? 'default' : 'outline'}
                size="sm"
                onClick={() => onTimeRangeChange?.(range)}
                className="h-8 text-[10px] rounded-none"
              >
                {range}
              </Button>
            ))}
          </div>
          {jobs.length > 50 && (
            <Badge variant="secondary" className="rounded-none border border-border font-semibold">
              Showing 50 of {jobs.length} jobs
            </Badge>
          )}
        </div>

        <div className="relative overflow-x-auto rounded-none border border-border bg-card">
          <div className="min-w-[600px]">
            <div className="border-b border-border bg-muted/30 px-4 py-2">
              <div className="grid grid-cols-[200px_1fr] gap-4">
                <span className="text-[10px] font-semibold text-foreground">Job</span>
                <div className="relative h-6">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 text-[10px] font-semibold text-muted-foreground"
                      style={{ left: `${i * 25}%` }}
                    >
                      {formatDuration(timeRangeMs - (i * timeRangeMs) / 4)}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="divide-y divide-border/10">
              {filteredJobs.map((job) => {
                const pos = getJobPosition(job);
                const isHovered = hoveredJob === job.id;

                return (
                  <Tooltip key={job.id}>
                    <TooltipTrigger asChild>
                      <div
                        className="grid cursor-pointer grid-cols-[200px_1fr] gap-4 px-4 py-3 hover:bg-muted/20 transition-colors"
                        onClick={() => onJobClick?.(job)}
                        onMouseEnter={() => setHoveredJob(job.id)}
                        onMouseLeave={() => setHoveredJob(null)}
                      >
                        <div className="truncate text-xs font-bold text-foreground">
                          {job.name}
                        </div>
                        <div className="relative h-6">
                          <div
                            className={cn(
                              'absolute h-5 rounded-none border border-border transition-all',
                              STATUS_COLORS[job.status],
                              isHovered && 'ring-1 ring-foreground ring-offset-2'
                            )}
                            style={{
                              left: `${pos.left}%`,
                              width: `${pos.width}%`,
                            }}
                          />
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="rounded-none border border-border bg-popover text-popover-foreground shadow-none">
                      <div className="space-y-1.5">
                        <p className="font-semibold text-foreground">{job.name}</p>
                        <div className="flex flex-col gap-1">
                          <p className="text-[10px] font-semibold text-muted-foreground">
                            Status: <span className="text-foreground">{job.status}</span>
                          </p>
                          {job.runner && (
                            <p className="text-[10px] font-semibold text-muted-foreground">
                              Runner: <span className="text-foreground">{job.runner}</span>
                            </p>
                          )}
                          <p className="text-[10px] font-semibold text-muted-foreground">
                            Duration:{' '}
                            <span className="text-foreground">
                              {formatDuration(
                                (job.endTime?.getTime() || now) - job.startTime.getTime()
                              )}
                            </span>
                          </p>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>

  );
}
