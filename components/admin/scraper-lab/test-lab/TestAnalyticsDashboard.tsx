/**
 * TestAnalyticsDashboard Component
 *
 * Aggregates test metrics from scraper_test_runs.
 * Shows success rates, duration stats, per-scraper breakdown, and error analysis.
 * Supports 7-day and 30-day time periods with simple visualizations.
 */

'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BarChart3,
  Calendar,
  Activity,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useTestRunManager } from '@/lib/contexts/TestRunManagerContext';

/** Time period options */
type TimePeriod = 7 | 30;

/** Test run record interface - matches database schema */
interface TestRunRecord {
  id: string;
  scraper_id: string;
  scraper_name: string | null;
  test_type: string;
  status: string;
  created_at: string;
  duration_ms: number | null;
  skus_tested: string[] | null;
  passed_count: number | null;
  failed_count: number | null;
  error_message?: string | null;
}

/** Aggregated metrics for display */
interface AggregatedMetrics {
  totalRuns: number;
  successRate: number;
  avgDurationMs: number;
  totalPassed: number;
  totalFailed: number;
  totalPartial: number;
  errorBreakdown: Record<string, { count: number; percentage: number }>;
}

/** Per-scraper metrics */
interface ScraperMetrics {
  scraperId: string;
  scraperName: string;
  totalRuns: number;
  successRate: number;
  avgDurationMs: number;
  passed: number;
  failed: number;
  partial: number;
}

/** Health score data point */
interface HealthDataPoint {
  date: string;
  score: number;
}

/** Props for the TestAnalyticsDashboard component */
interface TestAnalyticsDashboardProps {
  className?: string;
}

/**
 * Format duration from milliseconds to human readable string
 */
function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '-';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format date for display (short format)
 */
function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Calculate aggregated metrics from test runs
 */
function calculateMetrics(runs: TestRunRecord[]): AggregatedMetrics {
  const totalRuns = runs.length;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalPartial = 0;
  let totalDuration = 0;
  let durationCount = 0;
  const errorCounts: Record<string, number> = {};

  runs.forEach((run) => {
    // Count statuses
    switch (run.status) {
      case 'passed':
        totalPassed++;
        break;
      case 'failed':
        totalFailed++;
        // Aggregate error messages
        if (run.error_message) {
          const errorKey = run.error_message.split('\n')[0].substring(0, 100);
          errorCounts[errorKey] = (errorCounts[errorKey] || 0) + 1;
        }
        break;
      case 'partial':
        totalPartial++;
        break;
    }

    // Sum durations
    if (run.duration_ms !== null) {
      totalDuration += run.duration_ms;
      durationCount++;
    }
  });

  const successRate = totalRuns > 0 ? (totalPassed / totalRuns) * 100 : 0;
  const avgDurationMs = durationCount > 0 ? totalDuration / durationCount : 0;

  // Calculate error percentages
  const totalFailedRuns = totalFailed;
  const errorBreakdown: Record<string, { count: number; percentage: number }> = {};
  Object.entries(errorCounts).forEach(([error, count]) => {
    errorBreakdown[error] = {
      count,
      percentage: totalFailedRuns > 0 ? (count / totalFailedRuns) * 100 : 0,
    };
  });

  return {
    totalRuns,
    successRate,
    avgDurationMs,
    totalPassed,
    totalFailed,
    totalPartial,
    errorBreakdown,
  };
}

/**
 * Calculate per-scraper metrics
 */
