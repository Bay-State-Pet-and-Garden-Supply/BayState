'use client';

import { useState, useTransition } from 'react';
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
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DataTable,
  Column,
} from '@/components/admin/data-table';
import { ScraperRunRecord } from '@/lib/admin/scrapers/runs-types';
import { cancelScraperRun, retryScraperRun } from '@/app/admin/scrapers/runs/actions';

interface ScraperRunsClientProps {
  initialRuns: ScraperRunRecord[];
  totalCount: number;
}

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-700', icon: Clock },
  claimed: { label: 'Claimed', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
  running: { label: 'Running', color: 'bg-yellow-100 text-yellow-700', icon: Loader2 },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-700', icon: XCircle },
} as const;

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as keyof typeof statusConfig];
  const Icon = config?.icon || Clock;

  return (
    <Badge className={config?.color || 'bg-gray-100 text-gray-700'}>
      <Icon className="mr-1 h-3 w-3" />
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

  const columns: Column<ScraperRunRecord>[] = [
    {
      key: 'id',
      header: 'Job ID',
      sortable: true,
      searchable: true,
      render: (value) => (
        <span className="font-mono text-xs text-muted-foreground">
          {String(value).slice(0, 8)}...
        </span>
      ),
    },
    {
      key: 'scraper_name',
      header: 'Scraper',
      sortable: true,
      searchable: true,
      render: (value) => (
        <span className="font-medium capitalize">
          {String(value)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (_, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'total_skus',
      header: 'SKUs',
      sortable: true,
      render: (value, row) => {
        const completed = row.completed_skus || 0;
        const failed = row.failed_skus || 0;
        const total = Number(value) || 0;
        return (
          <span className="text-sm">
            {completed}/{total}
            {failed > 0 && <span className="text-red-600"> ({failed} failed)</span>}
          </span>
        );
      },
    },
    {
      key: 'items_found',
      header: 'Items',
      sortable: true,
      render: (value) => Number(value).toLocaleString(),
    },
    {
      key: 'created_at',
      header: 'Started',
      sortable: true,
      render: (value) => (
        <span className="text-sm text-muted-foreground">
          {value ? format(new Date(String(value)), 'MMM d, h:mm a') : '-'}
        </span>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      sortable: false,
      render: (_, row) => {
        if (!row.created_at) return '-';
        const start = new Date(row.created_at);
        const end = row.completed_at ? new Date(row.completed_at) : new Date();
        const seconds = Math.round((end.getTime() - start.getTime()) / 1000);
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
        return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
      },
    },
  ];

  const actions = (run: ScraperRunRecord) => (
    <div className="flex items-center gap-1">
      {run.status === 'pending' || run.status === 'claimed' || run.status === 'running' ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setCancelTarget(run);
          }}
          disabled={isPending}
        >
          <XCircle className="h-4 w-4" />
        </Button>
      ) : null}
      {run.status === 'failed' || run.status === 'cancelled' || run.status === 'completed' ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setRetryTarget(run);
          }}
          disabled={isPending}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      ) : null}
      {run.status === 'completed' && (
        <Button
          variant="ghost"
          size="sm"
          asChild
        >
          <a href={`/admin/scrapers/runs/${run.id}`}>
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      )}
    </div>
  );

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
            <Play className="h-5 w-5 text-purple-600" />
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
            <a href="/admin/scraper-network">
              <Play className="mr-2 h-4 w-4" />
              Runner Network
            </a>
          </Button>
          <Button variant="outline" onClick={() => router.refresh()} disabled={isPending}>
            <RotateCcw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="flex gap-4 overflow-x-auto pb-1">
        <div className="flex-shrink-0 rounded-lg bg-gray-50 p-4 w-28">
          <p className="text-sm text-gray-600">Total Jobs</p>
          <p className="text-2xl font-bold">{totalCount}</p>
        </div>
        <div className="flex-shrink-0 rounded-lg bg-yellow-50 p-4 w-28">
          <p className="text-sm text-yellow-700">Running</p>
          <p className="text-2xl font-bold text-yellow-700">
            {runs.filter((r) => r.status === 'running').length}
          </p>
        </div>
        <div className="flex-shrink-0 rounded-lg bg-green-50 p-4 w-28">
          <p className="text-sm text-green-700">Completed</p>
          <p className="text-2xl font-bold text-green-700">
            {runs.filter((r) => r.status === 'completed').length}
          </p>
        </div>
        <div className="flex-shrink-0 rounded-lg bg-red-50 p-4 w-28">
          <p className="text-sm text-red-700">Failed</p>
          <p className="text-2xl font-bold text-red-700">
            {runs.filter((r) => r.status === 'failed').length}
          </p>
        </div>
      </div>

      {/* Runs Table */}
      <DataTable
        data={runs}
        columns={columns}
        searchPlaceholder="Search runs..."
        pageSize={25}
        actions={actions}
        emptyMessage="No scraper runs found."
      />

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
