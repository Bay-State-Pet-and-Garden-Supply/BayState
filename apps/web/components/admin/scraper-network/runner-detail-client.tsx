'use client';

import { useState } from 'react';
import { ArrowLeft, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
import { deleteRunner } from '@/app/admin/scrapers/network/actions';
import { RunnerManagementPanel } from './runner-management-panel';
import { RunnerMetadataEditor } from './runner-metadata-editor';
import { RunnerRunHistory } from './runner-run-history';
import { RunnerStatistics } from './runner-statistics';
import type { RunnerStatus, RunnerDetail } from './types';
import { cn } from '@/lib/utils';

interface RunnerDetailClientProps {
  runner: RunnerDetail;
  backHref?: string;
  isEmbedded?: boolean;
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

export function RunnerDetailClient({ runner, backHref, isEmbedded = false }: RunnerDetailClientProps) {
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const accessBadgeVariant: 'default' | 'destructive' = runner.enabled ? 'default' : 'destructive';

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
        if (!isEmbedded) {
          router.push('/admin/scrapers/network');
        } else {
          router.refresh();
        }
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
    <div className={cn("space-y-6", isEmbedded && "space-y-4")}>
      {/* Header with back button - only if not embedded */}
      {!isEmbedded && (
        <div className="flex items-center gap-4">
          {backHref && (
            <Button variant="ghost" size="icon" asChild>
              <Link href={backHref}>
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Back to runners</span>
              </Link>
            </Button>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">{runner.name}</h1>
            <p className="text-sm text-muted-foreground">Runner ID: {runner.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusVariants[runner.status]}>
              {statusLabels[runner.status]}
            </Badge>
            <Badge variant={accessBadgeVariant}>
              {runner.enabled ? 'Enabled' : 'Disabled'}
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
      )}

      {/* Embedded Header - just badges and delete button */}
      {isEmbedded && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={statusVariants[runner.status]}>
              {statusLabels[runner.status]}
            </Badge>
            <Badge variant={accessBadgeVariant}>
              {runner.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
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
      )}

      {/* Quick Stats */}
      <div className={cn(
        "grid gap-6 md:grid-cols-2 lg:grid-cols-4",
        isEmbedded && "grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4"
      )}>
        {/* Status Card */}
        <Card className={cn(isEmbedded && "border-2 border-zinc-900 shadow-[4px_4px_0px_rgba(0,0,0,1)] rounded-none")}>
          <CardHeader className={cn(isEmbedded && "pb-2")}>
            <CardTitle className={cn("text-sm font-medium", isEmbedded && "text-xs font-black uppercase tracking-tighter")}>
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant={statusVariants[runner.status]}>
                {statusLabels[runner.status]}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {runner.enabled
                ? `${runner.active_jobs} active job${runner.active_jobs !== 1 ? 's' : ''}`
                : 'Job pickup disabled'}
            </p>
          </CardContent>
        </Card>

        {/* Last Seen Card */}
        <Card className={cn(isEmbedded && "border-2 border-zinc-900 shadow-[4px_4px_0px_rgba(0,0,0,1)] rounded-none")}>
          <CardHeader className={cn(isEmbedded && "pb-2")}>
            <CardTitle className={cn("text-sm font-medium", isEmbedded && "text-xs font-black uppercase tracking-tighter")}>
              Last Seen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-mono">{formatLastSeen(runner.last_seen_at)}</p>
          </CardContent>
        </Card>

        {/* Region Card */}
        <Card className={cn(isEmbedded && "border-2 border-zinc-900 shadow-[4px_4px_0px_rgba(0,0,0,1)] rounded-none")}>
          <CardHeader className={cn(isEmbedded && "pb-2")}>
            <CardTitle className={cn("text-sm font-medium", isEmbedded && "text-xs font-black uppercase tracking-tighter")}>
              Region
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-mono">{runner.region ?? 'Unknown'}</p>
          </CardContent>
        </Card>

        {/* Version Card */}
        <Card className={cn(
          isEmbedded && "border-2 border-zinc-900 shadow-[4px_4px_0px_rgba(0,0,0,1)] rounded-none",
          (runner.build_check_reason === 'outdated' || runner.build_check_reason === 'missing') ? 'border-destructive/50 bg-destructive/5' : ''
        )}>
          <CardHeader className={cn("pb-2", isEmbedded && "pb-2")}>
            <CardTitle className={cn(
              "text-sm font-medium flex items-center justify-between",
              isEmbedded && "text-xs font-black uppercase tracking-tighter"
            )}>
              Version
              {runner.build_check_reason === 'current' ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : runner.build_check_reason === 'outdated' || runner.build_check_reason === 'missing' ? (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-mono truncate">{runner.version ?? 'Unknown'}</p>
              {runner.build_check_reason === 'outdated' && (
                <>
                  <p className="text-[10px] text-destructive font-medium uppercase mt-1">Update Required</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Latest: <span className="font-mono">{runner.latest_build_sha || runner.latest_build_id || 'Unknown'}</span>
                  </p>
                </>
              )}
              {runner.build_check_reason === 'missing' && (
                <p className="text-[10px] text-destructive font-medium uppercase mt-1">Missing Version Info</p>
              )}
              {runner.build_check_reason === 'current' && (
                <p className="text-[10px] text-success font-medium uppercase mt-1">Up to date</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for detailed sections */}
      <Tabs defaultValue="runs" className="space-y-4">
        <TabsList variant="line" className={cn(isEmbedded && "w-full justify-start border-b border-zinc-200 rounded-none")}>
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
                Type <code className="bg-muted px-1 rounded">{runner.name}</code> to confirm
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
