'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Server,
  Wifi,
  WifiOff,
  Loader2,
  Key,
  Trash2,
  RefreshCw,
  Plus,
  Settings,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Activity,
  Users,
  Clock,
  Terminal,
  Play,
  MoreVertical,
  Power,
  RotateCcw,
  Eye,
  Network,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Runner {
  id: string;
  name: string;
  os: string;
  status: 'online' | 'offline';
  busy: boolean;
  labels: Array<{ name: string }>;
}

interface RunnerAccount {
  name: string;
  status: string;
  last_seen_at: string | null;
  last_auth_at: string | null;
  has_active_key: boolean;
  active_key_count: number;
  created_at: string;
}

interface ScrapeJob {
  id: string;
  scrapers: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  skus: string[];
  created_at: string;
  completed_at: string | null;
  runner_name: string | null;
  error_message: string | null;
}

interface NetworkClientProps {
  initialRunners?: Runner[];
  initialJobs?: ScrapeJob[];
}

export function NetworkClient({ initialRunners = [], initialJobs = [] }: NetworkClientProps) {
  const [runners, setRunners] = useState<Runner[]>(initialRunners);
  const [accounts, setAccounts] = useState<RunnerAccount[]>([]);
  const [jobs, setJobs] = useState<ScrapeJob[]>(initialJobs);
  const [loading, setLoading] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [selectedRunner, setSelectedRunner] = useState<Runner | null>(null);
  const [showJobDialog, setShowJobDialog] = useState(false);

  const fetchRunners = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/scraper-network/runners');
      if (!res.ok) throw new Error('Failed to fetch runners');
      const data = await res.json();
      setRunners(data.runners || []);
    } catch (err) {
      console.error('Failed to fetch runners:', err);
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/runners/accounts');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      const data = await res.json();
      setAccounts(data.runners || []);
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/scraper-network/jobs');
      if (!res.ok) throw new Error('Failed to fetch jobs');
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    }
  }, []);

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchRunners(), fetchAccounts(), fetchJobs()]);
    } finally {
      setLoading(false);
    }
  }, [fetchRunners, fetchAccounts, fetchJobs]);

  useEffect(() => {
    if (initialRunners.length === 0) {
      fetchRunners();
    }
    fetchAccounts();
    if (initialJobs.length === 0) {
      fetchJobs();
    }
    const interval = setInterval(refreshData, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const getRunnerStatus = (runner: Runner) => {
    const isOnline = runner.status === 'online';
    const isBusy = runner.busy;
    return { isOnline, isBusy };
  };

  const runnerStats = {
    total: runners.length,
    online: runners.filter(r => r.status === 'online' && !r.busy).length,
    busy: runners.filter(r => r.busy).length,
    offline: runners.filter(r => r.status === 'offline').length,
  };

  const jobStats = {
    total: jobs.length,
    running: jobs.filter(j => j.status === 'running').length,
    pending: jobs.filter(j => j.status === 'pending').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
            <Network className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scraper Network</h1>
            <p className="text-sm text-gray-600">Manage self-hosted runners and monitor scraping jobs</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/scrapers">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Scrapers
            </Link>
          </Button>
          <Button variant="outline" onClick={refreshData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setShowAccountModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Runner
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Total Runners</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{runnerStats.total}</div>
            <div className="flex gap-2 mt-1 text-xs">
              <span className="text-green-600">{runnerStats.online} online</span>
              <span className="text-yellow-600">{runnerStats.busy} busy</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Active Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{jobStats.running + jobStats.pending}</div>
            <div className="flex gap-2 mt-1 text-xs">
              <span className="text-blue-600">{jobStats.running} running</span>
              <span className="text-gray-600">{jobStats.pending} pending</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Completed (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{jobStats.completed}</div>
            <p className="text-xs text-gray-600 mt-1">Successfully finished</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">Failed (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{jobStats.failed}</div>
            <p className="text-xs text-gray-600 mt-1">Needs attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="runners" className="space-y-4">
        <TabsList>
          <TabsTrigger value="runners">Runners</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
        </TabsList>

        {/* Runners Tab */}
        <TabsContent value="runners">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Connected Runners
              </CardTitle>
              <CardDescription>
                Real-time status of all connected scraper runners
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading && runners.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
                </div>
              ) : runners.length === 0 ? (
                <div className="text-center py-12">
                  <Server className="h-12 w-12 text-gray-400 mx-auto" />
                  <h3 className="mt-4 text-lg font-medium text-gray-900">No Runners Connected</h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Set up a self-hosted runner to start scraping
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {runners.map((runner) => {
                    const { isOnline, isBusy } = getRunnerStatus(runner);
                    const runnerKey = runner.id || runner.name || `runner-${Math.random()}`;

                    return (
                      <div
                        key={runnerKey}
                        className={`rounded-lg border p-4 ${
                          isOnline
                            ? isBusy
                                ? 'border-yellow-200 bg-yellow-50'
                                : 'border-green-200 bg-green-50'
                            : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            {isOnline ? (
                              <Wifi className={`h-5 w-5 ${isBusy ? 'text-yellow-600' : 'text-green-600'}`} />
                            ) : (
                              <WifiOff className="h-5 w-5 text-gray-600" />
                            )}
                            <div>
                              <h4 className="font-medium text-gray-900">{runner.name}</h4>
                              <p className="text-sm text-gray-600">{runner.os || 'Unknown OS'}</p>
                            </div>
                          </div>
                          <Badge
                            variant={isOnline ? (isBusy ? 'warning' : 'success') : 'secondary'}
                          >
                            {isBusy ? 'Busy' : isOnline ? 'Ready' : 'Offline'}
                          </Badge>
                        </div>

                        {runner.labels && runner.labels.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1">
                            {runner.labels.map((label, lidx) => (
                              <Badge key={`label-${lidx}`} variant="secondary" className="text-xs">
                                {label.name}
                              </Badge>
                            ))}
                          </div>
                        )}

                        <div className="mt-4 flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => {
                              setSelectedRunner(runner);
                              setShowJobDialog(true);
                            }}
                          >
                            <Eye className="mr-1 h-3 w-3" />
                            View Jobs
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Accounts Tab */}
        <TabsContent value="accounts">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Runner Accounts
              </CardTitle>
              <CardDescription>
                Manage API keys and authentication for runners
              </CardDescription>
            </CardHeader>
            <CardContent>
              {accounts.length === 0 ? (
                <div className="text-center py-12">
                  <Key className="h-12 w-12 text-gray-400 mx-auto" />
                  <h3 className="mt-4 text-lg font-medium text-gray-900">No Runner Accounts</h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Create API keys to allow runners to authenticate
                  </p>
                  <Button className="mt-4" onClick={() => setShowAccountModal(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Account
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Runner</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Auth</TableHead>
                      <TableHead>Last Seen</TableHead>
                      <TableHead>API Keys</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((account) => {
                      const accountKey = account.name || `account-${Math.random()}`;
                      return (
                        <TableRow key={accountKey}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {account.has_active_key ? (
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                              ) : (
                                <XCircle className="h-5 w-5 text-gray-600" />
                              )}
                              <div>
                                <div className="font-medium">{account.name}</div>
                                <div className="text-xs text-gray-600">
                                  {account.has_active_key 
                                    ? `${account.active_key_count} active key(s)` 
                                    : 'No API key configured'}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                ['online', 'idle', 'polling'].includes(account.status)
                                  ? 'success'
                                  : ['busy', 'running'].includes(account.status)
                                  ? 'warning'
                                  : 'secondary'
                              }
                            >
                              {account.status || 'unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {formatDate(account.last_auth_at)}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {formatDate(account.last_seen_at)}
                          </TableCell>
                          <TableCell className="text-sm">
                            <Badge variant={account.has_active_key ? 'default' : 'outline'}>
                              {account.active_key_count}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setShowAccountModal(true);
                              }}
                            >
                              <Settings className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Jobs Tab */}
        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Jobs
              </CardTitle>
              <CardDescription>
                Recent scraping job activity across all runners
              </CardDescription>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <div className="text-center py-12">
                  <Activity className="h-12 w-12 text-gray-400 mx-auto" />
                  <h3 className="mt-4 text-lg font-medium text-gray-900">No Jobs Yet</h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Jobs will appear here when runners start processing
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job ID</TableHead>
                      <TableHead>Scrapers</TableHead>
                      <TableHead>Runner</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>SKUs</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.slice(0, 20).map((job) => {
                      const jobKey = job.id || `job-${Math.random()}`;
                      return (
                        <TableRow key={jobKey}>
                          <TableCell>
                            <span className="font-mono text-xs">
                              {job.id ? job.id.slice(0, 8) + '...' : 'N/A'}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium">
                            {job.scrapers && job.scrapers.length > 0 
                              ? job.scrapers.join(', ') 
                              : 'Unknown'}
                          </TableCell>
                          <TableCell className="text-gray-600">{job.runner_name || '-'}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                job.status === 'completed'
                                  ? 'success'
                                  : job.status === 'failed'
                                  ? 'destructive'
                                  : job.status === 'running'
                                  ? 'warning'
                                  : 'secondary'
                              }
                            >
                              {job.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {job.skus ? job.skus.length : 0} SKUs
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {format(new Date(job.created_at), 'MMM d, h:mm a')}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                              disabled={!job.id}
                            >
                              <Link href={job.id ? `/admin/scrapers/runs/${job.id}` : '#'}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Account Modal Placeholder */}
      {showAccountModal && (
        <Dialog open={showAccountModal} onOpenChange={setShowAccountModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Runner Account</DialogTitle>
              <DialogDescription>
                Generate API credentials for a new runner
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Runner Name</label>
                <Input placeholder="e.g., server-1, runner-us-east" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAccountModal(false)}>
                Cancel
              </Button>
              <Button onClick={() => {
                toast.success('Runner account created');
                setShowAccountModal(false);
                fetchAccounts();
              }}>
                Generate API Key
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Job Details Dialog */}
      {showJobDialog && selectedRunner && (
        <Dialog open={showJobDialog} onOpenChange={setShowJobDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Jobs on {selectedRunner.name}</DialogTitle>
              <DialogDescription>
                Current and recent jobs processed by this runner
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {jobs.filter(j => j.runner_name === selectedRunner.name).length === 0 ? (
                <div className="text-center py-8 text-gray-600">
                  No jobs found for this runner
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job ID</TableHead>
                      <TableHead>Scrapers</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs
                      .filter(j => j.runner_name === selectedRunner.name)
                      .slice(0, 10)
                      .map((job) => (
                        <TableRow key={job.id || `filter-job-${Math.random()}`}>
                          <TableCell className="font-mono text-xs">
                            {job.id ? job.id.slice(0, 8) + '...' : 'N/A'}
                          </TableCell>
                          <TableCell>
                            {job.scrapers && job.scrapers.length > 0 
                              ? job.scrapers.join(', ') 
                              : 'Unknown'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                job.status === 'completed'
                                  ? 'success'
                                  : job.status === 'failed'
                                  ? 'destructive'
                                  : 'secondary'
                              }
                            >
                              {job.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {format(new Date(job.created_at), 'MMM d, h:mm a')}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowJobDialog(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
