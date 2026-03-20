'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Play,
    Clock,
    Loader2,
    XCircle,
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

interface ActiveJob {
    id: string;
    skuCount: number;
    scrapers: string[];
    status: 'pending' | 'running';
    createdAt: string;
    progress: number;
}

type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';

interface ActiveRunsTabProps {
    className?: string;
}

const LOG_LEVEL_CONFIG: Record<string, { icon: typeof Info; color: string; bgColor: string }> = {
    DEBUG: { icon: Bug, color: 'text-gray-500', bgColor: 'bg-gray-100' },
    INFO: { icon: Info, color: 'text-blue-600', bgColor: 'bg-blue-50' },
    WARN: { icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-50' },
    ERROR: { icon: AlertCircle, color: 'text-red-600', bgColor: 'bg-red-50' },
};

function LogLevelBadge({ level }: { level: string }) {
    const config = LOG_LEVEL_CONFIG[level] || LOG_LEVEL_CONFIG.INFO;
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
                    <WifiOff className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-gray-400">Disconnected</span>
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
            <div className="px-4 py-3 text-xs text-gray-400 italic text-center border-t border-dashed">
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
                            className="flex items-start gap-2 px-4 py-2 text-xs hover:bg-gray-50/50 transition-colors"
                        >
                            <LogLevelBadge level={log.level} />
                            <span className="flex-1 text-gray-700 font-mono break-all leading-relaxed">
                                {log.message}
                            </span>
                            <span className="text-gray-400 tabular-nums shrink-0">
                                {new Date(log.created_at).toLocaleTimeString()}
                            </span>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
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

    const isRealtimeConnected = jobsConnected && logsConnected;

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
    const completedIdsData = useMemo(() => [
        ...realtimeJobs.completed.map(j => j.id),
        ...realtimeJobs.failed.map(j => j.id),
        ...realtimeJobs.cancelled.map(j => j.id)
    ], [realtimeJobs.completed, realtimeJobs.failed, realtimeJobs.cancelled]);

    // Merge realtime job updates into the local state
    useEffect(() => {
        const activeRealtimeJobs = [
            ...pendingJobs,
            ...runningJobs,
        ];

        if (activeRealtimeJobs.length > 0 || completedIdsData.length > 0) {
            setJobs((prev) => {
                // Use a map for efficient updates, keeping previous state for unchanged jobs
                const jobMap = new Map(prev.map((j) => [j.id, j]));
                let hasChanges = false;

                activeRealtimeJobs.forEach((rj) => {
                    if (rj.status === 'pending' || rj.status === 'running') {
                        const existing = jobMap.get(rj.id);
                        // Only update if something changed to prevent unnecessary re-renders
                        if (!existing || existing.status !== rj.status || existing.skuCount !== (rj.skus?.length ?? 0)) {
                            jobMap.set(rj.id, {
                                id: rj.id,
                                skuCount: rj.skus?.length ?? 0,
                                scrapers: rj.scrapers ?? [],
                                status: rj.status as 'pending' | 'running',
                                createdAt: rj.created_at,
                                progress: existing?.progress ?? 0,
                            });
                            hasChanges = true;
                        }
                    }
                });

                // Remove jobs that have completed/failed from our local "active" list
                const completedIds = new Set(completedIdsData);
                const beforeCount = jobMap.size;
                
                // We actually need to iterate and delete to remove from the map
                for (const jobId of jobMap.keys()) {
                    if (completedIds.has(jobId)) {
                        jobMap.delete(jobId);
                    }
                }
                
                if (jobMap.size !== beforeCount) {
                    hasChanges = true;
                }

                if (!hasChanges) return prev;
                return Array.from(jobMap.values());
            });
        }
    }, [pendingJobs, runningJobs, completedIdsData]);

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
            status: job.status as 'pending' | 'running',
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
                <h3 className="text-lg font-medium text-gray-900">No active scraper jobs</h3>
                <p className="text-sm text-gray-500 mt-1">
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
                    <span className="text-sm text-gray-500">
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
                                className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden"
                            >
                                <div className="p-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-medium text-gray-900">
                                                    Job {job.id.slice(0, 8)}
                                                </h3>
                                                <span
                                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                        job.status === 'running'
                                                            ? 'bg-[#008850]/10 text-[#008850]'
                                                            : 'bg-gray-100 text-gray-600'
                                                    }`}
                                                >
                                                    {job.status === 'running' ? (
                                                        <>
                                                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                                            Running
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Clock className="mr-1 h-3 w-3" />
                                                            Pending
                                                        </>
                                                    )}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-500 mt-1">
                                                {job.scrapers.join(', ')}
                                            </p>
                                            <p className="text-xs text-gray-400 mt-1">
                                                {job.skuCount} SKUs • Started{' '}
                                                {new Date(job.createdAt).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-3 flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between text-xs mb-1">
                                                <span className="text-gray-600">Progress</span>
                                                <span className="font-medium text-gray-900">
                                                    {job.progress}%
                                                </span>
                                            </div>
                                            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                                                <div
                                                    className="h-full rounded-full bg-[#008850] transition-all duration-500"
                                                    style={{ width: `${job.progress}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 ml-4">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => toggleJobExpanded(job.id)}
                                                className="text-gray-500 hover:text-gray-700"
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