function calculateScraperMetrics(runs: TestRunRecord[]): ScraperMetrics[] {
  const scraperMap = new Map<string, ScraperMetrics>();

  runs.forEach((run) => {
    const key = run.scraper_id || run.scraper_name || 'unknown';
    const name = run.scraper_name || run.scraper_id || 'Unknown';

    if (!scraperMap.has(key)) {
      scraperMap.set(key, {
        scraperId: key,
        scraperName: name,
        totalRuns: 0,
        successRate: 0,
        avgDurationMs: 0,
        passed: 0,
        failed: 0,
        partial: 0,
      });
    }

    const metrics = scraperMap.get(key)!;
    metrics.totalRuns++;
    metrics.avgDurationMs += run.duration_ms || 0;

    switch (run.status) {
      case 'passed':
        metrics.passed++;
        break;
      case 'failed':
        metrics.failed++;
        break;
      case 'partial':
        metrics.partial++;
        break;
    }
  });

  // Calculate success rates and average durations
  const result: ScraperMetrics[] = [];
  scraperMap.forEach((metrics) => {
    metrics.successRate = metrics.totalRuns > 0
      ? (metrics.passed / metrics.totalRuns) * 100
      : 0;
    metrics.avgDurationMs = metrics.totalRuns > 0
      ? metrics.avgDurationMs / metrics.totalRuns
      : 0;
    result.push(metrics);
  });

  return result.sort((a, b) => b.successRate - a.successRate);
}

/**
 * Calculate health score trend over time
 */
