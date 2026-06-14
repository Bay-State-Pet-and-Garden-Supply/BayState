'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { adminFetch } from '@/lib/admin/api-client';

interface ProductInfo {
    upc: string;
    input: any;
    product_line_confidence: number | null;
    product_line_assignment_source: 'ai' | 'manual' | 'migration' | null;
    product_line_review_required: boolean;
}

interface GroupData {
    product_line_id: string;
    product_line_name: string;
    products: ProductInfo[];
    review_required_count: number;
    ready: boolean;
    review_required_products: string[];
}

interface UngroupedData {
    upc: string;
    input: any;
    accepted: boolean;
    product_line_confidence: number | null;
    product_line_raw_label: string | null;
}

interface GroupingConsolidateStepProps {
    groups: GroupData[];
    ungrouped: UngroupedData[];
    onStageChange: (stage: string) => void;
    onRefresh: () => void;
}

export default function GroupingConsolidateStep({ groups, ungrouped, onStageChange, onRefresh }: GroupingConsolidateStepProps) {
    const [consolidating, setConsolidating] = useState(false);
    const [batchId, setBatchId] = useState<string | null>(null);
    const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
    const [complete, setComplete] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const readyGroups = groups.filter(g => g.ready);
    const acceptedSingletons = ungrouped.filter(u => u.accepted);
    const needsReviewItems = groups.filter(g => !g.ready).length + ungrouped.filter(u => !u.accepted).length;

    const readyGroupIds = readyGroups.map(g => g.product_line_id);
    const singletonUpcs = acceptedSingletons.map(s => s.upc);
    const totalProducts = readyGroups.reduce((sum, g) => sum + g.products.length, 0) + singletonUpcs.length;
    const totalGroups = readyGroups.length + acceptedSingletons.length;

    // Clean up polling on unmount
    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    const pollProgress = useCallback(async (bId: string) => {
        try {
            const res = await adminFetch(`/api/admin/grouping/consolidate/${bId}`);
            if (res.ok) {
                const data = await res.json();
                if (data.is_complete) {
                    setProgress({ completed: data.total, total: data.total });
                    setComplete(true);
                    if (pollRef.current) clearInterval(pollRef.current);
                } else {
                    setProgress({
                        completed: data.completed_requests || 0,
                        total: data.total_requests || 0,
                    });
                }
            }
        } catch {
            // silent — will retry on next interval
        }
    }, []);

    const startConsolidation = async () => {
        setConsolidating(true);
        setError(null);

        try {
            const res = await adminFetch('/api/admin/grouping/consolidate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product_line_ids: readyGroupIds,
                    singleton_upcs: singletonUpcs,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                setError(err.error || 'Failed to start consolidation');
                setConsolidating(false);
                return;
            }

            const data = await res.json();
            setBatchId(data.batch_id);
            setProgress({ completed: 0, total: totalProducts });

            // Start polling
            pollRef.current = setInterval(() => pollProgress(data.batch_id), 2500);
        } catch {
            setError('Failed to start consolidation');
            setConsolidating(false);
        }
    };

    const handleViewMerging = () => {
        onStageChange('merging');
    };

    if (readyGroups.length === 0 && acceptedSingletons.length === 0) {
        return (
            <div className="text-center text-gray-400 py-12">
                No approved groups or accepted singletons. Complete the Review step first.
                <div className="mt-4">
                    <button
                        onClick={() => onRefresh()}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
                    >
                        Refresh
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Summary section */}
            <div className="border rounded-lg p-4 bg-purple-50">
                <h3 className="font-medium text-purple-800 mb-3">Ready to Consolidate</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="text-center">
                        <div className="text-2xl font-bold text-purple-700">{readyGroups.length}</div>
                        <div className="text-xs text-purple-600">Approved Groups</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-purple-700">{acceptedSingletons.length}</div>
                        <div className="text-xs text-purple-600">Accepted Singletons</div>
                    </div>
                </div>
                <div className="text-xs text-purple-600">
                    {totalProducts} total products across {totalGroups} items
                </div>

                {readyGroups.length > 0 && (
                    <div className="mt-3">
                        <h4 className="text-xs font-medium text-purple-700 mb-1">Groups:</h4>
                        <div className="flex flex-wrap gap-1.5">
                            {readyGroups.map(g => (
                                <span key={g.product_line_id} className="text-[10px] bg-white px-2 py-0.5 rounded border border-purple-200">
                                    {g.product_line_name} ({g.products.length})
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Needs Review warning */}
            {needsReviewItems > 0 && (
                <div className="border rounded-lg p-3 bg-amber-50 text-amber-700">
                    <span className="text-sm font-medium">⚠ {needsReviewItems} item{needsReviewItems !== 1 ? 's' : ''} still need review</span>
                    <p className="text-xs mt-1">These will be skipped during consolidation. Go to the Review step to approve them first.</p>
                </div>
            )}

            {/* Consolidation progress */}
            {!consolidating && !complete && (
                <div className="flex justify-center pt-2">
                    <button
                        onClick={startConsolidation}
                        className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium shadow-sm"
                    >
                        Consolidate All Approved ({totalProducts} product{totalProducts !== 1 ? 's' : ''} in {totalGroups} group{totalGroups !== 1 ? 's' : ''})
                    </button>
                </div>
            )}

            {error && (
                <div className="border rounded-lg p-3 bg-red-50 text-red-700 text-sm">
                    Error: {error}
                    <button onClick={() => setError(null)} className="ml-2 underline text-xs">Dismiss</button>
                </div>
            )}

            {/* Progress bar */}
            {consolidating && progress && !complete && (
                <div className="border rounded-lg p-4 bg-white">
                    <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-700 font-medium">Consolidating...</span>
                        <span className="text-gray-500">{progress.completed} / {progress.total}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                            className="bg-purple-600 h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
                        />
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                        Processing products through AI consolidation. This may take a moment...
                    </p>
                </div>
            )}

            {/* Completion */}
            {complete && (
                <div className="border rounded-lg p-4 bg-green-50 text-center">
                    <div className="text-lg font-semibold text-green-800 mb-1">✅ Consolidation Complete</div>
                    <p className="text-sm text-green-600 mb-4">Results ready in Merging. Review and apply in the Merging tab.</p>
                    <button
                        onClick={handleViewMerging}
                        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                    >
                        View in Merging →
                    </button>
                </div>
            )}
        </div>
    );
}
