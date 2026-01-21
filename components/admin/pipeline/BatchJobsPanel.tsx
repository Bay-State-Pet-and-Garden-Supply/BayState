'use client';

import { useState, useEffect } from 'react';
import { 
    ChevronDown, 
    ChevronUp, 
    RefreshCw, 
    CheckCircle, 
    XCircle, 
    Clock, 
    Sparkles, 
    ArrowRight,
    AlertCircle,
    Play
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

export interface BatchJob {
    id: string;
    status: 'validating' | 'in_progress' | 'completed' | 'failed';
    progress: number;
    total_products: number;
    processed_products: number;
    created_at: string;
    completed_at?: string;
    error?: string;
}

interface BatchJobsPanelProps {
    onApplyBatch: (batchId: string) => Promise<void>;
    activeBatchId?: string | null;
}

const statusConfig = {
    validating: {
        label: 'Validating',
        color: 'text-yellow-700 bg-yellow-50 ring-yellow-600/20',
        icon: Clock
    },
    in_progress: {
        label: 'Processing',
        color: 'text-blue-700 bg-blue-50 ring-blue-700/10',
        icon: Sparkles
    },
    completed: {
        label: 'Completed',
        color: 'text-green-700 bg-green-50 ring-green-600/20',
        icon: CheckCircle
    },
    failed: {
        label: 'Failed',
        color: 'text-red-700 bg-red-50 ring-red-600/10',
        icon: XCircle
    }
};

export function BatchJobsPanel({ onApplyBatch, activeBatchId }: BatchJobsPanelProps) {
    const [jobs, setJobs] = useState<BatchJob[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExpanded, setIsExpanded] = useState(true);
    const [applyingId, setApplyingId] = useState<string | null>(null);

    const fetchJobs = async () => {
        try {
            const res = await fetch('/api/admin/consolidation/jobs');
            if (res.ok) {
                const data = await res.json();
                setJobs(data.jobs || []);
            }
        } catch (err) {
            console.error('Failed to fetch consolidation jobs:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Initial fetch
    useEffect(() => {
        fetchJobs();
    }, []);

    // Polling for active jobs
    useEffect(() => {
        const hasActiveJobs = jobs.some(j => 
            j.status === 'in_progress' || j.status === 'validating'
        );
        
        if (!hasActiveJobs) return;

        const interval = setInterval(fetchJobs, 10000); // 10s poll
        return () => clearInterval(interval);
    }, [jobs]);

    const handleApply = async (batchId: string) => {
        setApplyingId(batchId);
        try {
            await onApplyBatch(batchId);
            // Refresh jobs to show updated status if needed (though usually applied jobs might disappear or change status)
            await fetchJobs();
        } finally {
            setApplyingId(null);
        }
    };

    if (jobs.length === 0 && !isLoading) {
        return null; // Don't show if no history
    }

    return (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex w-full items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-purple-600" />
                        <h3 className="text-sm font-semibold text-gray-900">Consolidation History</h3>
                        <Badge variant="secondary" className="bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs py-0.5">
                            {jobs.length}
                        </Badge>
                    </div>
                <div className="flex items-center gap-2 text-gray-600">
                    {isLoading && <RefreshCw className="h-3 w-3 animate-spin" />}
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
            </button>

            {/* List */}
            {isExpanded && (
                <div className="border-t border-gray-200 divide-y divide-gray-100">
                    {jobs.map((job) => {
                        const status = statusConfig[job.status] || statusConfig.validating;
                        const StatusIcon = status.icon;
                        const isApplying = applyingId === job.id;
                        const isActive = activeBatchId === job.id;

                        return (
                            <div 
                                key={job.id} 
                                className={`px-4 py-3 hover:bg-gray-50 transition-colors ${isActive ? 'bg-purple-50/50' : ''}`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                                            job.status === 'completed' ? 'bg-green-100 text-green-600' :
                                            job.status === 'failed' ? 'bg-red-100 text-red-600' :
                                            'bg-purple-100 text-purple-600'
                                        }`}>
                                            <StatusIcon className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-gray-900">
                                                    Batch #{job.id.slice(0, 8)}
                                                </span>
                                                <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${status.color}`}>
                                                    {status.label}
                                                </span>
                                            </div>
                                            <div className="text-xs text-gray-600 mt-0.5">
                                                {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                                                {' • '}
                                                {job.total_products} products
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2">
                                        {job.status === 'completed' && (
                                            <button
                                                onClick={() => handleApply(job.id)}
                                                disabled={isApplying}
                                                className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                                            >
                                                {isApplying ? (
                                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <CheckCircle className="h-3 w-3 text-green-600" />
                                                )}
                                                Apply Results
                                            </button>
                                        )}
                                        {job.status === 'in_progress' && (
                                            <span className="text-xs font-medium text-blue-600 animate-pulse">
                                                Processing...
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Progress Bar for active/processing jobs */}
                                {(job.status === 'in_progress' || job.status === 'validating') && (
                                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                                        <div 
                                            className="h-full bg-purple-600 transition-all duration-500 ease-out"
                                            style={{ width: `${job.progress}%` }}
                                        />
                                    </div>
                                )}

                                {/* Error Message */}
                                {job.status === 'failed' && job.error && (
                                    <div className="mt-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                                        <AlertCircle className="h-3 w-3" />
                                        {job.error}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
