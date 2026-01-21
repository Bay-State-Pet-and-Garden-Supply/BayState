import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, Play, Clock, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { getScraperRunById, getScraperRunLogs } from '../actions';
import { LogViewer } from '@/components/admin/scrapers/LogViewer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Run ${id.slice(0, 8)}... | Scraper Runs`,
    description: 'View scraper execution details',
  };
}

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-700', icon: Clock },
  claimed: { label: 'Claimed', color: 'bg-blue-100 text-blue-700', icon: Clock },
  running: { label: 'Running', color: 'bg-yellow-100 text-yellow-700', icon: Play },
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

function formatDuration(createdAt: string | null, completedAt: string | null): string {
  if (!createdAt) return '-';
  const start = new Date(createdAt);
  const end = completedAt ? new Date(completedAt) : new Date();
  const seconds = Math.round((end.getTime() - start.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

export default async function ScraperRunDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [run, logs] = await Promise.all([
    getScraperRunById(id),
    getScraperRunLogs(id),
  ]);

  if (!run) {
    notFound();
  }

  return (
    <div className="space-y-4">
      {/* Compact Header Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/admin/scrapers/runs">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Runs
            </Link>
          </Button>
          <div className="h-6 w-px bg-gray-200" />
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100">
              <Play className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 capitalize leading-tight">
                {run.scraper_name || 'Unknown Scraper'}
              </h1>
              <p className="text-xs text-gray-500 font-mono">{run.id.slice(0, 8)}...{run.id.slice(-4)}</p>
            </div>
          </div>
          <div className="h-6 w-px bg-gray-200" />
          <StatusBadge status={run.status} />
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <span className="text-gray-500">SKUs:</span>
            <span className="font-medium">{run.total_skus.toLocaleString()}</span>
            {run.failed_skus > 0 && <span className="text-red-600">({run.failed_skus} failed)</span>}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Duration:</span>
            <span className="font-medium">{formatDuration(run.created_at, run.completed_at)}</span>
          </div>
          <div className="flex items-center gap-1 text-gray-500">
            <span>Created:</span>
            <span className="font-medium">
              {run.created_at ? format(new Date(run.created_at), 'MMM d, h:mm a') : '-'}
            </span>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {run.error_message && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-800">Error</p>
          <p className="text-sm text-red-700 font-mono mt-1">{run.error_message}</p>
        </div>
      )}

      {/* Test Mode Badge */}
      {run.test_mode && (
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-3">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-700">
            This was a test run - products were not saved to the database.
          </span>
        </div>
      )}

      {/* Execution Logs - Main Content */}
      <LogViewer logs={logs} />
    </div>
  );
}
