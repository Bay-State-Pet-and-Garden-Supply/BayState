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

interface ScraperSummary {
  id: string;
  name: string;
  display_name: string | null;
  status: string;
  health_status: string;
  health_score: number;
  last_test_at: string | null;
}

interface TestRun {
  id: string;
  scraper_id: string;
  test_type: string;
  status: string;
  created_at: string;
  duration_ms: number | null;
}

interface ScraperDashboardClientProps {
  scrapers: ScraperSummary[];
  recentTests: TestRun[];
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
}

export function ScraperDashboardClient({
  scrapers,
  recentTests,
  healthCounts,
  statusCounts,
}: ScraperDashboardClientProps) {
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
        return <HelpCircle className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      passed: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
      partial: 'bg-yellow-100 text-yellow-700',
      running: 'bg-blue-100 text-blue-700',
      pending: 'bg-gray-100 text-gray-700',
    };
    return (
      <Badge variant="outline" className={colors[status] || colors.pending}>
        {status}
      </Badge>
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
            <BarChart3 className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scraper Dashboard</h1>
            <p className="text-sm text-gray-600">Overview of all scrapers and test results</p>
          </div>
        </div>
        <Button asChild>
          <Link href="/admin/scrapers">View All Scrapers</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Total Scrapers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalScrapers}</div>
            <p className="text-xs text-gray-600 mt-1">
              {statusCounts.active} active, {statusCounts.draft} draft
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Avg Health Score</CardTitle>
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
            <CardTitle className="text-sm text-gray-600">Healthy Scrapers</CardTitle>
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
            <CardTitle className="text-sm text-gray-600">Needs Attention</CardTitle>
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
                  href={`/admin/scrapers/${scraper.id}`}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {getHealthIcon(scraper.health_status)}
                    <span className="font-medium">{scraper.display_name || scraper.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">{scraper.health_score}%</span>
                    <Badge variant="outline" className="text-xs">
                      {scraper.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent Test Runs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTests.slice(0, 8).map((test) => (
                  <TableRow key={test.id}>
                    <TableCell className="text-sm">
                      {format(new Date(test.created_at), 'MMM d, h:mm a')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {test.test_type}
                      </Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(test.status)}</TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {test.duration_ms ? `${(test.duration_ms / 1000).toFixed(1)}s` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
