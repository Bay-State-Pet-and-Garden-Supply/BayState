import React from 'react';
import { Activity, CheckCircle2, AlertCircle, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useJobStats } from '@/hooks/use-job-stats';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function ScraperStatusWidget() {
  const { stats, loading, error } = useJobStats();

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-full border-brand-burgundy/20 bg-brand-burgundy/5 dark:bg-brand-burgundy/10">
        <CardContent className="flex flex-col items-center justify-center py-6 text-center">
          <AlertCircle className="h-8 w-8 text-brand-burgundy mb-2" />
          <p className="text-sm font-medium text-brand-burgundy">Failed to load scraper stats</p>
          <p className="text-xs text-brand-burgundy/70 mt-1">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">Scraper Status</CardTitle>
        <Badge 
          variant={stats.activeJobs > 0 ? "default" : "secondary"}
          className={cn(stats.activeJobs > 0 && "bg-brand-forest-green hover:bg-brand-forest-green/90")}
        >
          {stats.activeJobs} Active
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold">{stats.successRate}%</p>
              <p className="text-xs text-muted-foreground">Success rate (last 100 jobs)</p>
            </div>
            <div className="flex items-center gap-1 text-brand-forest-green">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs font-medium">Healthy</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Zap className="h-3.5 w-3.5 text-brand-gold" />
                <span className="text-[10px] uppercase font-bold tracking-wider">Velocity</span>
              </div>
              <p className="text-lg font-semibold">{stats.itemsPerMin}</p>
              <p className="text-[10px] text-muted-foreground">items / min</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Activity className="h-3.5 w-3.5 text-brand-forest-green" />
                <span className="text-[10px] uppercase font-bold tracking-wider">Volume</span>
              </div>
              <p className="text-lg font-semibold">{stats.totalJobs}</p>
              <p className="text-[10px] text-muted-foreground">total jobs</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
