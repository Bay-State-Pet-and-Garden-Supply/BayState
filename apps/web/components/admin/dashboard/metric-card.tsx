import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface TrendProps {
  value: number;
  label: string;
  isPositive: boolean;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: TrendProps;
  status?: 'success' | 'warning' | 'error' | 'info';
  isLoading?: boolean;
  className?: string;
}

const statusColors = {
  success: 'text-green-600 dark:text-green-400',
  warning: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
  info: 'text-blue-600 dark:text-blue-400',
};

const statusBgColors = {
  success: 'bg-green-50 dark:bg-green-900/20',
  warning: 'bg-amber-50 dark:bg-amber-900/20',
  error: 'bg-red-50 dark:bg-red-900/20',
  info: 'bg-blue-50 dark:bg-blue-900/20',
};

export function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
  status,
  isLoading = false,
  className,
}: MetricCardProps) {
  if (isLoading) {
    return (
      <Card className={cn('py-4', className)}>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-4 w-32 mt-2" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('py-4 overflow-hidden relative', className)}>
      {status && (
        <div 
          className={cn(
            'absolute top-0 left-0 w-1 h-full', 
            status === 'success' && 'bg-green-500',
            status === 'warning' && 'bg-amber-500',
            status === 'error' && 'bg-red-500',
            status === 'info' && 'bg-blue-500'
          )} 
        />
      )}
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground truncate">
            {title}
          </p>
          {Icon && (
            <div className={cn(
              'p-2 rounded-full',
              status ? statusBgColors[status] : 'bg-muted'
            )}>
              <Icon className={cn(
                'h-4 w-4',
                status ? statusColors[status] : 'text-muted-foreground'
              )} />
            </div>
          )}
        </div>
        
        <div className="flex items-baseline gap-2 mt-1">
          <h3 className="text-2xl font-bold tracking-tight">
            {value}
          </h3>
          
          {trend && (
            <div className={cn(
              'flex items-center text-xs font-medium',
              trend.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            )}>
              {trend.isPositive ? (
                <TrendingUp className="h-3 w-3 mr-1" />
              ) : (
                <TrendingDown className="h-3 w-3 mr-1" />
              )}
              <span>
                {trend.isPositive ? '+' : ''}{trend.value}%
              </span>
            </div>
          )}
        </div>

        {trend?.label && (
          <p className="text-xs text-muted-foreground mt-1">
            {trend.label}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
