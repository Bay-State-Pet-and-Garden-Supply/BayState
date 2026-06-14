'use client';

import React, { useState, useCallback } from 'react';
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

interface GroupingReviewStepProps {
    groups: GroupData[];
    ungrouped: UngroupedData[];
    onRefresh: () => void;
    onNavigateStep: (step: string) => void;
}

export default function GroupingReviewStep({ groups, ungrouped, onRefresh, onNavigateStep }: GroupingReviewStepProps) {
    const [assignModal, setAssignModal] = useState<string | null>(null);
    const [assignTargetGroup, setAssignTargetGroup] = useState<string>('');
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const needsReviewGroups = groups.filter(g => !g.ready);
    const readyGroups = groups.filter(g => g.ready);
    const needsReviewUngrouped = ungrouped.filter(u => !u.accepted);
    const acceptedSingletons = ungrouped.filter(u => u.accepted);

    const callAction = useCallback(async (url: string, body: any) => {
        const key = JSON.stringify(body);
        setActionLoading(key);
        try {
            const res = await adminFetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) onRefresh();
        } catch {
            // silent
        } finally {
            setActionLoading(null);
        }
    }, [onRefresh]);

    const handleApproveGroup = (productLineId: string) => {
        callAction(`/api/admin/grouping/groups/${productLineId}`, { action: 'approve' });
    };

    const handleAcceptSingleton = (upc: string) => {
        callAction(`/api/admin/grouping/groups/ungrouped`, { action: 'accept_singleton', upcs: [upc] });
    };

    const handleAssignToGroup = (upc: string) => {
        if (!assignTargetGroup) return;
        callAction(`/api/admin/grouping/groups/${assignTargetGroup}`, { action: 'reassign', upcs: [upc] });
        setAssignModal(null);
        setAssignTargetGroup('');
    };

    return (
        <div className="space-y-6">
            {/* Section: Needs Review */}
            {(needsReviewGroups.length > 0 || needsReviewUngrouped.length > 0) && (
                <div className="border rounded-lg p-4 bg-amber-50">
                    <h3 className="font-medium text-amber-800 mb-3">
                        Needs Review ({needsReviewGroups.length + needsReviewUngrouped.length})
                    </h3>
                    <p className="text-xs text-amber-600 mb-3">
                        These items require attention before consolidation. Approve groups, accept singletons, or reassign.
                    </p>

                    {/* Ungrouped products needing review */}
                    {needsReviewUngrouped.length > 0 && (
                        <div className="mb-4">
                            <h4 className="text-sm font-medium text-amber-700 mb-2">Ungrouped Products — {needsReviewUngrouped.length}</h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {needsReviewUngrouped.map(p => (
                                    <div key={p.upc} className="text-xs bg-white rounded p-2 border border-amber-200">
                                        <div className="font-mono">{p.upc}</div>
                                        {p.input?.name && <div className="text-gray-500 truncate">{p.input.name}</div>}
                                        {p.product_line_raw_label && (
                                            <div className="text-amber-500 text-[10px]">
                                                AI guessed: {p.product_line_raw_label} ({((p.product_line_confidence || 0) * 100).toFixed(0)}%)
                                            </div>
                                        )}
                                        <div className="flex gap-1 mt-1.5">
                                            <button
                                                onClick={() => handleAcceptSingleton(p.upc)}
                                                disabled={actionLoading === JSON.stringify({ action: 'accept_singleton', upcs: [p.upc] })}
                                                className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                                            >
                                                Accept as Singleton
                                            </button>
                                            <button
                                                onClick={() => setAssignModal(p.upc)}
                                                className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                            >
                                                Assign to Group
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Groups needing review */}
                    {needsReviewGroups.length > 0 && (
                        <div>
                            <h4 className="text-sm font-medium text-amber-700 mb-2">Flagged Groups — {needsReviewGroups.length}</h4>
                            <div className="space-y-2">
                                {needsReviewGroups.map(g => (
                                    <div key={g.product_line_id} className="text-xs bg-white rounded p-3 border border-amber-200 flex items-center justify-between">
                                        <div>
                                            <span className="font-medium text-gray-900">{g.product_line_name}</span>
                                            <span className="text-gray-500 ml-2">{g.products.length} products</span>
                                            {g.review_required_count > 0 && (
                                                <span className="text-amber-600 ml-2">⚠ {g.review_required_count} flagged</span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleApproveGroup(g.product_line_id)}
                                            disabled={actionLoading === JSON.stringify({ action: 'approve' })}
                                            className="px-2.5 py-1 text-[11px] bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:opacity-50"
                                        >
                                            Approve Group
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Section: Ready */}
            {(readyGroups.length > 0 || acceptedSingletons.length > 0) && (
                <div className="border rounded-lg p-4 bg-green-50">
                    <h3 className="font-medium text-green-800 mb-3">
                        Ready ({readyGroups.length + acceptedSingletons.length})
                    </h3>

                    {readyGroups.length > 0 && (
                        <div className="mb-3">
                            <h4 className="text-sm font-medium text-green-700 mb-2">Approved Groups — {readyGroups.length}</h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {readyGroups.map(g => (
                                    <div key={g.product_line_id} className="text-xs bg-white rounded p-2 border border-green-200">
                                        <div className="font-medium text-gray-900">{g.product_line_name}</div>
                                        <div className="text-gray-500">{g.products.length} products</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {acceptedSingletons.length > 0 && (
                        <div>
                            <h4 className="text-sm font-medium text-green-700 mb-2">Accepted Singletons — {acceptedSingletons.length}</h4>
                            <div className="flex flex-wrap gap-2">
                                {acceptedSingletons.map(p => (
                                    <span key={p.upc} className="text-xs bg-white px-2 py-1 rounded border border-green-200 font-mono">
                                        {p.upc}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Empty state */}
            {needsReviewGroups.length === 0 && needsReviewUngrouped.length === 0 && readyGroups.length === 0 && acceptedSingletons.length === 0 && (
                <div className="text-center text-gray-400 py-12">
                    No products in the grouping stage. Select products in the Processed tab and click "Consolidate".
                </div>
            )}

            {/* CTA when nothing needs review but items are ready */}
            {needsReviewGroups.length === 0 && needsReviewUngrouped.length === 0 && (readyGroups.length > 0 || acceptedSingletons.length > 0) && (
                <div className="flex justify-center pt-2">
                    <button
                        onClick={() => onNavigateStep('consolidate')}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
                    >
                        All Reviewed — Proceed to Consolidate
                    </button>
                </div>
            )}

            {/* Assign to Group Modal */}
            {assignModal && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
                        <h3 className="font-semibold mb-3">Assign to Group</h3>
                        <p className="text-xs text-gray-500 mb-3">Select a product line for UPC: {assignModal}</p>
                        <select
                            value={assignTargetGroup}
                            onChange={e => setAssignTargetGroup(e.target.value)}
                            className="w-full border rounded px-3 py-2 text-sm mb-4"
                        >
                            <option value="">Choose a group...</option>
                            {[...readyGroups, ...needsReviewGroups].map(g => (
                                <option key={g.product_line_id} value={g.product_line_id}>{g.product_line_name}</option>
                            ))}
                        </select>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => { setAssignModal(null); setAssignTargetGroup(''); }} className="px-3 py-1.5 text-sm border rounded">Cancel</button>
                            <button onClick={() => handleAssignToGroup(assignModal)} disabled={!assignTargetGroup} className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded disabled:opacity-50">Assign</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