function calculateHealthTrend(runs: TestRunRecord[]): HealthDataPoint[] {
  // Group runs by date
  const dateMap = new Map<string, { total: number; passed: number }>();

  runs.forEach((run) => {
    const date = new Date(run.created_at).toISOString().split('T')[0];
    if (!dateMap.has(date)) {
      dateMap.set(date, { total: 0, passed: 0 });
    }
    const dayData = dateMap.get(date)!;
    dayData.total++;
    if (run.status === 'passed') {
      dayData.passed++;
    }
  });

  // Convert to array and sort by date
  const trend: HealthDataPoint[] = [];
  dateMap.forEach((data, date) => {
    trend.push({
      date,
      score: data.total > 0 ? (data.passed / data.total) * 100 : 0,
    });
  });

  return trend.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get health status badge configuration
 */
function getHealthBadge(score: number): {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className: string;
} {
  if (score >= 90) {
    return {
      label: 'Excellent',
      variant: 'default',
      className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    };
  }
  if (score >= 70) {
    return {
      label: 'Good',
      variant: 'secondary',
      className: 'bg-amber-100 text-amber-700 border-amber-200',
    };
  }
  if (score >= 50) {
    return {
      label: 'Fair',
      variant: 'secondary',
      className: 'bg-orange-100 text-orange-700 border-orange-200',
    };
  }
  return {
    label: 'Poor',
    variant: 'destructive',
    className: 'bg-red-100 text-red-700 border-red-200',
  };
}

/**
 * TestAnalyticsDashboard Component
 *
 * Displays aggregated test metrics with time period selection,
 * key metrics cards, per-scraper breakdown, and error analysis.
 */
export function TestAnalyticsDashboard({
  className,
}: TestAnalyticsDashboardProps) {
  const { historicalRuns, isLoading, error, loadHistoricalRuns } = useTestRunManager();
  const [timePeriod, setTimePeriod] = useState<TimePeriod>(30);

  // Load historical runs on mount
  useEffect(() => {
    loadHistoricalRuns();
  }, [loadHistoricalRuns]);

  // Normalize runs from context
  const allRuns = useMemo((): TestRunRecord[] => {
    return (historicalRuns as unknown as TestRunRecord[]).map((run) => ({
      id: run.id,
      scraper_id: run.scraper_id,
      scraper_name: run.scraper_name || null,
      test_type: run.test_type || 'manual',
      status: run.status || 'pending',
      created_at: run.created_at,
      duration_ms: run.duration_ms ?? null,
      skus_tested: (run.skus_tested as string[]) || [],
      passed_count: run.passed_count ?? 0,
      failed_count: run.failed_count ?? 0,
      error_message: run.error_message ?? null,
    }));
  }, [historicalRuns]);

  // Filter runs by time period
  const filteredRuns = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - timePeriod);
    const cutoffDate = cutoff.toISOString();

    return allRuns.filter((run) => run.created_at >= cutoffDate);
  }, [allRuns, timePeriod]);

  // Calculate metrics
  const metrics = useMemo(() => calculateMetrics(filteredRuns), [filteredRuns]);
  const scraperMetrics = useMemo(() => calculateScraperMetrics(filteredRuns), [filteredRuns]);
  const healthTrend = useMemo(() => calculateHealthTrend(filteredRuns), [filteredRuns]);

  // Get health score trend info
  const latestHealth = healthTrend.length > 0
    ? healthTrend[healthTrend.length - 1].score
    : 0;
  const previousHealth = healthTrend.length > 1
    ? healthTrend[healthTrend.length - 2].score
    : latestHealth;
  const healthTrendDirection = latestHealth - previousHealth;
  const trendLabel = healthTrendDirection > 0
    ? 'up'
    : healthTrendDirection < 0
      ? 'down'
      : 'stable';

  // Render loading state
  if (isLoading && allRuns.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            <div>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-24 mt-1" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Skeleton metrics cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2 p-4 rounded-lg border">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>

          {/* Skeleton tabs */}
          <div className="space-y-4">
            <Skeleton className="h-10 w-full max-w-md" />
            <div className="border rounded-lg">
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render empty state
  if (!isLoading && allRuns.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            <CardTitle className="text-lg">Test Analytics</CardTitle>
          </div>
          <CardDescription>View aggregated test metrics and trends</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-lg font-medium text-gray-900">No test data available</p>
            <p className="text-sm text-gray-500 mt-1">
              Run some tests to see analytics here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            <CardTitle className="text-lg">Test Analytics</CardTitle>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={String(timePeriod)}
              onValueChange={(v) => setTimePeriod(Number(v) as TimePeriod)}
            >
              <SelectTrigger className="w-36">
                <Calendar className="h-4 w-4 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={loadHistoricalRuns}
              disabled={isLoading}
            >
              <Activity className="h-4 w-4 mr-1.5" />
              Refresh
            </Button>
          </div>
        </div>
        <CardDescription>
          Aggregated metrics from {metrics.totalRuns} test runs
          {filteredRuns.length < allRuns.length && ` (showing last ${timePeriod} days)`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Error state */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-sm text-red-700">{error}</span>
            <Button variant="ghost" size="sm" onClick={loadHistoricalRuns} className="ml-auto">
              Retry
            </Button>
          </div>
        )}

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Success Rate */}
          <div className="space-y-2 p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Success Rate</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{metrics.successRate.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${metrics.successRate}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {metrics.totalPassed} passed / {metrics.totalRuns} total
            </div>
          </div>

          {/* Average Duration */}
          <div className="space-y-2 p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 text-blue-500" />
              <span>Avg Duration</span>
            </div>
            <span className="text-3xl font-bold">{formatDuration(metrics.avgDurationMs)}</span>
            <div className="text-xs text-muted-foreground">
              Per test run
            </div>
          </div>

          {/* Total Runs */}
          <div className="space-y-2 p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4 text-purple-500" />
              <span>Total Runs</span>
            </div>
            <span className="text-3xl font-bold">{metrics.totalRuns}</span>
            <div className="flex gap-2 text-xs text-muted-foreground">
              <span className="text-emerald-600">{metrics.totalPassed} passed</span>
              <span className="text-red-600">{metrics.totalFailed} failed</span>
              <span className="text-amber-600">{metrics.totalPartial} partial</span>
            </div>
          </div>

          {/* Health Trend */}
          <div className="space-y-2 p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {healthTrendDirection >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <span>Health Trend</span>
            </div>
            <Badge
              variant="outline"
              className={`${getHealthBadge(latestHealth).className} text-lg px-3 py-1`}
            >
              {latestHealth.toFixed(0)}%
            </Badge>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {trendLabel === 'up' && <TrendingUp className="h-3 w-3 text-emerald-500" />}
              {trendLabel === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
              <span>vs yesterday</span>
            </div>
          </div>
        </div>

        {/* Tabs for detailed breakdowns */}
        <Tabs defaultValue="scrapers" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="scrapers">By Scraper</TabsTrigger>
            <TabsTrigger value="errors">Error Breakdown</TabsTrigger>
            <TabsTrigger value="trend">Health Trend</TabsTrigger>
          </TabsList>

          {/* Per-Scraper Breakdown */}
          <TabsContent value="scrapers" className="mt-4">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50">
                    <TableHead>Scraper</TableHead>
                    <TableHead className="text-center">Runs</TableHead>
                    <TableHead className="text-center">Success Rate</TableHead>
                    <TableHead className="text-center">Passed</TableHead>
                    <TableHead className="text-center">Failed</TableHead>
                    <TableHead className="text-center">Avg Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scraperMetrics.map((scraper) => {
                    const healthConfig = getHealthBadge(scraper.successRate);
                    return (
                      <TableRow key={scraper.scraperId}>
                        <TableCell className="font-medium">
                          {scraper.scraperName}
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {scraper.totalRuns}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={`${healthConfig.className} font-medium`}
                          >
                            {scraper.successRate.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-emerald-600">{scraper.passed}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-red-600">{scraper.failed}</span>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {formatDuration(scraper.avgDurationMs)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Error Breakdown */}
          <TabsContent value="errors" className="mt-4">
            {metrics.totalFailed === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-300 mb-4" />
                <p className="text-lg font-medium text-gray-900">No failures recorded</p>
                <p className="text-sm text-gray-500 mt-1">
                  All tests passed in this time period
                </p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/50">
                      <TableHead>Error Type</TableHead>
                      <TableHead className="text-center">Count</TableHead>
                      <TableHead className="text-center">% of Failures</TableHead>
                      <TableHead className="w-48">Distribution</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(metrics.errorBreakdown)
                      .sort((a, b) => b[1].count - a[1].count)
                      .map(([error, data]) => (
                        <TableRow key={error}>
                          <TableCell className="font-medium max-w-md truncate" title={error}>
                            {error}
                          </TableCell>
                          <TableCell className="text-center font-mono">
                            <Badge variant="destructive" className="font-mono">
                              {data.count}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-mono">{data.percentage.toFixed(1)}%</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-red-400 transition-all duration-300"
                                  style={{ width: `${data.percentage}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground w-8">
                                {data.percentage.toFixed(0)}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Health Trend Visualization */}
          <TabsContent value="trend" className="mt-4">
            {healthTrend.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Activity className="h-12 w-12 text-gray-300 mb-4" />
                <p className="text-lg font-medium text-gray-900">No trend data</p>
                <p className="text-sm text-gray-500 mt-1">
                  Run more tests to see health trends
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Simple bar chart visualization */}
                <div className="flex items-end gap-1 h-48 p-4 bg-gray-50 rounded-lg border">
                  {healthTrend.map((point, index) => {
                    const height = Math.max(4, point.score);
                    const isLatest = index === healthTrend.length - 1;
                    return (
                      <div
                        key={point.date}
                        className="flex-1 flex flex-col items-center gap-1 group"
                      >
                        <div
                          className={`w-full rounded-t transition-all duration-300 ${
                            isLatest
                              ? 'bg-primary'
                              : point.score >= 90
                                ? 'bg-emerald-400'
                                : point.score >= 70
                                  ? 'bg-amber-400'
                                  : point.score >= 50
                                    ? 'bg-orange-400'
                                    : 'bg-red-400'
                          }`}
                          style={{ height: `${height}%` }}
                        />
                        <span className="text-[10px] text-muted-foreground -rotate-45 origin-center">
                          {formatShortDate(point.date)}
                        </span>
                        {/* Tooltip */}
                        <div className="absolute hidden group-hover:block bg-gray-900 text-white text-xs px-2 py-1 rounded -mt-8 whitespace-nowrap z-10">
                          {point.score.toFixed(0)}% on {formatShortDate(point.date)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-emerald-400" />
                    <span>≥90% (Excellent)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-amber-400" />
                    <span>70-89% (Good)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-orange-400" />
                    <span>50-69% (Fair)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-red-400" />
                    <span>&lt;50% (Poor)</span>
                  </div>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-600">
                      {healthTrend.filter((p) => p.score >= 90).length}
                    </div>
                    <div className="text-xs text-muted-foreground">Excellent days</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-600">
                      {healthTrend.filter((p) => p.score >= 70 && p.score < 90).length}
                    </div>
                    <div className="text-xs text-muted-foreground">Good days</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {healthTrend.filter((p) => p.score < 70).length}
                    </div>
                    <div className="text-xs text-muted-foreground">Needs attention</div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
