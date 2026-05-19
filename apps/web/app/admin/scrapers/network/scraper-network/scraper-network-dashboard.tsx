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
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
} from 'lucide-react';
import { useRunnerPresence } from '@/lib/realtime/useRunnerPresence';
import { adminFetch } from '@/lib/admin/api-client';
import {
  deleteRunner,
  disableRunner,
  enableRunner,
  renameRunner,
  rotateRunnerKey,
} from '@/app/admin/scrapers/network/actions';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

export function ScraperNetworkDashboard() {
  const { runners, isConnected: isRealtimeConnected, connect } = useRunnerPresence({
    autoConnect: true,
  });

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
            region: (runner.metadata?.region as string) || null,
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
        runner.id.toLowerCase().includes(search.toLowerCase()) ||
        (runner.region || '').toLowerCase().includes(search.toLowerCase());

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

  const handleRotateApiKey = async (id: string) => {
    const confirmed = window.confirm(
      'Rotate the API key for this runner? The old key will stop working right away.',
    );
    if (!confirmed) return;

    const result = await rotateRunnerKey(id);
    if (result.success && result.key) {
      await navigator.clipboard.writeText(result.key);
      toast.success('New API key copied to clipboard.');
      return;
    }

    toast.error(result.error || 'We could not rotate the API key.');
  };

  const handleRename = async (id: string) => {
    const nextName = window.prompt('Enter a new runner name.', id);
    if (!nextName || nextName === id) return;

    const result = await renameRunner(id, nextName);
    if (result.success) {
      toast.success('Runner name updated.');
      return;
    }

    toast.error(result.error || 'We could not rename this runner.');
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm(
      `Delete runner "${id}"? This removes the runner record and cannot be undone.`,
    );
    if (!confirmed) return;

    const result = await deleteRunner(id);
    if (result.success) {
      toast.success('Runner deleted.');
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

  return (
    <div className="flex h-full flex-col gap-5 pb-6">
      <AdminControlBar>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by runner name, ID, or region"
                className="pl-9"
                aria-label="Search runners"
              />
            </div>

            <Select value={runnerFilter} onValueChange={(value) => setRunnerFilter(value as RunnerFilter)}>
              <SelectTrigger className="w-full md:w-[220px]">
                <SelectValue placeholder="Filter runners" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All runners</SelectItem>
                <SelectItem value="connected">Connected now</SelectItem>
                <SelectItem value="busy">Working now</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isRealtimeConnected ? 'success' : 'destructive'} className="px-3 py-1">
              {isRealtimeConnected ? 'Realtime connected' : 'Realtime disconnected'}
            </Badge>

            {!isRealtimeConnected ? (
              <Button variant="outline" onClick={connect}>
                <RefreshCw className="h-4 w-4" />
                Reconnect
              </Button>
            ) : null}

            <Button onClick={() => setShowAddRunnerModal(true)}>
              <Plus className="h-4 w-4" />
              Add runner
            </Button>
          </div>
        </div>

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
          <span>Use a row to open details and recent activity.</span>
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <AdminCard variant="panel" className="min-h-0">
          <AdminCardHeader className="justify-between gap-4 border-b border-border pb-4">
            <div>
              <AdminCardTitle>Runner roster</AdminCardTitle>
              <AdminCardDescription>
                Open a runner to inspect live history, metadata, and health details.
              </AdminCardDescription>
            </div>
            <Badge variant="outline" className="px-3 py-1">
              {filteredRunners.length} in view
            </Badge>
          </AdminCardHeader>

          <AdminCardContent className="pt-4">
            {filteredRunners.length > 0 ? (
              <>
                <div className="grid gap-3 lg:hidden">
                  {filteredRunners.map((runner) => {
                    const attention = needsAttention(runner);
                    return (
                      <div key={runner.id} className="rounded-[1rem] border border-border bg-card p-4">
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => handleOpenDrawer(runner.id)}
                            className="min-w-0 text-left"
                          >
                            <div className="font-medium text-foreground">{runner.name}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{runner.id}</div>
                          </button>
                          <Badge variant={statusBadgeVariant[runner.status]}>{statusLabel[runner.status]}</Badge>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {attention ? <Badge variant="destructive">Needs attention</Badge> : null}
                          {runner.build_check_reason === 'outdated' ? <Badge variant="outline">Update required</Badge> : null}
                        </div>

                        <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-muted/20 p-3 sm:grid-cols-3">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Jobs</p>
                            <p className="mt-1 text-sm font-medium text-foreground">{runner.active_jobs}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Version</p>
                            <p className="mt-1 text-sm font-medium text-foreground">{runner.version || 'Unknown'}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Last seen</p>
                            <p className="mt-1 text-sm font-medium text-foreground">{formatLastSeen(runner.last_seen_at)}</p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={runner.enabled}
                              onCheckedChange={(checked) => {
                                void handleToggleEnabled(runner.id, checked);
                              }}
                              aria-label={`Toggle ${runner.name}`}
                            />
                            <span className="text-sm text-muted-foreground">{runner.enabled ? 'Enabled' : 'Disabled'}</span>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => handleOpenDrawer(runner.id)}>
                            Open details
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${runner.name}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => void handleRotateApiKey(runner.id)}>
                                Rotate API key
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void handleRename(runner.id)}>
                                Rename runner
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => void handleDelete(runner.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                Delete runner
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden lg:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Runner</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Access</TableHead>
                        <TableHead>Jobs</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Region</TableHead>
                        <TableHead>Last seen</TableHead>
                        <TableHead className="w-[72px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRunners.map((runner) => {
                        const attention = needsAttention(runner);

                        return (
                          <TableRow
                            key={runner.id}
                            className="cursor-pointer"
                            onClick={() => handleOpenDrawer(runner.id)}
                          >
                            <TableCell>
                              <div className="flex min-w-0 items-start gap-3">
                                <div
                                  className={cn(
                                    'mt-1 h-2.5 w-2.5 rounded-full',
                                    runner.status === 'offline' && 'bg-brand-burgundy',
                                    runner.status === 'busy' && 'bg-brand-gold',
                                    (runner.status === 'online' || runner.status === 'idle' || runner.status === 'polling') &&
                                      'bg-brand-forest-green',
                                    runner.status === 'paused' && 'bg-muted-foreground',
                                  )}
                                />
                                <div className="min-w-0 space-y-1">
                                  <div className="truncate font-medium text-foreground">{runner.name}</div>
                                  <div className="truncate text-xs text-muted-foreground">{runner.id}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={statusBadgeVariant[runner.status]}>{statusLabel[runner.status]}</Badge>
                                {attention ? <Badge variant="destructive">Needs attention</Badge> : null}
                              </div>
                            </TableCell>
                            <TableCell onClick={(event) => event.stopPropagation()}>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={runner.enabled}
                                  onCheckedChange={(checked) => {
                                    void handleToggleEnabled(runner.id, checked);
                                  }}
                                  aria-label={`Toggle ${runner.name}`}
                                />
                                <span className="text-sm text-muted-foreground">
                                  {runner.enabled ? 'Enabled' : 'Disabled'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="tabular-nums">{runner.active_jobs}</TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium text-foreground">{runner.version || 'Unknown'}</div>
                                {runner.build_check_reason === 'outdated' ? (
                                  <div className="text-xs text-brand-burgundy">Update required</div>
                                ) : runner.build_check_reason === 'missing' ? (
                                  <div className="text-xs text-brand-burgundy">Missing version</div>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>{runner.region || 'Unassigned'}</TableCell>
                            <TableCell>{formatLastSeen(runner.last_seen_at)}</TableCell>
                            <TableCell onClick={(event) => event.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${runner.name}`}>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuItem onClick={() => handleOpenDrawer(runner.id)}>
                                    Open details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => void handleRotateApiKey(runner.id)}>
                                    Rotate API key
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => void handleRename(runner.id)}>
                                    Rename runner
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => void handleDelete(runner.id)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    Delete runner
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 text-center">
                <AlertCircle className="h-6 w-6 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="font-medium text-foreground">No runners match this view.</p>
                  <p className="text-sm text-muted-foreground">
                    Clear the search or filter, or add a new runner to get started.
                  </p>
                </div>
                <Button variant="outline" onClick={() => { setSearch(''); setRunnerFilter('all'); }}>
                  Clear filters
                </Button>
              </div>
            )}
          </AdminCardContent>
        </AdminCard>

        <AdminCard variant="panel">
          <AdminCardHeader>
            <div>
              <AdminCardTitle>What to check first</AdminCardTitle>
              <AdminCardDescription>
                A quick pass for scraper operators at the start of the day.
              </AdminCardDescription>
            </div>
          </AdminCardHeader>
          <AdminCardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="font-medium text-foreground">1. Realtime connection</p>
              <p className="mt-1">If realtime is disconnected, reconnect before trusting the roster.</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="font-medium text-foreground">2. Offline or disabled runners</p>
              <p className="mt-1">Bring attention counts to zero before launching more scraping work.</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="font-medium text-foreground">3. Version warnings</p>
              <p className="mt-1">Update runners marked as outdated before they drift from the web coordinator.</p>
            </div>
            <Button variant="outline" className="w-full justify-between" onClick={() => setShowAddRunnerModal(true)}>
              Add a new runner
              <ChevronRight className="h-4 w-4" />
            </Button>
          </AdminCardContent>
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
    </div>
  );
}
