'use client';

import { useEffect, useState } from 'react';
import { Clock, CheckCircle2, XCircle, Loader2, RefreshCw, Terminal } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { LogViewer } from '@/components/admin/scraping/log-viewer';
import { Button } from '@/components/ui/button';

interface ScrapeJob {
    id: string;
    skus: string[];
    status: 'pending' | 'running' | 'completed' | 'failed';
    created_at: string;
    completed_at: string | null;
    error_message: string | null;
}

export function JobHistory() {
    const [jobs, setJobs] = useState<ScrapeJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedJob, setSelectedJob] = useState<ScrapeJob | null>(null);

    const fetchJobs = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/scraper-network/jobs');
            if (!res.ok) throw new Error('Failed to fetch jobs');
            const data = await res.json();
            setJobs(data.jobs || []);
        } catch {
            setJobs([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchJobs();
        const interval = setInterval(fetchJobs, 15000);
        return () => clearInterval(interval);
    }, []);

    const getStatusIcon = (status: ScrapeJob['status']) => {
        switch (status) {
            case 'completed':
                return <CheckCircle2 className="h-4 w-4 text-green-600" />;
            case 'failed':
                return <XCircle className="h-4 w-4 text-red-600" />;
            case 'running':
                return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
            default:
                return <Clock className="h-4 w-4 text-gray-600" />;
        }
    };

    const formatDuration = (start: string, end: string | null) => {
        if (!end) return '—';
        const ms = new Date(end).getTime() - new Date(start).getTime();
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        return `${minutes}m ${seconds % 60}s`;
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    };

    return (
        <div className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <h3 className="font-medium text-gray-900">Recent Jobs</h3>
                <button
                    onClick={fetchJobs}
                    disabled={loading}
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-700 disabled:opacity-50"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {loading && jobs.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
                </div>
            ) : jobs.length === 0 ? (
                <div className="p-8 text-center text-gray-600">
                    No scraping jobs yet. Select products in the Pipeline and click &quot;Enhance Data&quot;.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-left text-gray-600">
                            <tr>
                                <th className="px-4 py-2 font-medium">Status</th>
                                <th className="px-4 py-2 font-medium">SKUs</th>
                                <th className="px-4 py-2 font-medium">Started</th>
                                <th className="px-4 py-2 font-medium">Duration</th>
                                <th className="px-4 py-2 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {jobs.map((job) => (
                                <tr 
                                    key={job.id} 
                                    className="hover:bg-gray-50 cursor-pointer"
                                    onClick={() => setSelectedJob(job)}
                                >
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            {getStatusIcon(job.status)}
                                            <span className="capitalize">{job.status}</span>
                                        </div>
                                        {job.error_message && (
                                            <p className="mt-1 text-xs text-red-600">{job.error_message}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium">
                                            {(job.skus || []).length} SKU{(job.skus || []).length !== 1 ? 's' : ''}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">
                                        {formatTime(job.created_at)}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">
                                        {formatDuration(job.created_at, job.completed_at)}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                            <Terminal className="h-4 w-4 text-gray-600" />
                                            <span className="sr-only">View Logs</span>
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
                <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
                    <DialogHeader className="p-4 border-b">
                        <DialogTitle>Job Execution Logs</DialogTitle>
                        <DialogDescription className="font-mono text-xs flex gap-4 mt-1">
                            <span>Job ID: {selectedJob?.id}</span>
                            <span className="capitalize">Status: {selectedJob?.status}</span>
                        </DialogDescription>
                    </DialogHeader>
                    {selectedJob && <LogViewer jobId={selectedJob.id} className="flex-1 rounded-none border-0" />}
                </DialogContent>
            </Dialog>
        </div>
    );
}
