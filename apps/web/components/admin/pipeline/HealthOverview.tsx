import { useState } from 'react';
import { Package, Activity, AlertCircle, Server, Layers, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface HealthMetrics {
  totalProducts: number;
  runningJobs: number;
  failed24h: number;
  activeRunners: number;
  queueDepth: number;
  successRate: number;
}

interface HealthTrends {
  totalProducts: number;
  runningJobs: number;
  failed24h: number;
  activeRunners: number;
  queueDepth: number;
  successRate: number;
}

interface HealthOverviewProps {
  metrics: HealthMetrics;
  trends?: HealthTrends;
  onCardClick?: (metric: string) => void;
  isLoading?: boolean;
}

const metricConfig = [
  {
    key: 'totalProducts',
    label: 'Total Products',
    icon: Package,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  {
    key: 'runningJobs',
    label: 'Running Jobs',
    icon: Activity,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  {
    key: 'failed24h',
    label: 'Failed (24h)',
    icon: AlertCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
  },
  {
    key: 'activeRunners',
    label: 'Active Runners',
    icon: Server,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  {
    key: 'queueDepth',
    label: 'Queue Depth',
    icon: Layers,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
  {
    key: 'successRate',
    label: 'Success Rate',
    icon: CheckCircle,
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
    format: (val: number) => `${val}%`,
  },
];

function TrendIndicator({ value }: { value: number }) {
  const isPositive = value >= 0;
  return (
    <span
      className={cn(
        'text-xs font-medium tabular-nums',
        isPositive ? 'text-green-600' : 'text-red-600'
      )}
    >
      {isPositive ? '↑' : '↓'} {Math.abs(value)}%
    </span>
  );
}

export function HealthOverview({
  metrics,
  trends,
  onCardClick,
  isLoading = false,
}: HealthOverviewProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {metricConfig.map((config) => {
        const value = metrics[config.key as keyof HealthMetrics];
        const trend = trends?.[config.key as keyof HealthTrends];
        const Icon = config.icon;

        return (
          <Card
            key={config.key}
            className={cn(
              'cursor-pointer transition-shadow hover:shadow-md',
              onCardClick ? 'hover:ring-2 hover:ring-primary/20' : ''
            )}
            onClick={() => onCardClick?.(config.key)}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {config.label}
              </CardTitle>
              <div className={cn('rounded-full p-2', config.bgColor)}>
                <Icon className={cn('h-4 w-4', config.color)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums">
                  {config.format ? config.format(value) : value.toLocaleString()}
                </span>
                {trend !== undefined && <TrendIndicator value={trend} />}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
