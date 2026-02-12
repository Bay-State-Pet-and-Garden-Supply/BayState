'use client';

import { useState } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { deleteRunner } from '@/app/admin/scrapers/network/[id]/actions';
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
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (deleteConfirmName !== runner.name) {
      toast.error('Runner name does not match');
      return;
    }

    setIsDeleting(true);
    try {
      const result = await deleteRunner(runner.id);
      if (result.success) {
        toast.success('Runner deleted successfully');
        router.push('/admin/scrapers/network');
      } else {
        toast.error(result.error || 'Failed to delete runner');
        setIsDeleting(false);
      }
    } catch {
      toast.error('An error occurred while deleting the runner');
      setIsDeleting(false);
    }
  };

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
        <div className="flex items-center gap-2">
          <Badge variant={statusVariants[runner.status]}>
            {statusLabels[runner.status]}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Delete Runner
            </DialogTitle>
            <DialogDescription>
              This will permanently delete runner &quot;{runner.name}&quot; and all associated API keys.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
              <strong>Warning:</strong> All API keys for this runner will be revoked immediately.
              Any running jobs will be affected.
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Type <code className="bg-gray-100 px-1 rounded">{runner.name}</code> to confirm
              </label>
              <Input
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={runner.name}
                disabled={isDeleting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteConfirmName !== runner.name || isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Runner'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
