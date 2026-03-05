'use client';

import { useEffect, useState } from 'react';
import { Play, Clock, Loader2 } from 'lucide-react';

interface ActiveJob {
    id: string;
    skuCount: number;
    scrapers: string[];
    status: 'pending' | 'running';
    createdAt: string;
    progress: number;
}

interface ActiveRunsTabProps {
    className?: string;
}

export function ActiveRunsTab({ className }: ActiveRunsTabProps) {
    const [jobs, setJobs] = useState<ActiveJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    return (
        <div className={`space-y-4 ${className}`}>
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
                    <div className="mt-3">
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
                </div>
            ))}
        </div>
    );
}
