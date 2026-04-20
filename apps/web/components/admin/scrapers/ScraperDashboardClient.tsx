'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Activity,
  FileCode2,
  Server,
  History,
  Plus,
  RefreshCw,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useJobSubscription } from '@/lib/realtime/useJobSubscription';
import { useRunnerPresence } from '@/lib/realtime/useRunnerPresence';
import { AISearchDashboard } from '@/components/admin/scraping/AISearchDashboard';

interface ScraperSummary {
  id: string;
  name: string;
  display_name: string | null;
  status: string;
  health_status: string;
  health_score: number;
  last_test_at: string | null;
}

interface RecentJob {
  id: string;
  scraper_name: string;
  scrapers?: string[];
  status: string;
  total_skus: number;
  completed_skus: number;
  failed_skus: number;
  created_at: string;
  runner_name: string | null;
}

// Job display type that supports both JobAssignment and RecentJob
interface JobDisplayItem {
  id: string;
  scrapers?: string[];
  scraper_name?: string;
  status: string;
  total_skus?: number;
  completed_skus?: number;
  failed_skus?: number;
  created_at: string;
  runner_name?: string | null;
}

interface ScraperDashboardClientProps {
  scrapers: ScraperSummary[];
  recentJobs: RecentJob[];
  healthCounts: {
    healthy: number;
    degraded: number;
    broken: number;
    unknown: number;
  };
  statusCounts: {
    active: number;
    draft: number;
    disabled: number;
  };
  runnerCount: number;
}

export function ScraperDashboardClient({
  scrapers,
  recentJobs: initialJobs,
  healthCounts,
  statusCounts,
}: ScraperDashboardClientProps) {
  // Realtime job subscription
  const {
    jobs: realtimeJobs,
    isConnected: isJobsConnected,
    refetch: refetchJobs,
  } = useJobSubscription({
    autoConnect: true,
    maxJobsPerStatus: 10,
  });

  // Realtime runner presence
  const {
    runners: realtimeRunners,
    isConnected: isRunnersConnected,
    getOnlineCount,
  } = useRunnerPresence({
    autoConnect: true,
  });

  const realtimeRunnerCount = Object.keys(realtimeRunners).length;
  const onlineRunnerCount = getOnlineCount();

  // Combine initial jobs with realtime jobs for display
  const displayJobs: JobDisplayItem[] = [
    ...(realtimeJobs.running || []).map(job => ({
      ...job,
      scraper_name: job.scrapers?.[0] || 'Unknown',
    })),
    ...(realtimeJobs.pending || []).slice(0, 5).map(job => ({
      ...job,
      scraper_name: job.scrapers?.[0] || 'Unknown',
    })),
    ...initialJobs.slice(0, 5),
  ].slice(0, 8);

  const totalScrapers = scrapers.length;
  const avgHealthScore = scrapers.length > 0
    ? Math.round(scrapers.reduce((sum, s) => sum + s.health_score, 0) / scrapers.length)
    : 0;

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'broken':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <HelpCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Realtime Status Banner */}
      <div className="flex items-center justify-between bg-muted rounded-lg px-4 py-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Jobs:</span>
            {isJobsConnected ? (
              <Badge variant="default" className="gap-1 text-xs">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Live
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                Offline
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Runners:</span>
            {isRunnersConnected ? (
              <Badge variant="default" className="gap-1 text-xs">
                <RefreshCw className="h-3 w-3 animate-pulse" />
                {onlineRunnerCount} online
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                Offline
              </Badge>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchJobs()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
            <BarChart3 className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Scraper Dashboard</h1>
            <p className="text-sm text-muted-foreground">Overview of all scrapers and test results</p>
          </div>
        </div>
        <Button asChild>
          <Link href="/admin/scrapers/configs">
            View All Scrapers
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/admin/scrapers/list">
          <Card className="hover:border-purple-400 transition-colors cursor-pointer h-full">
            <CardContent className="flex flex-col items-center justify-center p-4">
              <FileCode2 className="h-8 w-8 text-blue-600 mb-2" />
              <span className="font-medium">Scrapers</span>
              <span className="text-xs text-muted-foreground">List & Edit</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/scrapers/runs">
          <Card className="hover:border-purple-400 transition-colors cursor-pointer h-full">
            <CardContent className="flex flex-col items-center justify-center p-4">
              <History className="h-8 w-8 text-green-600 mb-2" />
              <span className="font-medium">Runs</span>
              <span className="text-xs text-muted-foreground">Job History</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/scrapers/network">
          <Card className="hover:border-purple-400 transition-colors cursor-pointer h-full">
            <CardContent className="flex flex-col items-center justify-center p-4">
              <Server className="h-8 w-8 text-orange-600 mb-2" />
              <span className="font-medium">Network</span>
              <span className="text-xs text-muted-foreground">{realtimeRunnerCount} Runners</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/scrapers/new">
          <Card className="hover:border-purple-400 transition-colors cursor-pointer h-full border-dashed">
            <CardContent className="flex flex-col items-center justify-center p-4">
              <Plus className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="font-medium">New</span>
              <span className="text-xs text-muted-foreground">Add Scraper</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Scrapers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalScrapers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {statusCounts.active} active, {statusCounts.draft} draft
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Avg Health Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{avgHealthScore}%</div>
            <div className="flex gap-2 mt-1">
              <span className="text-xs text-green-600">{healthCounts.healthy} healthy</span>
              <span className="text-xs text-yellow-600">{healthCounts.degraded} degraded</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Healthy Scrapers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <span className="text-3xl font-bold">{healthCounts.healthy}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Needs Attention</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <span className="text-3xl font-bold">{healthCounts.broken + healthCounts.degraded}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileCode2 className="h-4 w-4" />
              Scrapers by Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scrapers.slice(0, 10).map((scraper) => (
                <Link
                  key={scraper.id}
                  href={`/admin/scrapers/${scraper.name}`}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {getHealthIcon(scraper.health_status)}
                    <span className="font-medium">{scraper.display_name || scraper.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{scraper.health_score}%</span>
                    <Badge variant="outline" className="text-xs">
                      {scraper.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Jobs - Now with Realtime Updates */}
        <Card>
          <CardHeader>
            <CardTitle className="base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent Jobs
              {isJobsConnected && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Live
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {displayJobs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scraper</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayJobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">
                        {Array.isArray(job.scrapers) ? job.scrapers[0] : 'Unknown'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            job.status === 'completed'
                              ? 'success'
                              : job.status === 'failed'
                                ? 'destructive'
                                : job.status === 'running'
                                  ? 'warning'
                                  : 'secondary'
                          }
                        >
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(job.total_skus ?? 0) > 0 ? (
                          <>
                            {(job.completed_skus ?? 0)}/{job.total_skus}
                            {(job.failed_skus ?? 0) > 0 && (
                              <span className="text-red-600 ml-1">({job.failed_skus} failed)</span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(job.created_at), 'MMM d, h:mm a')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No recent jobs. Start a new scrape job to see activity here.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Search Metrics Dashboard */}
      <AISearchDashboard days={30} />
    </div>
  );
}
