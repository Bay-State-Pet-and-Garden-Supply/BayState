"use client";

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Copy,
  Key,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  Cpu,
  Terminal as TerminalIcon,
  XOctagon,
  Clock,
  Loader2,
} from 'lucide-react';
import { useRunnerPresence } from '@/lib/realtime/useRunnerPresence';
import { useJobSubscription } from '@/lib/realtime/useJobSubscription';
import { useAttemptsSubscription } from '@/lib/realtime/useAttemptsSubscription';
import { createClient } from '@/lib/supabase/client';
import { adminFetch } from '@/lib/admin/api-client';
import {
  deleteRunner,
  disableRunner,
  enableRunner,
  renameRunner,
  rotateRunnerKey,
} from '@/app/admin/pipeline/runners/actions';
import { AdminControlBar } from '@/components/admin/admin-control-bar';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from '@/components/admin/admin-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RunnerDetailDrawer } from '@/components/admin/scraper-network/runner-detail-drawer';
import { JobConsoleDrawer } from '@/components/admin/scraper-console/JobConsoleDrawer';
import type { RunnerDetail, RunnerStatus } from '@/components/admin/scraper-network/types';
import { cn } from '@/lib/utils';

interface NetworkStats {
  totalRunners: number;
  online: number;
  busy: number;
  idle: number;
  offline: number;
  disabled: number;
}

type RunnerFilter = 'all' | 'connected' | 'busy' | 'offline' | 'disabled';

const installCommand =
  'curl -fsSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayState/refs/heads/master/apps/scraper/get.sh | bash';

const statusBadgeVariant: Record<RunnerStatus, 'success' | 'warning' | 'outline' | 'destructive' | 'secondary'> = {
  online: 'success',
  busy: 'warning',
  idle: 'outline',
  offline: 'destructive',
  polling: 'outline',
  paused: 'secondary',
};

const statusLabel: Record<RunnerStatus, string> = {
  online: 'Online',
  busy: 'Busy',
  idle: 'Idle',
  offline: 'Offline',
  polling: 'Polling',
  paused: 'Paused',
};

const statusOrder: Record<RunnerStatus, number> = {
  busy: 0,
  online: 1,
  polling: 2,
  idle: 3,
  paused: 4,
  offline: 5,
};

function formatLastSeen(value: string | null) {
  if (!value) return 'Never';

  const timestamp = new Date(value).getTime();
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

  return new Date(value).toLocaleDateString();
}

function isConnectedStatus(status: RunnerStatus) {
  return status !== 'offline';
}

function needsAttention(runner: RunnerDetail) {
  return (
    !runner.enabled ||
    runner.status === 'offline' ||
    runner.build_check_reason === 'outdated' ||
    runner.build_check_reason === 'missing'
  );
}

function formatAttemptDuration(startedAt: string | null, completedAt: string | null, status: string) {
  if (!startedAt) return 'Pending';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const diffSec = Math.max(0, Math.floor((end - start) / 1000));

  if (status === 'running') {
    return `${diffSec}s (running)`;
  }
  return `${diffSec}s`;
}

