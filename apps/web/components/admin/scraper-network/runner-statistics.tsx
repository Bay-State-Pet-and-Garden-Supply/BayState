'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface RunnerStatisticsProps {
  runnerId: string;
  runnerName: string;
  stats: {
    totalRuns: number;
    successRate: number;
    avgDuration: number;
    lastSeen: string;
    lastSeenRelative: string;
    uptimePercentage?: number;
    scraperBreakdown?: Array<{
      scraperName: string;
      runCount: number;
      successRate: number;
    }>;
  };
}

export function RunnerStatistics({ runnerId, runnerName, stats }: RunnerStatisticsProps) {
  const uptimeStatus = useMemo(() => {
    if (!stats.lastSeenRelative) return { label: 'Unknown', color: 'bg-gray-100' };
    
    const match = stats.lastSeenRelative.match(/(\d+)\s*(minute|hour|day)/i);
    if (!match) return { label: 'Online', color: 'bg-green-100' };
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    if (unit === 'minute' && value <= 5) return { label: 'Online', color: 'bg-green-100' };
    if (unit === 'hour' && value <= 1) return { label: 'Online', color: 'bg-green-100' };
    if (unit === 'hour' && value <= 24) return { label: 'Recent', color: 'bg-blue-100' };
    return { label: 'Away', color: 'bg-yellow-100' };
  }, [stats.lastSeenRelative]);

  return (
    <div className="space-y-6">
      {/* Basic Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Runs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Runs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalRuns.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              All-time executions
            </p>
          </CardContent>
        </Card>

        {/* Success Rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats.successRate}%
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-green-500"
                style={{ width: `${stats.successRate}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Completed successfully
            </p>
          </CardContent>
        </Card>

        {/* Average Duration */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatDuration(stats.avgDuration)}
            </div>
            <p className="text-xs text-muted-foreground">
              Per run average
            </p>
          </CardContent>
        </Card>

        {/* Uptime Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Last Seen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={uptimeStatus.color}>
              {uptimeStatus.label}
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.lastSeenRelative}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Performance Over Time Chart Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center border-2 border-dashed border-muted-foreground/20 rounded-lg">
            <div className="text-center text-muted-foreground">
              <p className="font-medium">Performance Chart</p>
              <p className="text-sm">Runs per day, success rate over time</p>
              <p className="text-xs mt-2">Chart library integration needed</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scraper Breakdown */}
      {stats.scraperBreakdown && stats.scraperBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Scraper Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.scraperBreakdown.map((scraper) => (
                <div key={scraper.scraperName} className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium capitalize">{scraper.scraperName}</span>
                      <span className="text-sm text-muted-foreground">
                        {scraper.runCount} runs
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${scraper.successRate}%` }}
                      />
                    </div>
                  </div>
                  <div className="ml-4 text-right">
                    <Badge variant={scraper.successRate >= 90 ? 'default' : scraper.successRate >= 70 ? 'secondary' : 'destructive'}>
                      {scraper.successRate}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}
