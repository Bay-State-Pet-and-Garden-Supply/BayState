'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Play,
  RotateCcw,
  XCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  History,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScraperRunRecord } from '@/lib/admin/scrapers/runs-types';
import { cancelScraperRun, retryScraperRun } from '@/app/admin/scrapers/runs/actions';

interface ScraperRunsClientProps {
  initialRuns: ScraperRunRecord[];
  totalCount: number;
}

const statusConfig = {
  pending: { label: 'Pending', variant: 'secondary' as const, icon: Clock },
  claimed: { label: 'Claimed', variant: 'secondary' as const, icon: Loader2 },
  running: { label: 'Running', variant: 'default' as const, icon: Loader2 },
  completed: { label: 'Completed', variant: 'default' as const, icon: CheckCircle2 },
  failed: { label: 'Failed', variant: 'destructive' as const, icon: AlertCircle },
  cancelled: { label: 'Cancelled', variant: 'secondary' as const, icon: XCircle },
} as const;

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as keyof typeof statusConfig];
  const Icon = config?.icon || Clock;

  return (
    <Badge variant={config?.variant || 'secondary'} className="gap-1">
      <Icon className="h-3 w-3" />
      {config?.label || status}
    </Badge>
  );
}

export function ScraperRunsClient({ initialRuns, totalCount }: ScraperRunsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [runs] = useState<ScraperRunRecord[]>(initialRuns);
  const [retryTarget, setRetryTarget] = useState<ScraperRunRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ScraperRunRecord | null>(null);

  const runningCount = runs.filter((r) => r.status === 'running').length;
  const completedCount = runs.filter((r) => r.status === 'completed').length;
  const failedCount = runs.filter((r) => r.status === 'failed').length;

  const handleRetry = async () => {
    if (!retryTarget) return;

    startTransition(async () => {
      const result = await retryScraperRun(retryTarget.id);
      if (result.success) {
        toast.success('Job queued for retry');
        setRetryTarget(null);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to retry job');
      }
    });
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;

    startTransition(async () => {
      const result = await cancelScraperRun(cancelTarget.id);
      if (result.success) {
        toast.success('Job cancelled');
        setCancelTarget(null);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to cancel job');
      }
    });
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
            <History className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scraper Runs</h1>
            <p className="text-sm text-gray-600">
              {totalCount} scrape job{totalCount !== 1 ? 's' : ''} execution history
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/scrapers/network">
              <Play className="mr-2 h-4 w-4" />
              Runner Network
            </Link>
          </Button>
          <Button variant="outline" onClick={() => router.refresh()} disabled={isPending}>
            <RotateCcw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Total Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Running</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{runningCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{completedCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{failedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Runs Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job ID</TableHead>
                <TableHead>Scraper</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>SKUs</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-600">
                    No scraper runs found.
                  </TableCell>
                </TableRow>
              ) : (
                runs.map((run) => {
                  const duration = !run.created_at
                    ? '-'
                    : (() => {
                        const start = new Date(run.created_at);
                        const end = run.completed_at ? new Date(run.completed_at) : new Date();
                        const seconds = Math.round((end.getTime() - start.getTime()) / 1000);
                        if (seconds < 60) return `${seconds}s`;
                        if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
                        return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
                      })();

                  return (
                    <TableRow key={run.id}>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {run.id.slice(0, 8)}...
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium capitalize">{run.scraper_name}</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={run.status} />
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {run.completed_skus || 0}/{run.total_skus}
                          {(run.failed_skus || 0) > 0 && (
                            <span className="text-red-600"> ({run.failed_skus} failed)</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>{run.items_found?.toLocaleString() || 0}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {run.created_at ? format(new Date(run.created_at), 'MMM d, h:mm a') : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{duration}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {run.status === 'pending' || run.status === 'claimed' || run.status === 'running' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setCancelTarget(run)}
                              disabled={isPending}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {run.status === 'failed' || run.status === 'cancelled' || run.status === 'completed' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRetryTarget(run)}
                              disabled={isPending}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {run.status === 'completed' && (
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/admin/scrapers/runs/${run.id}`}>
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Retry Confirmation Dialog */}
      <Dialog open={!!retryTarget} onOpenChange={(open) => !open && setRetryTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retry Scraping Job</DialogTitle>
            <DialogDescription>
              Are you sure you want to retry this job? A new job will be created with the same parameters.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {retryTarget && (
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <p><strong>Job ID:</strong> {retryTarget.id.slice(0, 8)}...</p>
                <p><strong>Scraper:</strong> {retryTarget.scraper_name}</p>
                <p><strong>SKUs:</strong> {retryTarget.total_skus}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetryTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRetry} disabled={isPending}>
              {isPending ? 'Queuing...' : 'Retry Job'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Scraping Job</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this job? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {cancelTarget && (
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <p><strong>Job ID:</strong> {cancelTarget.id.slice(0, 8)}...</p>
                <p><strong>Scraper:</strong> {cancelTarget.scraper_name}</p>
                <p><strong>Status:</strong> {cancelTarget.status}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Keep Running
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isPending}>
              {isPending ? 'Cancelling...' : 'Cancel Job'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