export function ScraperNetworkDashboard() {
  const { runners, isConnected: isRealtimeConnected, connect } = useRunnerPresence({
    autoConnect: true,
  });

  const { jobs, counts: queueCounts, getJob } = useJobSubscription();

  const [stats, setStats] = useState<NetworkStats>({
    totalRunners: 0,
    online: 0,
    busy: 0,
    idle: 0,
    offline: 0,
    disabled: 0,
  });
  const [selectedRunnerId, setSelectedRunnerId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);

  // Custom confirmation and rename states
  const [rotateKeyRunnerId, setRotateKeyRunnerId] = useState<string | null>(null);
  const [deleteRunnerId, setDeleteRunnerId] = useState<string | null>(null);
  const [cancelJobId, setCancelJobId] = useState<string | null>(null);
  const [renameRunnerId, setRenameRunnerId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');
  const [retryingSkus, setRetryingSkus] = useState<Record<string, boolean>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dbJob, setDbJob] = useState<any>(null);
  const [enabledOverrides, setEnabledOverrides] = useState<Record<string, boolean>>({});
  const [showAddRunnerModal, setShowAddRunnerModal] = useState(false);
  const [newRunnerName, setNewRunnerName] = useState('');
  const [newRunnerDescription, setNewRunnerDescription] = useState('');
  const [isCreatingRunner, setIsCreatingRunner] = useState(false);
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [createdRunnerName, setCreatedRunnerName] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [runnerFilter, setRunnerFilter] = useState<RunnerFilter>('all');

  useEffect(() => {
    const runnersArray = Object.values(runners);
    const idleCount = runnersArray.filter((runner) => runner.status === 'idle').length;
    const onlineCount = runnersArray.filter((runner) => runner.status === 'online').length;
    const busyCount = runnersArray.filter((runner) => runner.status === 'busy').length;
    const offlineCount = runnersArray.filter((runner) => runner.status === 'offline').length;
    const disabledCount = runnersArray.filter((runner) => runner.enabled === false).length;

    setStats({
      totalRunners: runnersArray.length,
      online: onlineCount + idleCount,
      busy: busyCount,
      idle: idleCount,
      offline: offlineCount,
      disabled: disabledCount,
    });
  }, [runners]);

  const runnersArray = useMemo(
    () =>
      Object.values(runners)
        .map(
          (runner): RunnerDetail => ({
            id: runner.runner_id,
            name: runner.runner_name,
            status: runner.status as RunnerStatus,
            enabled: enabledOverrides[runner.runner_id] ?? runner.enabled ?? true,
            last_seen_at: runner.last_seen,
            active_jobs: runner.active_jobs,
            version: runner.version || null,
            build_check_reason: runner.build_check_reason || null,
            metadata: runner.metadata || null,
          }),
        )
        .sort((a, b) => {
          const statusDiff = statusOrder[a.status] - statusOrder[b.status];
          if (statusDiff !== 0) return statusDiff;
          return a.name.localeCompare(b.name);
        }),
    [enabledOverrides, runners],
  );

  const filteredRunners = useMemo(() => {
    return runnersArray.filter((runner) => {
      const searchMatches =
        search.trim() === '' ||
        runner.name.toLowerCase().includes(search.toLowerCase()) ||
        runner.id.toLowerCase().includes(search.toLowerCase());

      if (!searchMatches) return false;

      switch (runnerFilter) {
        case 'connected':
          return isConnectedStatus(runner.status);
        case 'busy':
          return runner.status === 'busy';
        case 'offline':
          return runner.status === 'offline';
        case 'disabled':
          return !runner.enabled;
        default:
          return true;
      }
    });
  }, [runnerFilter, runnersArray, search]);

  const attentionCount = useMemo(
    () => runnersArray.filter((runner) => needsAttention(runner)).length,
    [runnersArray],
  );

  const selectedRunner = useMemo(() => {
    return runnersArray.find((r) => r.id === selectedRunnerId);
  }, [runnersArray, selectedRunnerId]);

  const activeJobId = useMemo(() => {
    return (selectedRunner?.metadata?.current_job_id as string) || null;
  }, [selectedRunner]);

  const { attempts: skuAttempts } = useAttemptsSubscription({
    jobId: activeJobId,
  });

  useEffect(() => {
    if (!activeJobId) {
      setDbJob(null);
      return;
    }

    const localJob = getJob(activeJobId);
    if (localJob) {
      setDbJob(localJob);
      return;
    }

    const fetchJob = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('enrichment_jobs')
        .select('*')
        .eq('id', activeJobId)
        .single();
      if (!error && data) {
        setDbJob(data);
      }
    };
    void fetchJob();
  }, [activeJobId, getJob]);

  const activeJob = useMemo(() => {
    return (activeJobId ? getJob(activeJobId) : null) || dbJob;
  }, [activeJobId, getJob, dbJob]);

  const allJobsList = useMemo(() => {
    return [
      ...jobs.running,
      ...jobs.queued,
      ...jobs.pending,
      ...jobs.completed,
      ...jobs.failed,
      ...jobs.cancelled,
    ]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [jobs]);

  const handleOpenDrawer = (runnerId: string) => {
    setSelectedRunnerId(runnerId);
    setIsDrawerOpen(true);
  };

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    const previousValue = runnersArray.find((runner) => runner.id === id)?.enabled ?? !enabled;
    setEnabledOverrides((current) => ({ ...current, [id]: enabled }));

    const action = enabled ? enableRunner : disableRunner;
    const result = await action(id);

    if (!result.success) {
      setEnabledOverrides((current) => ({ ...current, [id]: previousValue }));
      toast.error(result.error || `We couldn't ${enabled ? 'enable' : 'disable'} this runner.`);
      throw new Error(result.error);
    }

    toast.success(`Runner ${enabled ? 'enabled' : 'disabled'}.`);
  };

  const handleRotateApiKey = (id: string) => {
    setRotateKeyRunnerId(id);
  };

  const confirmRotateApiKey = async () => {
    if (!rotateKeyRunnerId) return;
    const id = rotateKeyRunnerId;
    setRotateKeyRunnerId(null);

    const result = await rotateRunnerKey(id);
    if (result.success && result.key) {
      await navigator.clipboard.writeText(result.key);
      toast.success('New API key copied to clipboard.');
      return;
    }

    toast.error(result.error || 'We could not rotate the API key.');
  };

  const handleRename = (id: string) => {
    setRenameRunnerId(id);
    setRenameValue(runnersArray.find((r) => r.id === id)?.name || id);
  };

  const confirmRenameRunner = async () => {
    if (!renameRunnerId || !renameValue.trim() || renameValue === renameRunnerId) {
      setRenameRunnerId(null);
      return;
    }
    const id = renameRunnerId;
    const nextName = renameValue.trim();
    setRenameRunnerId(null);

    const result = await renameRunner(id, nextName);
    if (result.success) {
      toast.success('Runner name updated.');
      return;
    }

    toast.error(result.error || 'We could not rename this runner.');
  };

  const handleDelete = (id: string) => {
    setDeleteRunnerId(id);
  };

  const confirmDeleteRunner = async () => {
    if (!deleteRunnerId) return;
    const id = deleteRunnerId;
    setDeleteRunnerId(null);

    const result = await deleteRunner(id);
    if (result.success) {
      toast.success('Runner deleted.');
      if (selectedRunnerId === id) {
        setSelectedRunnerId(null);
      }
      return;
    }

    toast.error(result.error || 'We could not delete this runner.');
  };

  const handleCreateRunner = async () => {
    if (!newRunnerName.trim()) {
      toast.error('Please enter a runner name.');
      return;
    }

    setIsCreatingRunner(true);
    try {
      const response = await adminFetch('/api/admin/runners/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runner_name: newRunnerName.trim(),
          description: newRunnerDescription.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create runner');
      }

      const data = await response.json();
      setCreatedApiKey(data.api_key);
      setCreatedRunnerName(data.runner_name);
      toast.success(`Runner "${data.runner_name}" created.`);
      setNewRunnerName('');
      setNewRunnerDescription('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create runner.');
    } finally {
      setIsCreatingRunner(false);
    }
  };

  const handleCloseModal = () => {
    setShowAddRunnerModal(false);
    setCreatedApiKey(null);
    setCreatedRunnerName(null);
    setNewRunnerName('');
    setNewRunnerDescription('');
  };

  const copyApiKey = async () => {
    if (!createdApiKey) return;
    await navigator.clipboard.writeText(createdApiKey);
    toast.success('API key copied to clipboard.');
  };

  const copyInstallCommand = async () => {
    await navigator.clipboard.writeText(installCommand);
    toast.success('Installer command copied to clipboard.');
  };

  const handleRetrySku = async (sku: string, scrapers: string[], testMode: boolean) => {
    setRetryingSkus((prev) => ({ ...prev, [sku]: true }));
    try {
      const res = await adminFetch('/api/admin/pipeline/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus: [sku], scrapers, testMode }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to retry SKU');
      }
      toast.success(`Retry queued for SKU ${sku}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to queue retry');
    } finally {
      setRetryingSkus((prev) => ({ ...prev, [sku]: false }));
    }
  };

  const handleCancelJob = (jobId: string) => {
    setCancelJobId(jobId);
  };

  const confirmCancelJob = async () => {
    if (!cancelJobId) return;
    const jobId = cancelJobId;
    setCancelJobId(null);

    try {
      const res = await adminFetch(`/api/admin/pipeline/runs/${jobId}/cancel`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to cancel job');
      }
      toast.success('Job cancel request sent successfully.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel job');
    }
  };

  return (
    <div className="flex h-full flex-col gap-5 pb-6">
      <AdminControlBar>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{filteredRunners.length}</span>{' '}
              runner{filteredRunners.length === 1 ? '' : 's'} in view
            </span>
            <span className="hidden h-1 w-1 rounded-full bg-border md:inline-block" />
            <span>
              <span className="font-semibold text-foreground">{attentionCount}</span>{' '}
              need attention
            </span>
            <span className="hidden h-1 w-1 rounded-full bg-border md:inline-block" />
            <span>Select a runner to view active processes.</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isRealtimeConnected ? 'success' : 'destructive'} className="px-3 py-1">
              {isRealtimeConnected ? 'Realtime connected' : 'Realtime disconnected'}
            </Badge>

            {!isRealtimeConnected ? (
              <Button variant="outline" onClick={connect} size="sm">
                <RefreshCw className="h-4 w-4" />
                Reconnect
              </Button>
            ) : null}

            <Button onClick={() => setShowAddRunnerModal(true)} size="sm">
              <Plus className="h-4 w-4" />
              Add runner
            </Button>
          </div>
        </div>
      </AdminControlBar>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard
          label="Total runners"
          value={stats.totalRunners}
          hint="All registered scraper runners."
          icon={<Server className="h-5 w-5" />}
        />
        <AdminStatCard
          label="Connected now"
          value={stats.online}
          hint="Online or idle runners available for work."
          tone="success"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <AdminStatCard
          label="Working now"
          value={stats.busy}
          hint="Runners actively processing jobs."
          tone="warning"
          icon={<Activity className="h-5 w-5" />}
        />
        <AdminStatCard
          label="Need attention"
          value={attentionCount}
          hint="Offline, disabled, or outdated runners."
          tone="danger"
          icon={<ShieldAlert className="h-5 w-5" />}
        />
      </div>

      {/* Split Pane Layout */}
      <div className="grid gap-5 xl:grid-cols-[450px_1fr]">
        
        {/* Left Pane: Roster */}
        <AdminCard variant="panel" className="flex flex-col h-[700px] overflow-hidden min-w-0">
          <AdminCardHeader className="border-b border-border pb-4 flex flex-col gap-3 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <AdminCardTitle>Runner Roster</AdminCardTitle>
                <AdminCardDescription>Select a runner to monitor in real-time.</AdminCardDescription>
              </div>
              <Badge variant="outline" className="px-2.5 py-0.5 font-semibold">
                {filteredRunners.length}
              </Badge>
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search runners..."
                  className="pl-9 h-9 text-xs"
                  aria-label="Search runners"
                />
              </div>

              <Select value={runnerFilter} onValueChange={(value) => setRunnerFilter(value as RunnerFilter)}>
                <SelectTrigger className="w-full md:w-[150px] h-9 text-xs">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="connected">Connected</SelectItem>
                  <SelectItem value="busy">Working</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </AdminCardHeader>

          <AdminCardContent className="flex-1 overflow-y-auto pt-4 p-0">
            {filteredRunners.length > 0 ? (
              <div className="divide-y divide-border">
                {filteredRunners.map((runner) => {
                  const attention = needsAttention(runner);
                  const isSelected = runner.id === selectedRunnerId;
                  
                  return (
                    <div
                      key={runner.id}
                      onClick={() => setSelectedRunnerId(runner.id)}
                      className={cn(
                        "p-4 cursor-pointer transition-all flex flex-col gap-2 hover:bg-muted/30",
                        isSelected ? "bg-emerald-500/5 dark:bg-emerald-500/10 border-l border-emerald-600" : "border-l border-transparent"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-foreground truncate">{runner.name}</div>
                          <div className="text-xs text-muted-foreground font-mono truncate mt-0.5">{runner.id}</div>
                        </div>
                        <Badge variant={statusBadgeVariant[runner.status]} className="shrink-0 text-[10px]">
                          {statusLabel[runner.status]}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground mt-1">
                        <div className="flex items-center gap-1.5">
                          {attention && <Badge variant="destructive" className="text-[9px] py-0 px-1 border-none shrink-0">Needs attention</Badge>}
                          {runner.build_check_reason === 'outdated' && <Badge variant="outline" className="text-[9px] py-0 px-1 shrink-0">Update required</Badge>}
                        </div>
                        <span className="text-[11px] shrink-0 font-medium">Last seen: {formatLastSeen(runner.last_seen_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
                <AlertCircle className="h-6 w-6" />
                <p className="font-medium text-foreground">No runners found.</p>
                <Button variant="outline" size="sm" onClick={() => { setSearch(''); setRunnerFilter('all'); }}>
                  Clear filter
                </Button>
              </div>
            )}
          </AdminCardContent>
        </AdminCard>

        {/* Right Pane: Active Workspace */}
        <AdminCard variant="panel" className="flex flex-col h-[700px] overflow-hidden min-h-0 bg-card border border-border">
          {selectedRunner ? (
            activeJobId && activeJob ? (
              // Case A: Busy runner with an active job
              <div className="flex h-full flex-col overflow-hidden">
                
                {/* Header Banner */}
                <div className="border-b border-border bg-muted/20 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
                  <div>
                    <button
                      onClick={() => setSelectedRunnerId(null)}
                      className="text-xs text-muted-foreground hover:text-foreground font-semibold flex items-center gap-1 mb-2 hover:underline"
                    >
                      ← Back to Overview
                    </button>
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-primary animate-pulse" />
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Monitor</span>
                      <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/10 animate-pulse border-none text-[10px]">
                        Running
                      </Badge>
                    </div>
                    <h3 className="mt-1 text-base font-bold font-mono text-foreground truncate max-w-[280px]" title={activeJob.id}>
                      Job ID: {activeJob.id.slice(0, 8)}...
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Assigned to runner:{' '}
                      <span className="font-bold text-foreground">
                        {activeJob.claimed_by || activeJob.runner_name || selectedRunner.name}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsLogsOpen(true)}
                      className="gap-1.5 text-xs font-semibold"
                    >
                      <TerminalIcon className="h-3.5 w-3.5" />
                      Live Logs
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void handleCancelJob(activeJob.id)}
                      className="gap-1.5 text-xs font-semibold"
                    >
                      <XOctagon className="h-3.5 w-3.5" />
                      Cancel Job
                    </Button>
                  </div>
                </div>

                {/* Progress Details */}
                <div className="p-5 border-b border-border space-y-3 shrink-0 bg-card">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="font-semibold text-foreground">
                      {activeJob.progress_message || 'Running scraper pipeline...'}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {activeJob.progress_percent ?? 0}% ({activeJob.items_processed || 0}/{activeJob.items_total || activeJob.skus?.length || 0})
                    </span>
                  </div>
                  
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500 ease-out"
                      style={{ width: `${activeJob.progress_percent ?? 0}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {activeJob.scrapers && activeJob.scrapers.length > 0 && (
                        <div>
                          Scrapers:{' '}
                          <span className="font-mono text-foreground font-medium">
                            {activeJob.scrapers.join(', ')}
                          </span>
                        </div>
                      )}
                      {activeJob.test_mode && (
                        <Badge variant="secondary" className="text-[9px] uppercase font-bold tracking-wider py-0.5 border-none">
                          Test Mode
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-primary hover:underline p-0 h-auto"
                      onClick={() => handleOpenDrawer(selectedRunner.id)}
                    >
                      Runner settings
                    </Button>
                  </div>
                </div>

                {/* SKU Progress Table */}
                <div className="flex-1 overflow-y-auto">
                  {skuAttempts.length > 0 ? (
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead className="w-[180px]">SKU</TableHead>
                          <TableHead className="w-[120px]">Status</TableHead>
                          <TableHead className="w-[120px]">Duration</TableHead>
                          <TableHead>Actions / Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {skuAttempts.map((attempt) => {
                          const isRetrying = retryingSkus[attempt.sku];
                          return (
                            <TableRow key={attempt.id} className="hover:bg-muted/10">
                              <TableCell className="font-mono text-xs font-semibold text-foreground">
                                {attempt.sku}
                              </TableCell>
                              <TableCell>
                                <span className={cn(
                                  "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
                                  attempt.status === 'completed' && "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                                  attempt.status === 'failed' && "bg-red-500/10 text-red-500 border-red-500/20",
                                  attempt.status === 'running' && "bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse",
                                  attempt.status === 'pending' && "bg-amber-500/10 text-amber-500 border-amber-500/20",
                                  attempt.status === 'cancelled' && "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                                )}>
                                  {attempt.status === 'running' && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                                  {attempt.status === 'completed' && <CheckCircle2 className="h-2.5 w-2.5" />}
                                  {attempt.status === 'failed' && <AlertCircle className="h-2.5 w-2.5" />}
                                  {attempt.status === 'pending' && <Clock className="h-2.5 w-2.5" />}
                                  <span className="capitalize">{attempt.status}</span>
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {formatAttemptDuration(attempt.started_at, attempt.completed_at, attempt.status)}
                              </TableCell>
                              <TableCell>
                                {attempt.status === 'failed' ? (
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs text-red-500 max-w-[200px] truncate" title={attempt.error_message || ''}>
                                      {attempt.error_message || 'Extraction failed'}
                                    </span>
                                    <Button
                                      variant="outline"
                                      size="icon-sm"
                                      onClick={() => void handleRetrySku(attempt.sku, activeJob.scrapers || [], activeJob.test_mode || false)}
                                      disabled={isRetrying}
                                      title="Retry SKU scrape"
                                      className="shrink-0"
                                    >
                                      {isRetrying ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <RefreshCw className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground font-mono">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-6 text-center">
                      <Activity className="h-7 w-7 animate-pulse text-muted-foreground" />
                      <p className="text-sm font-semibold">Preparing SKU list...</p>
                      <p className="text-xs text-muted-foreground">The runner is fetching work segments for the queue.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // Case B: Runner selected but currently idle/offline
              <div className="flex flex-col h-full p-6 space-y-6 overflow-y-auto">
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div>
                    <button
                      onClick={() => setSelectedRunnerId(null)}
                      className="text-xs text-muted-foreground hover:text-foreground font-semibold flex items-center gap-1 mb-2 hover:underline"
                    >
                      ← Back to Overview
                    </button>
                    <h3 className="text-xl font-black uppercase tracking-tighter text-foreground">
                      {selectedRunner.name}
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">ID: {selectedRunner.id}</p>
                  </div>
                  <Badge variant={statusBadgeVariant[selectedRunner.status]} className="text-xs font-bold uppercase tracking-wider py-1 px-3">
                    {statusLabel[selectedRunner.status]}
                  </Badge>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-border p-4 bg-muted/10">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Last Activity</p>
                    <p className="mt-1 font-mono text-sm text-foreground font-semibold">
                      {formatLastSeen(selectedRunner.last_seen_at)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border p-4 bg-muted/10">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Version Build</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-mono text-sm text-foreground font-semibold">
                        {selectedRunner.version || 'Unknown'}
                      </span>
                      {selectedRunner.build_check_reason === 'outdated' && (
                        <Badge variant="destructive" className="text-[9px] font-black uppercase tracking-tighter animate-pulse border-none px-1.5">
                          Update Required
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Specs list */}
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">System Parameters</h4>
                  <div className="grid grid-cols-2 gap-y-3 text-xs border-t border-border pt-2.5">
                    <span className="text-muted-foreground font-medium">OS Platform</span>
                    <span className="font-bold text-foreground text-right">
                      {(selectedRunner.metadata?.os as string) || 'Linux/Docker'}
                    </span>
                    
                    <span className="text-muted-foreground font-medium">Host Memory Limit</span>
                    <span className="font-mono font-bold text-foreground text-right">
                      {selectedRunner.metadata?.memory_usage_mb ? `${selectedRunner.metadata.memory_usage_mb} MB` : 'Dynamic'}
                    </span>
                    
                    <span className="text-muted-foreground font-medium">Completed Runs</span>
                    <span className="font-mono font-bold text-foreground text-right">
                      {selectedRunner.metadata?.jobs_completed !== undefined ? String(selectedRunner.metadata.jobs_completed) : '0'}
                    </span>
                  </div>
                </div>

                {/* Operator Actions */}
                <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                  <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">Runner Authorization</h4>
                  
                  <div className="flex items-center justify-between border-t border-border pt-3.5">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-foreground uppercase tracking-wide">Queue Authorization</p>
                      <p className="text-[11px] text-muted-foreground">Allows this agent to fetch new jobs.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={selectedRunner.enabled}
                        onCheckedChange={(checked) => {
                          void handleToggleEnabled(selectedRunner.id, checked);
                        }}
                        aria-label={`Toggle ${selectedRunner.name}`}
                      />
                      <span className="text-xs font-bold text-muted-foreground uppercase">
                        {selectedRunner.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-border pt-4 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs font-bold tracking-wider"
                      onClick={() => void handleRename(selectedRunner.id)}
                    >
                      Rename
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs font-bold tracking-wider"
                      onClick={() => void handleRotateApiKey(selectedRunner.id)}
                    >
                      Rotate Token
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="text-xs font-bold tracking-wider"
                      onClick={() => void handleDelete(selectedRunner.id)}
                    >
                      Delete Runner
                    </Button>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full justify-between mt-auto h-11 text-xs font-bold uppercase tracking-wider"
                  onClick={() => handleOpenDrawer(selectedRunner.id)}
                >
                  <span>Open Full Run History & Analytics</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )
          ) : (
            // Case C: No selection, show Network Overview
            <div className="flex flex-col h-full p-6 space-y-6 overflow-y-auto">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tighter text-foreground">
                  Network Coordination
                </h3>
                <p className="text-xs text-muted-foreground">
                  Select a runner from the roster on the left to monitor active logs, check SKU progress, or adjust token configs.
                </p>
              </div>

              {/* Ratios & Stats */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Active Queue Load</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-border p-4 bg-muted/5 flex flex-col justify-between">
                    <span className="text-xs text-muted-foreground font-semibold">Active Jobs</span>
                    <span className="text-2xl font-black font-mono text-foreground mt-2">
                      {queueCounts.running}
                    </span>
                  </div>
                  <div className="rounded-xl border border-border p-4 bg-muted/5 flex flex-col justify-between">
                    <span className="text-xs text-muted-foreground font-semibold">Queued Tasks</span>
                    <span className="text-2xl font-black font-mono text-foreground mt-2">
                      {queueCounts.pending + queueCounts.queued}
                    </span>
                  </div>
                  <div className="rounded-xl border border-border p-4 bg-muted/5 flex flex-col justify-between col-span-2 sm:col-span-1">
                    <span className="text-xs text-muted-foreground font-semibold">{"Today's Jobs"}</span>
                    <span className="text-2xl font-black font-mono text-foreground mt-2">
                      {queueCounts.total}
                    </span>
                  </div>
                </div>
              </div>

              {/* Health Panel */}
              {queueCounts.pending + queueCounts.queued > 0 && stats.online === 0 ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex gap-3 text-red-500 text-xs">
                  <ShieldAlert className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-bold uppercase tracking-wider">Queue Blocked</p>
                    <p className="mt-1 text-red-500/80 leading-relaxed">
                      There are {queueCounts.pending + queueCounts.queued} jobs waiting but no runners are currently online. Ensure you have started runner daemon containers and configured scraping keys in settings.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex gap-3 text-emerald-500 text-xs">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-bold uppercase tracking-wider">Coordinator Ready</p>
                    <p className="mt-1 text-emerald-500/80 leading-relaxed">
                      Realtime sockets are active. Scraper runner nodes are communicating correctly with the web supervisor.
                    </p>
                  </div>
                </div>
              )}

              {/* Recent jobs */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Recent System Job Logs</h4>
                {allJobsList.length > 0 ? (
                  <div className="divide-y divide-border border-t border-border mt-2">
                    {allJobsList.map((job) => (
                      <div key={job.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div className="min-w-0">
                          <span className="font-mono text-foreground font-bold">{job.id.slice(0, 8)}...</span>
                          <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground font-medium">
                            <span>{job.skus?.length || 0} SKUs</span>
                            <span>•</span>
                            <span className="truncate">
                              {job.runner_name || job.claimed_by || 'Unclaimed'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "capitalize font-bold text-[9px] px-1.5 py-0.5 rounded border tracking-wider uppercase",
                            job.status === 'completed' && "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                            job.status === 'failed' && "bg-red-500/10 text-red-500 border-red-500/20",
                            (job.status === 'running' || job.status === 'claimed') && "bg-blue-500/10 text-blue-500 border-blue-500/20",
                            (job.status === 'pending' || job.status === 'queued') && "bg-amber-500/10 text-amber-500 border-amber-500/20",
                            job.status === 'cancelled' && "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                          )}>
                            {job.status === 'claimed' ? 'running' : job.status}
                          </span>
                          
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              if (job.claimed_by) {
                                setSelectedRunnerId(job.claimed_by);
                              } else {
                                setDbJob(job);
                                setIsLogsOpen(true);
                              }
                            }}
                            title="Inspect Job"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-2 font-medium">
                    No active or recent job records found.
                  </p>
                )}
              </div>

              {/* What to check first panel */}
              <div className="rounded-xl border border-border p-4 space-y-2 text-xs bg-muted/10 text-muted-foreground mt-auto">
                <p className="font-bold text-foreground uppercase tracking-wider">Troubleshooting Roster Status</p>
                <p className="leading-relaxed">1. Credential verification: Phillips, Orgill, and Pet Food Experts require valid keys saved in admin settings.</p>
                <p className="leading-relaxed">2. Version skew: Run the install command on client machines to sync runner versions with Next.js web schemas.</p>
              </div>
            </div>
          )}
        </AdminCard>
      </div>

      <Dialog open={showAddRunnerModal} onOpenChange={(open) => (!open ? handleCloseModal() : setShowAddRunnerModal(true))}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{createdApiKey ? 'Runner created' : 'Add runner'}</DialogTitle>
            <DialogDescription>
              {createdApiKey
                ? 'Copy this API key now, then run the installer on the machine that should join the scraper network.'
                : 'Create a runner account and generate the API key used during setup.'}
            </DialogDescription>
          </DialogHeader>

          {createdApiKey ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-muted/40 p-4">
                <Label className="text-xs font-medium text-muted-foreground">Runner name</Label>
                <p className="mt-1 font-medium text-foreground">{createdRunnerName}</p>
              </div>

              <div className="rounded-2xl border border-border bg-muted/40 p-4">
                <Label className="text-xs font-medium text-muted-foreground">API key</Label>
                <div className="mt-2 flex items-start gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground">
                    {createdApiKey}
                  </code>
                  <Button variant="outline" size="icon" onClick={() => void copyApiKey()} aria-label="Copy API key">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-muted/40 p-4">
                <Label className="text-xs font-medium text-muted-foreground">Installer command</Label>
                <div className="mt-2 flex items-start gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground">
                    {installCommand}
                  </code>
                  <Button variant="outline" size="icon" onClick={() => void copyInstallCommand()} aria-label="Copy installer command">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Keep the API key secure. Anyone with this key can connect a runner to the network.
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="runner-name">Runner name</Label>
                <Input
                  id="runner-name"
                  placeholder="e.g. taunton-counter-mac or warehouse-mini"
                  value={newRunnerName}
                  onChange={(event) => setNewRunnerName(event.target.value)}
                  disabled={isCreatingRunner}
                />
                <p className="text-xs text-muted-foreground">
                  Use lowercase letters, numbers, and hyphens so the name is easy to recognize later.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="runner-description">Description</Label>
                <Input
                  id="runner-description"
                  placeholder="Optional note about where this runner lives"
                  value={newRunnerDescription}
                  onChange={(event) => setNewRunnerDescription(event.target.value)}
                  disabled={isCreatingRunner}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {createdApiKey ? (
              <Button onClick={handleCloseModal}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleCloseModal} disabled={isCreatingRunner}>
                  Cancel
                </Button>
                <Button onClick={() => void handleCreateRunner()} disabled={isCreatingRunner || !newRunnerName.trim()}>
                  <Key className="h-4 w-4" />
                  {isCreatingRunner ? 'Creating runner...' : 'Create runner'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RunnerDetailDrawer
        runner={selectedRunnerId ? runnersArray.find((runner) => runner.id === selectedRunnerId) ?? null : null}
        runnerId={selectedRunnerId}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />

      <JobConsoleDrawer
        jobId={activeJobId || (activeJob ? activeJob.id : null)}
        isOpen={isLogsOpen}
        onClose={() => setIsLogsOpen(false)}
      />

      {/* Rotate Key Confirmation */}
      <AlertDialog open={rotateKeyRunnerId !== null} onOpenChange={(open) => !open && setRotateKeyRunnerId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Rotate the API key for this runner? The old key will stop working right away.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmRotateApiKey()}>Rotate Key</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Runner Confirmation */}
      <AlertDialog open={deleteRunnerId !== null} onOpenChange={(open) => !open && setDeleteRunnerId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Runner</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete runner &quot;{deleteRunnerId}&quot;? This removes the runner record and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDeleteRunner()} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Job Confirmation */}
      <AlertDialog open={cancelJobId !== null} onOpenChange={(open) => !open && setCancelJobId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Scraper Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this job? This will stop the runner and abort all pending SKUs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmCancelJob()} className="bg-red-600 hover:bg-red-700">Cancel Job</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Runner Dialog */}
      <Dialog open={renameRunnerId !== null} onOpenChange={(open) => !open && setRenameRunnerId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Runner</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="renameInput">Runner Name</Label>
              <Input
                id="renameInput"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Enter new runner name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameRunnerId(null)}>
              Cancel
            </Button>
            <Button onClick={() => void confirmRenameRunner()} disabled={!renameValue.trim() || renameValue === renameRunnerId}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
