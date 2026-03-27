import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  Package,
  Boxes,
} from 'lucide-react';

import { getScraperRunById, getScraperRunLogs } from '../actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogViewer } from '@/components/admin/scrapers/LogViewer';
import { progressUpdateFromJobRecord } from '@/lib/scraper-logs';

export const metadata: Metadata = {
  title: 'Run Details | Admin',
  description: 'Detailed status and logs for a scraper run',
};

type RunDetailPageProps = {
  params: Promise<{ id: string }>;
};

const statusConfig = {
  pending: { label: 'Pending', variant: 'secondary' as const, icon: Clock },
  claimed: { label: 'Claimed', variant: 'secondary' as const, icon: Loader2 },
  running: { label: 'Running', variant: 'default' as const, icon: Loader2 },
  completed: { label: 'Completed', variant: 'default' as const, icon: CheckCircle2 },
  failed: { label: 'Failed', variant: 'destructive' as const, icon: AlertCircle },
  cancelled: { label: 'Cancelled', variant: 'secondary' as const, icon: XCircle },
} as const;

function formatDuration(createdAt: string, completedAt: string | null): string {
  const start = new Date(createdAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  if (totalSeconds < 3600) {
    return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export default async function RunDetailsPage({ params }: RunDetailPageProps) {
  const { id } = await params;

  const [run, logs] = await Promise.all([getScraperRunById(id), getScraperRunLogs(id)]);

  if (!run) {
    notFound();
  }

  const status = run.status.toLowerCase();
  const config = statusConfig[status as keyof typeof statusConfig] ?? statusConfig.pending;
  const StatusIcon = config.icon;
  const initialProgress = progressUpdateFromJobRecord(run);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/admin/scrapers/runs" className="hover:text-foreground">
              Scraper Runs
            </Link>
            <span>/</span>
            <span className="font-mono">{run.id.slice(0, 8)}...</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[#66161D]">Run Details</h1>
          <p className="text-sm text-muted-foreground">
            Inspect status, metadata, and live logs for this scrape job.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin/scrapers/runs">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Runs
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Job Status
            <Badge variant={config.variant} className="gap-1">
              <StatusIcon className={`h-3 w-3 ${status === 'running' || status === 'claimed' ? 'animate-spin' : ''}`} />
              {config.label}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Run ID</p>
            <p className="font-mono text-xs break-all">{run.id}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Scraper</p>
            <p className="capitalize">{run.scraper_name}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Started</p>
            <p>{format(new Date(run.created_at), 'MMM d, yyyy h:mm:ss a')}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Duration</p>
            <p>{formatDuration(run.created_at, run.completed_at)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Runner</p>
            <p>{run.runner_name || 'Unassigned'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Current Activity</p>
            <p>
              {initialProgress?.phase || run.progress_phase || 'Waiting for activity'}
              {initialProgress?.current_sku ? ` • ${initialProgress.current_sku}` : ''}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total SKUs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-3xl font-bold">
              <Package className="h-6 w-6 text-muted-foreground" />
              {run.total_skus}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Items Found</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-3xl font-bold">
              <Boxes className="h-6 w-6 text-muted-foreground" />
              {run.items_found}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Completed At</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {run.completed_at ? format(new Date(run.completed_at), 'MMM d, yyyy h:mm:ss a') : 'Still running'}
            </p>
          </CardContent>
        </Card>
      </div>

      {run.error_message ? (
        <Card className="border-destructive/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-destructive text-base">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">{run.error_message}</p>
          </CardContent>
        </Card>
      ) : null}

      <LogViewer jobId={run.id} logs={logs} initialProgress={initialProgress} />
    </div>
  );
}
