'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format, intervalToDuration } from 'date-fns';
import { Clock, Calendar, CheckCircle2, AlertCircle, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import type { ScrapeJob } from '@/types/scraper';

interface JobHeaderProps {
    jobId?: string;
    job?: ScrapeJob;
    className?: string;
}

type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

const STATUS_CONFIG: Record<JobStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
    pending: { label: 'Pending', variant: 'secondary', className: 'bg-gray-100 text-gray-700' },
    running: { label: 'Running', variant: 'default', className: 'bg-yellow-100 text-yellow-700' },
    completed: { label: 'Completed', variant: 'default', className: 'bg-green-100 text-green-700' },
    failed: { label: 'Failed', variant: 'destructive', className: 'bg-red-100 text-red-700' },
    cancelled: { label: 'Cancelled', variant: 'secondary', className: 'bg-gray-100 text-gray-700' },
};

export function JobHeader({ jobId, job: initialJob, className }: JobHeaderProps) {
    const [job, setJob] = useState<ScrapeJob | null>(initialJob || null);
    const [loading, setLoading] = useState(!initialJob && !!jobId);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const supabase = createClient();

    // Fetch job if only jobId is provided
    useEffect(() => {
        if (!initialJob && jobId) {
            async function fetchJob() {
                try {
                    const { data, error } = await supabase
                        .from('scrape_jobs')
                        .select('*')
                        .eq('id', jobId)
                        .single();

                    if (error) throw error;
                    setJob(data);
                } catch (err) {
                    console.error('Error fetching job:', err);
                } finally {
                    setLoading(false);
                }
            }
            fetchJob();
        }
    }, [jobId, initialJob, supabase]);

    // Update elapsed time for running jobs
    useEffect(() => {
        if (!job) return;

        const isRunning = job.status === 'running';
        if (!isRunning) return;

        const calculateElapsed = () => {
            const start = new Date(job.created_at).getTime();
            const now = Date.now();
            return Math.floor((now - start) / 1000);
        };

        setElapsedSeconds(calculateElapsed());
        const interval = setInterval(() => {
            setElapsedSeconds(calculateElapsed());
        }, 1000);

        return () => clearInterval(interval);
    }, [job]);

    const formatDuration = (seconds: number): string => {
        const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
        const parts: string[] = [];

        if (duration.hours) parts.push(`${duration.hours}h`);
        if (duration.minutes) parts.push(`${duration.minutes}m`);
        if (duration.seconds || parts.length === 0) parts.push(`${duration.seconds || 0}s`);

        return parts.join(' ');
    };

    const getStatus = (): JobStatus => {
        const status = job?.status?.toLowerCase();
        if (status === 'pending') return 'pending';
        if (status === 'running') return 'running';
        if (status === 'completed') return 'completed';
        if (status === 'failed') return 'failed';
        if (status === 'cancelled') return 'cancelled';
        return 'pending';
    };

    const getDuration = (): string | null => {
        if (!job) return null;

        const status = getStatus();
        if (status === 'running') {
            return formatDuration(elapsedSeconds);
        }

        if (status === 'completed' && job.completed_at) {
            const start = new Date(job.created_at).getTime();
            const end = new Date(job.completed_at).getTime();
            const seconds = Math.floor((end - start) / 1000);
            return formatDuration(seconds);
        }

        return null;
    };

    const getConfigNames = async (): Promise<string[]> => {
        if (!job?.scrapers?.length) return [];

        try {
            const { data, error } = await supabase
                .from('scraper_configs')
                .select('name')
                .in('id', job.scrapers);

            if (error) throw error;
            return data?.map(c => c.name) || job.scrapers;
        } catch {
            return job.scrapers;
        }
    };

    const [configNames, setConfigNames] = useState<string[]>([]);

    useEffect(() => {
        if (job?.scrapers?.length) {
            getConfigNames().then(setConfigNames);
        }
    }, [job]);

    if (loading) {
        return (
            <Card className={className}>
                <CardHeader className="pb-3">
                    <Skeleton className="h-6 w-48" />
                </CardHeader>
                <CardContent className="space-y-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-36" />
                </CardContent>
            </Card>
        );
    }

    if (!job) {
        return (
            <Card className={className}>
                <CardContent className="py-6 text-center text-muted-foreground">
                    No job data available
                </CardContent>
            </Card>
        );
    }

    const status = getStatus();
    const statusConfig = STATUS_CONFIG[status];
    const duration = getDuration();

    return (
        <Card className={className}>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h2 className="text-lg font-semibold">Job Details</h2>
                        <Badge 
                            variant={statusConfig.variant} 
                            className={`${statusConfig.className} gap-1`}
                        >
                            {status === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
                            {status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                            {status === 'failed' && <AlertCircle className="w-3 h-3" />}
                            {status === 'cancelled' && <XCircle className="w-3 h-3" />}
                            {statusConfig.label}
                        </Badge>
                    </div>
                    {duration && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Clock className="w-4 h-4" />
                            <span>{duration}</span>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <span className="text-muted-foreground text-xs uppercase tracking-wider">Job ID</span>
                        <p className="font-mono text-xs break-all">{job.id}</p>
                    </div>

                    {configNames.length > 0 && (
                        <div className="space-y-1">
                            <span className="text-muted-foreground text-xs uppercase tracking-wider">Scraper Configs</span>
                            <div className="flex flex-wrap gap-1">
                                {configNames.map((name, idx) => (
                                    <Badge key={idx} variant="outline" className="text-xs">
                                        {name}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <span className="text-muted-foreground text-xs uppercase tracking-wider flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Start Time
                        </span>
                        <p>{format(new Date(job.created_at), 'MMM d, yyyy h:mm:ss a')}</p>
                    </div>

                    {job.completed_at && (
                        <div className="space-y-1">
                            <span className="text-muted-foreground text-xs uppercase tracking-wider flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                End Time
                            </span>
                            <p>{format(new Date(job.completed_at), 'MMM d, yyyy h:mm:ss a')}</p>
                        </div>
                    )}
                </div>

                {job.error_message && (
                    <>
                        <Separator />
                        <div className="space-y-1">
                            <span className="text-muted-foreground text-xs uppercase tracking-wider">Error</span>
                            <p className="text-destructive text-sm">{job.error_message}</p>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
