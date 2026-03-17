'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Play, Clock, Loader2, XCircle, ExternalLink, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { TimelineView } from './TimelineView';

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

export function ActiveRunsTab({ className }: ActiveRunsTabProps) {
    const router = useRouter();
    const [jobs, setJobs] = useState<ActiveJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [cancellingId, setCancellingId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');
    const [timeRange, setTimeRange] = useState<TimeRange>('1h');

    const fetchJobs = async () => {
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
    };

    useEffect(() => {
        fetchJobs();
        const interval = setInterval(fetchJobs, 10000);
        return () => clearInterval(interval);
    }, []);

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
        } catch (error) {
            toast.error('Failed to cancel job');
        } finally {
            setCancellingId(null);
        }
    };

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
            </div>
        );
    }

    // Transform ActiveJob[] to TimelineJob[] for TimelineView
    const timelineJobs = useMemo(() => {
        return jobs.map((job) => ({
            id: job.id,
            name: `Job ${job.id.slice(0, 8)}`,
            startTime: new Date(job.createdAt),
            status: job.status as 'pending' | 'running',
            runner: job.scrapers.join(', '),
        }));
    }, [jobs]);


    return (
        <div className={`space-y-4 ${className}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">{jobs.length} active job{jobs.length !== 1 ? 's' : ''}</span>
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
                    {jobs.map((job) => (
                        <div
                            key={job.id}
                            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                        >
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
                                        {job.skuCount} SKUs • Started {new Date(job.createdAt).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                            
                            <div className="mt-3 flex items-center justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="text-gray-600">Progress</span>
                                        <span className="font-medium text-gray-900">{job.progress}%</span>
                                    </div>
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                                        <div
                                            className="h-full rounded-full bg-[#008850] transition-all duration-500"
                                            style={{ width: `${job.progress}%` }}
                                        />
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-2 ml-4">
                                    {(job.status === 'pending' || job.status === 'running') && (
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
                    ))}
                </>
            )}
        </div>
    );
}
