'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Play,
    Clock,
    Loader2,
    XCircle,
    CheckCircle,
    ExternalLink,
    History,
    ChevronDown,
    ChevronUp,
    Wifi,
    WifiOff,
    AlertTriangle,
    Info,
    AlertCircle,
    Bug,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { TimelineView } from './TimelineView';
import { useJobSubscription } from '@/lib/realtime/useJobSubscription';
import { useLogSubscription } from '@/lib/realtime/useLogSubscription';
import type { LogEntry } from '@/lib/realtime/useLogSubscription';
import type { JobAssignment } from '@/lib/realtime/types';
import { progressUpdateFromJobRecord } from '@/lib/scraper-logs';

interface ActiveJob {
    id: string;
    skuCount: number;
    scrapers: string[];
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    createdAt: string;
    progress: number;
    runnerName: string | null;
    progressMessage: string | null;
    progressPhase: string | null;
    currentSku: string | null;
    itemsProcessed: number | null;
    itemsTotal: number | null;
    lastLogMessage: string | null;
    lastLogLevel: string | null;
    lastLogAt: string | null;
    lastUpdateAt: string | null;
    heartbeatAt: string | null;
}

type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';

interface ActiveRunsTabProps {
    className?: string;
}

const LOG_LEVEL_CONFIG: Record<string, { icon: typeof Info; color: string; bgColor: string }> = {
    debug: { icon: Bug, color: 'text-muted-foreground', bgColor: 'bg-muted' },
    info: { icon: Info, color: 'text-blue-600', bgColor: 'bg-blue-50' },
    warning: { icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-50' },
    error: { icon: AlertCircle, color: 'text-red-600', bgColor: 'bg-red-50' },
    critical: { icon: AlertCircle, color: 'text-red-700', bgColor: 'bg-red-100' },
};

function LogLevelBadge({ level }: { level: string }) {
    const config = LOG_LEVEL_CONFIG[level.toLowerCase()] || LOG_LEVEL_CONFIG.info;
    const Icon = config.icon;
    return (
        <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${config.bgColor} ${config.color}`}
        >
            <Icon className="h-3 w-3" />
            {level}
        </span>
    );
}

function ConnectionIndicator({ isConnected }: { isConnected: boolean }) {
    return (
        <div className="flex items-center gap-1.5 text-xs">
            {isConnected ? (
                <>
                    <Wifi className="h-3.5 w-3.5 text-[#008850]" />
                    <span className="text-[#008850] font-medium">Live</span>
                </>
            ) : (
                <>
                    <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Disconnected</span>
                </>
            )}
        </div>
    );
}

function JobLogPanel({ jobId, logs }: { jobId: string; logs: LogEntry[] }) {
    const jobLogs = useMemo(
        () => logs.filter((l) => l.job_id === jobId),
        [logs, jobId]
    );

    if (jobLogs.length === 0) {
        return (
            <div className="px-4 py-3 text-xs text-muted-foreground italic text-center border-t border-dashed">
                No log entries yet — logs will stream in real time as the job runs.
            </div>
        );
    }

    return (
        <div className="border-t border-dashed">
            <ScrollArea className="max-h-48">
                <div className="divide-y divide-gray-50">
                    {jobLogs.map((log) => (
                        <div
                            key={log.id}
                            className="flex items-start gap-2 px-4 py-2 text-xs hover:bg-muted/50 transition-colors"
                        >
                            <LogLevelBadge level={log.level} />
                            <span className="flex-1 text-muted-foreground font-mono break-all leading-relaxed">
                                {log.message}
                            </span>
                            <span className="text-muted-foreground tabular-nums shrink-0">
                                {new Date(log.created_at ?? log.timestamp).toLocaleTimeString()}
                            </span>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}

function toActiveJob(job: JobAssignment): ActiveJob {
    const liveProgress = progressUpdateFromJobRecord(job);

    return {
        id: job.id,
        skuCount: job.skus?.length ?? 0,
        scrapers: job.scrapers ?? [],
        status: job.status === 'claimed'
            ? 'running'
            : job.status as ActiveJob['status'],
        createdAt: job.created_at,
        progress: liveProgress?.progress ?? 0,
        runnerName: job.runner_name ?? liveProgress?.runner_name ?? null,
        progressMessage: liveProgress?.message ?? null,
        progressPhase: liveProgress?.phase ?? null,
        currentSku: liveProgress?.current_sku ?? null,
        itemsProcessed: liveProgress?.items_processed ?? null,
        itemsTotal: liveProgress?.items_total ?? null,
        lastLogMessage: job.last_log_message ?? null,
        lastLogLevel: job.last_log_level ?? null,
        lastLogAt: job.last_log_at ?? null,
        lastUpdateAt: liveProgress?.timestamp ?? job.last_event_at ?? job.updated_at ?? job.created_at,
        heartbeatAt: job.heartbeat_at ?? null,
    };
}

export function ActiveRunsTab({ className }: ActiveRunsTabProps) {
    const router = useRouter();
    const [jobs, setJobs] = useState<ActiveJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [cancellingId, setCancellingId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');
    const [timeRange, setTimeRange] = useState<TimeRange>('1h');
    const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());

    // Supabase Realtime: subscribe to scrape_jobs changes
    const {
        isConnected: jobsConnected,
        jobs: realtimeJobs,
    } = useJobSubscription({
        maxJobsPerStatus: 50,
        onJobCreated: (job) => {
            toast.info(`New job created: ${job.id.slice(0, 8)}...`);
        },
        onJobUpdated: (job) => {
            if (job.status === 'completed') {
                toast.success(`Job ${job.id.slice(0, 8)} completed`);
            } else if (job.status === 'failed') {
                toast.error(`Job ${job.id.slice(0, 8)} failed`);
            }
        },
    });

    // Supabase Realtime: subscribe to scrape_job_logs for live streaming
    const {
        logs,
        isConnected: logsConnected,
    } = useLogSubscription({
        maxEntries: 500,
    });
    const isRealtimeConnected = jobsConnected || logsConnected;

    // Initial fetch + periodic refresh (as fallback alongside realtime)
    const fetchJobs = useCallback(async () => {
        try {
            const response = await fetch('/api/admin/pipeline/active-runs');
            if (!response.ok) throw new Error('Failed to fetch jobs');
            const data = await response.json();
            setJobs(data.jobs || []);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchJobs();
        // Fallback polling at 30s (realtime handles most updates)
        const interval = setInterval(fetchJobs, 30000);
        return () => clearInterval(interval);
    }, [fetchJobs]);

    // Memoize the specific job arrays to stabilize the effect dependency
    const pendingJobs = realtimeJobs.pending;
    const runningJobs = realtimeJobs.running;
    const completedJobs = realtimeJobs.completed;
    const failedJobs = realtimeJobs.failed;
    const cancelledJobs = realtimeJobs.cancelled;

    // Merge realtime job updates into the local state
    useEffect(() => {
        const activeRealtimeJobs = [
            ...pendingJobs,
            ...runningJobs,
            ...completedJobs,
            ...failedJobs,
            ...cancelledJobs,
        ];

        if (activeRealtimeJobs.length > 0) {
            setJobs((prev) => {
                // Use a map for efficient updates, keeping previous state for unchanged jobs
                const jobMap = new Map(prev.map((j) => [j.id, j]));
                let hasChanges = false;

                activeRealtimeJobs.forEach((rj) => {
                    const nextJob = toActiveJob(rj);
                    const existing = jobMap.get(rj.id);

                    if (!existing || JSON.stringify(existing) !== JSON.stringify(nextJob)) {
                        jobMap.set(rj.id, nextJob);
                        hasChanges = true;
                    }
                });

                if (!hasChanges) return prev;
                return Array.from(jobMap.values()).sort(
                    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
                );
            });
        }
    }, [pendingJobs, runningJobs, completedJobs, failedJobs, cancelledJobs]);

    const handleCancel = async (jobId: string) => {
        if (!confirm('Are you sure you want to cancel this job?')) return;

        setCancellingId(jobId);
        try {
            const res = await fetch(`/api/admin/scrapers/runs/${jobId}/cancel`, {
                method: 'POST',
            });

            if (res.ok) {
                toast.success('Job cancelled');
                fetchJobs();
            } else {
                toast.error('Failed to cancel job');
            }
        } catch {
            toast.error('Failed to cancel job');
        } finally {
            setCancellingId(null);
        }
    };

    const toggleJobExpanded = (jobId: string) => {
        setExpandedJobs((prev) => {
            const next = new Set(prev);
            if (next.has(jobId)) {
                next.delete(jobId);
            } else {
                next.add(jobId);
            }
            return next;
        });
    };

    // Transform ActiveJob[] to TimelineJob[]
    const timelineJobs = useMemo(() => {
        return jobs.map((job) => ({
            id: job.id,
            name: `Job ${job.id.slice(0, 8)}`,
            startTime: new Date(job.createdAt),
            status: job.status,
            runner: job.scrapers.join(', '),
        }));
    }, [jobs]);

    const getJobLogCount = useCallback(
        (jobId: string) => logs.filter((l) => l.job_id === jobId).length,
        [logs]
    );

    if (loading) {
        return (
            <div className={`flex items-center justify-center py-12 ${className}`}>
                <Loader2 className="h-8 w-8 animate-spin text-[#008850]" />
            </div>
        );
    }

    if (error) {
        return (
            <div className={`rounded-lg border border-red-200 bg-red-50 p-4 ${className}`}>
                <p className="text-sm text-red-600">Error: {error}</p>
            </div>
        );
    }

    if (jobs.length === 0) {
        return (
            <div className={`flex flex-col items-center justify-center py-12 text-center ${className}`}>
                <Play className="h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-foreground">No active scraper jobs</h3>
                <p className="text-sm text-muted-foreground mt-1">
                    Scraper jobs will appear here when running
                </p>
                <div className="mt-4">
                    <ConnectionIndicator isConnected={isRealtimeConnected} />
                </div>
            </div>
        );
    }

    return (
        <div className={`space-y-4 ${className}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                        {jobs.length} active job{jobs.length !== 1 ? 's' : ''}
                    </span>
                    <ConnectionIndicator isConnected={isRealtimeConnected} />
                    <div className="flex items-center gap-2">
                        <Button
                            variant={viewMode === 'list' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setViewMode('list')}
                        >
                            List
                        </Button>
                        <Button
                            variant={viewMode === 'timeline' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setViewMode('timeline')}
                        >
                            Timeline
                        </Button>
                    </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                    <Link href="/admin/scrapers/runs">
                        <History className="mr-2 h-4 w-4" />
                        View All Runs
                    </Link>
                </Button>
            </div>

            {viewMode === 'timeline' ? (
                <TimelineView
                    jobs={timelineJobs}
                    timeRange={timeRange}
                    onTimeRangeChange={setTimeRange}
                    onJobClick={(job) => router.push(`/admin/scrapers/runs/${job.id}`)}
                />
            ) : (
                <>
                    {jobs.map((job) => {
                        const isExpanded = expandedJobs.has(job.id);
                        const logCount = getJobLogCount(job.id);

                        return (
                            <div
                                key={job.id}
                                className="rounded-lg border border-border bg-card shadow-sm overflow-hidden"
                            >
                                <div className="p-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-medium text-foreground">
                                                    Job {job.id.slice(0, 8)}
                                                </h3>
                                                <span
                                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                        job.status === 'running'
                                                            ? 'bg-[#008850]/10 text-[#008850]'
                                                            : job.status === 'completed'
                                                            ? 'bg-green-100 text-green-700'
                                                            : job.status === 'failed' || job.status === 'cancelled'
                                                            ? 'bg-red-100 text-red-700'
                                                            : 'bg-muted text-muted-foreground'
                                                    }`}
                                                >
                                                    {job.status === 'running' ? (
                                                        <>
                                                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                                            Running
                                                        </>
                                                    ) : job.status === 'completed' ? (
                                                        <>
                                                            <CheckCircle className="mr-1 h-3 w-3" />
                                                            Completed
                                                        </>
                                                    ) : job.status === 'failed' ? (
                                                        <>
                                                            <AlertCircle className="mr-1 h-3 w-3" />
                                                            Failed
                                                        </>
                                                    ) : job.status === 'cancelled' ? (
                                                        <>
                                                            <XCircle className="mr-1 h-3 w-3" />
                                                            Cancelled
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Clock className="mr-1 h-3 w-3" />
                                                            Pending
                                                        </>
                                                    )}
                                                </span>
                                            </div>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                {job.scrapers.join(', ')}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {job.skuCount} SKUs • Started{' '}
                                                {new Date(job.createdAt).toLocaleString()}
                                            </p>
                                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                {job.runnerName ? (
                                                    <span className="rounded-full bg-muted px-2 py-0.5">
                                                        Runner: {job.runnerName}
                                                    </span>
                                                ) : null}
                                                {job.progressPhase ? (
                                                    <span className="rounded-full bg-muted px-2 py-0.5 uppercase">
                                                        {job.progressPhase}
                                                    </span>
                                                ) : null}
                                                {job.currentSku ? (
                                                    <span className="font-mono text-foreground">
                                                        {job.currentSku}
                                                    </span>
                                                ) : null}
                                                {typeof job.itemsProcessed === 'number' && typeof job.itemsTotal === 'number' ? (
                                                    <span>
                                                        {job.itemsProcessed}/{job.itemsTotal}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-3 flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between text-xs mb-1">
                                                <span className="text-muted-foreground">Progress</span>
                                                <span className="font-medium text-foreground">
                                                    {job.progress}%
                                                </span>
                                            </div>
                                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                                <div
                                                    className="h-full rounded-full bg-[#008850] transition-all duration-500"
                                                    style={{ width: `${job.progress}%` }}
                                                />
                                            </div>
                                            {(job.progressMessage || job.lastLogMessage) && (
                                                <div className="mt-2 space-y-1 text-xs">
                                                    {job.progressMessage ? (
                                                        <p className="text-foreground">{job.progressMessage}</p>
                                                    ) : null}
                                                    {job.lastLogMessage ? (
                                                        <div className="flex items-center gap-2 text-muted-foreground">
                                                            {job.lastLogLevel ? (
                                                                <LogLevelBadge level={job.lastLogLevel} />
                                                            ) : null}
                                                            <span className="line-clamp-1">
                                                                {job.lastLogMessage}
                                                            </span>
                                                            {job.lastLogAt ? (
                                                                <span className="shrink-0 tabular-nums">
                                                                    {new Date(job.lastLogAt).toLocaleTimeString()}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 ml-4">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => toggleJobExpanded(job.id)}
                                                className="text-muted-foreground hover:text-muted-foreground"
                                            >
                                                {isExpanded ? (
                                                    <ChevronUp className="h-4 w-4" />
                                                ) : (
                                                    <ChevronDown className="h-4 w-4" />
                                                )}
                                                {logCount > 0 && (
                                                    <Badge
                                                        variant="secondary"
                                                        className="ml-1 text-[10px] px-1.5 py-0"
                                                    >
                                                        {logCount}
                                                    </Badge>
                                                )}
                                            </Button>
                                            {(job.status === 'pending' ||
                                                job.status === 'running') && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleCancel(job.id)}
                                                    disabled={cancellingId === job.id}
                                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    {cancellingId === job.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <XCircle className="h-4 w-4" />
                                                    )}
                                                </Button>
                                            )}
                                            <Button variant="ghost" size="sm" asChild>
                                                <Link href={`/admin/scrapers/runs/${job.id}`}>
                                                    <ExternalLink className="h-4 w-4" />
                                                </Link>
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {/* Collapsible Log Panel */}
                                {isExpanded && (
                                    <JobLogPanel jobId={job.id} logs={logs} />
                                )}
                            </div>
                        );
                    })}
                </>
            )}
        </div>
    );
}
