'use client';

import { useEffect, useState } from 'react';
import { Brain, Loader2 } from 'lucide-react';

interface ConsolidationJob {
    id: string;
    status: string;
    totalProducts: number;
    processedCount: number;
    successCount: number;
    errorCount: number;
    createdAt: string;
    progress: number;
}

interface ActiveConsolidationsTabProps {
    className?: string;
}

export function ActiveConsolidationsTab({ className }: ActiveConsolidationsTabProps) {
    const [jobs, setJobs] = useState<ConsolidationJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchJobs = async () => {
        try {
            const response = await fetch('/api/admin/pipeline/active-consolidations');
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
                <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
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
                <Brain className="h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">No active consolidation jobs</h3>
                <p className="text-sm text-gray-500 mt-1">
                    AI consolidation jobs will appear here when running
                </p>
            </div>
        );
    }

    return (
        <div className={`space-y-4 ${className}`}>
            {jobs.map((job) => (
                <div
                    key={job.id}
                    className="rounded-lg border border-purple-100 bg-white p-4 shadow-sm"
                >
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <Brain className="h-5 w-5 text-purple-600" />
                                <h3 className="font-medium text-gray-900">
                                    Batch {job.id.slice(0, 8)}
                                </h3>
                                <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                    {job.status}
                                </span>
                            </div>
                            <div className="grid grid-cols-4 gap-4 mt-3 text-center">
                                <div>
                                    <p className="text-2xl font-semibold text-gray-900">{job.totalProducts}</p>
                                    <p className="text-xs text-gray-500">Total</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-semibold text-blue-600">{job.processedCount}</p>
                                    <p className="text-xs text-gray-500">Processed</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-semibold text-green-600">{job.successCount}</p>
                                    <p className="text-xs text-gray-500">Success</p>
                                </div>
                                <div>
                                    <p className={`text-2xl font-semibold ${job.errorCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                        {job.errorCount}
                                    </p>
                                    <p className="text-xs text-gray-500">Errors</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-600">Progress</span>
                            <span className="font-medium text-gray-900">{job.progress}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                            <div
                                className="h-full rounded-full bg-purple-600 transition-all duration-500"
                                style={{ width: `${job.progress}%` }}
                            />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
