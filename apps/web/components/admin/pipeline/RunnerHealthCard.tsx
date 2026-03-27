import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProgressBar } from './ProgressBar';
import { Cpu, HardDrive, Activity } from 'lucide-react';

type RunnerStatus = 'online' | 'busy' | 'idle' | 'offline';

interface Runner {
  id: string;
  name: string;
  status: RunnerStatus;
  enabled?: boolean;
  activeJobs: number;
  lastSeen: Date;
  cpuUsage?: number;
  memoryUsage?: number;
  currentJob?: {
    id: string;
    name: string;
    progress: number;
  };
}

interface RunnerHealthCardProps {
  runner: Runner;
  showDetails?: boolean;
  onClick?: (runner: Runner) => void;
}

const STATUS_CONFIG: Record<RunnerStatus, { label: string; color: string; bgColor: string }> = {
  online: { label: 'Online', color: 'text-green-600', bgColor: 'bg-green-50' },
  busy: { label: 'Busy', color: 'text-yellow-600', bgColor: 'bg-yellow-50' },
  idle: { label: 'Idle', color: 'text-muted-foreground', bgColor: 'bg-muted' },
  offline: { label: 'Offline', color: 'text-red-600', bgColor: 'bg-red-50' },
};

const formatLastSeen = (date: Date) => {
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
};

export function RunnerHealthCard({
  runner,
  showDetails = false,
  onClick,
}: RunnerHealthCardProps) {
  const statusConfig = STATUS_CONFIG[runner.status];
  const isOffline = runner.status === 'offline';
  const isEnabled = runner.enabled !== false;

  // Using useMemo to store the formatted string from an impure source (Date.now())
  const lastSeenText = useMemo(() => formatLastSeen(runner.lastSeen), [runner.lastSeen]);

  return (
    <Card
      className={cn(
        'transition-shadow',
        onClick && !isOffline && 'cursor-pointer hover:shadow-md hover:ring-2 hover:ring-primary/20',
        !isEnabled && 'opacity-70 grayscale-[0.3]'
      )}
      onClick={() => !isOffline && onClick?.(runner)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{runner.name}</CardTitle>
              {!isEnabled && (
                <Badge variant="outline" className="text-[10px] h-4 px-1 uppercase tracking-wider border-orange-200 text-orange-700 bg-orange-50/50">
                  Disabled
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Last seen: {lastSeenText}
            </p>
          </div>
          <Badge
            variant="secondary"
            className={cn(statusConfig.bgColor, statusConfig.color)}
          >
            {statusConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Active Jobs</span>
          <span className="font-medium">{runner.activeJobs}</span>
        </div>

        {showDetails && !isOffline && (
          <>
            {(runner.cpuUsage !== undefined || runner.memoryUsage !== undefined) && (
              <div className="space-y-3">
                {runner.cpuUsage !== undefined && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Cpu className="h-3 w-3" />
                        CPU
                      </span>
                      <span className="font-medium">{runner.cpuUsage}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          runner.cpuUsage > 80 ? 'bg-red-500' : 'bg-blue-500'
                        )}
                        style={{ width: `${runner.cpuUsage}%` }}
                      />
                    </div>
                  </div>
                )}
                {runner.memoryUsage !== undefined && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <HardDrive className="h-3 w-3" />
                        Memory
                      </span>
                      <span className="font-medium">{runner.memoryUsage}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          runner.memoryUsage > 80 ? 'bg-red-500' : 'bg-green-500'
                        )}
                        style={{ width: `${runner.memoryUsage}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {runner.currentJob && runner.status === 'busy' && (
              <div className="space-y-2 rounded-lg bg-muted p-3">
                <div className="flex items-center gap-2 text-sm">
                  <Activity className="h-4 w-4 text-blue-500" />
                  <span className="truncate font-medium">{runner.currentJob.name}</span>
                </div>
                <ProgressBar
                  progress={runner.currentJob.progress}
                  status="running"
                  animated={false}
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
