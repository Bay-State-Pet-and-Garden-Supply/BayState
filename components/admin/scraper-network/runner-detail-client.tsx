'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { RunnerManagementPanel } from './runner-management-panel';
import { RunnerMetadataEditor } from './runner-metadata-editor';
import { RunnerRunHistory } from './runner-run-history';
import { RunnerStatistics } from './runner-statistics';

export type RunnerStatus = 'online' | 'offline' | 'busy' | 'idle' | 'polling' | 'paused';

export interface RunnerDetail {
  id: string;
  name: string;
  status: RunnerStatus;
  last_seen_at: string | null;
  active_jobs: number;
  region: string | null;
  version: string | null;
  metadata: Record<string, unknown> | null;
}

interface RunnerDetailClientProps {
  runner: RunnerDetail;
  backHref: string;
}

const statusVariants: Record<RunnerStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  online: 'success',
  busy: 'warning',
  idle: 'secondary',
  offline: 'destructive',
  polling: 'default',
  paused: 'secondary',
};

const statusLabels: Record<RunnerStatus, string> = {
  online: 'Online',
  busy: 'Busy',
  idle: 'Idle',
  offline: 'Offline',
  polling: 'Polling',
  paused: 'Paused',
};

function formatLastSeen(isoString: string | null): string {
  if (!isoString) return 'Never';
  const date = new Date(isoString);
  return date.toLocaleString();
}

export function RunnerDetailClient({ runner, backHref }: RunnerDetailClientProps) {
  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back to runners</span>
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{runner.name}</h1>
          <p className="text-sm text-gray-500">Runner ID: {runner.id}</p>
        </div>
        <Badge variant={statusVariants[runner.status]}>
          {statusLabels[runner.status]}
        </Badge>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant={statusVariants[runner.status]}>
                {statusLabels[runner.status]}
              </Badge>
              <span className="text-sm text-gray-500">
                {runner.active_jobs} active job{runner.active_jobs !== 1 ? 's' : ''}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Last Seen Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Last Seen</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{formatLastSeen(runner.last_seen_at)}</p>
          </CardContent>
        </Card>

        {/* Region Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Region</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{runner.region ?? 'Unknown'}</p>
          </CardContent>
        </Card>

        {/* Version Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Version</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{runner.version ?? 'Unknown'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for detailed sections */}
      <Tabs defaultValue="runs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="runs">Run History</TabsTrigger>
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
          <TabsTrigger value="manage">Manage</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
        </TabsList>

        <TabsContent value="runs">
          <RunnerRunHistory runnerId={runner.id} runnerName={runner.name} />
        </TabsContent>

        <TabsContent value="statistics">
          <RunnerStatistics
            runnerId={runner.id}
            runnerName={runner.name}
            stats={{
              totalRuns: 0,
              successRate: 0,
              avgDuration: 0,
              lastSeen: runner.last_seen_at || '',
              lastSeenRelative: formatLastSeen(runner.last_seen_at),
            }}
          />
        </TabsContent>

        <TabsContent value="manage">
          <RunnerManagementPanel runner={runner} />
        </TabsContent>

        <TabsContent value="metadata">
          <RunnerMetadataEditor runner={runner} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
