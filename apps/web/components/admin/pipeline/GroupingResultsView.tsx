'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/admin/api-client';
import type { PipelineStage } from '@/lib/pipeline/types';

interface ProductGroup {
    product_line_id: string;
    product_line_name: string;
    products: Array<{
        upc: string;
        product_line_confidence: number | null;
        product_line_assignment_source: 'ai' | 'manual' | 'migration' | null;
        product_line_review_required: boolean;
        input: any;
    }>;
    review_required_count: number;
}

interface UngroupedProduct {
    upc: string;
    product_line_confidence: number | null;
    product_line_raw_label: string | null;
    input: any;
}

interface GroupingData {
    groups: ProductGroup[];
    ungrouped: UngroupedProduct[];
}

interface GroupingResultsViewProps {
    onConsolidateGroups?: (groups: Array<{ product_line_id: string; upcs: string[] }>) => void;
    onStageChange?: (stage: PipelineStage) => void;
    onRefresh?: () => Promise<void>;
}

export default function GroupingResultsView({ onConsolidateGroups, onStageChange }: GroupingResultsViewProps) {
    const [data, setData] = useState<GroupingData>({ groups: [], ungrouped: [] });
    const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
    const [showReassign, setShowReassign] = useState<string | null>(null);
    const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [mergeSource, setMergeSource] = useState<string | null>(null);

    const fetchGroups = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await adminFetch('/api/admin/grouping/groups');
            if (res.ok) {
                setData(await res.json());
            } else {
                const err = await res.json();
                setError(err.error || 'Failed to fetch groups');
            }
        } catch {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchGroups(); }, [fetchGroups]);

    const toggleGroupSelection = (productLineId: string) => {
        setSelectedGroups(prev => {
            const next = new Set(prev);
            if (next.has(productLineId)) next.delete(productLineId);
            else next.add(productLineId);
            return next;
        });
    };

    const handleConsolidate = () => {
        const selected = Array.from(selectedGroups);
        const groups = data.groups
            .filter(g => selected.includes(g.product_line_id))
            .map(g => ({
                product_line_id: g.product_line_id,
                upcs: g.products.map(p => p.upc),
            }));
        onConsolidateGroups?.(groups);
    };

    const handleReassign = async (upc: string, targetLineId: string | null) => {
        try {
            const res = await adminFetch(`/api/admin/grouping/groups/${targetLineId || 'ungrouped'}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: targetLineId ? 'reassign' : 'ungroup',
                    upcs: [upc],
                }),
            });
            if (res.ok) fetchGroups();
        } catch {}
        setShowReassign(null);
    };

    const handleRename = async () => {
        if (!renameTarget || !renameValue.trim()) return;
        try {
            await adminFetch(`/api/admin/grouping/groups/${renameTarget.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'rename', new_name: renameValue.trim() }),
            });
            fetchGroups();
        } catch {}
        setRenameTarget(null);
        setRenameValue('');
    };

    const handleMerge = async (targetLineId: string) => {
        if (!mergeSource) return;
        try {
            await adminFetch(`/api/admin/grouping/groups/${mergeSource}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'merge', target_product_line_id: targetLineId }),
            });
            fetchGroups();
        } catch {}
        setMergeSource(null);
    };

    if (loading) return <div className="p-6 text-gray-500">Loading product groups...</div>;
    if (error) return <div className="p-6 text-red-500">Error: {error}</div>;

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Product Groups</h2>
                    <p className="text-sm text-gray-500">
                        {data.groups.length} group{data.groups.length !== 1 ? 's' : ''}, {data.ungrouped.length} ungrouped
                    </p>
                </div>
                <div className="flex gap-2">
                    {selectedGroups.size > 0 && (
                        <button
                            onClick={handleConsolidate}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
                        >
                            Consolidate Selected ({selectedGroups.size})
                        </button>
                    )}
                    <button onClick={fetchGroups} className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">
                        Refresh
                    </button>
                </div>
            </div>

            {/* Ungrouped products */}
            {data.ungrouped.length > 0 && (
                <div className="border rounded-lg p-4 bg-orange-50">
                    <h3 className="font-medium text-orange-800 mb-2">
                        Ungrouped ({data.ungrouped.length})
                    </h3>
                    <p className="text-xs text-orange-600 mb-2">
                        These products couldn't be confidently classified. They will be consolidated individually.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {data.ungrouped.map(p => (
                            <div key={p.upc} className="text-xs bg-white rounded p-2 border">
                                <div className="font-mono">{p.upc}</div>
                                {p.input?.name && <div className="text-gray-500 truncate">{p.input.name}</div>}
                                {p.product_line_raw_label && (
                                    <div className="text-orange-500 text-[10px]">
                                        AI guessed: {p.product_line_raw_label} ({((p.product_line_confidence || 0) * 100).toFixed(0)}%)
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Product Groups */}
            <div className="space-y-4">
                {data.groups.map(group => (
                    <div
                        key={group.product_line_id}
                        className={`border rounded-lg overflow-hidden ${
                            selectedGroups.has(group.product_line_id) ? 'ring-2 ring-purple-500' : ''
                        }`}
                    >
                        {/* Group header */}
                        <div className="flex items-center justify-between p-3 bg-gray-50">
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={selectedGroups.has(group.product_line_id)}
                                    onChange={() => toggleGroupSelection(group.product_line_id)}
                                    className="rounded"
                                />
                                <div>
                                    <div className="font-medium text-gray-900">{group.product_line_name}</div>
                                    <div className="text-xs text-gray-500">
                                        {group.products.length} product{group.products.length !== 1 ? 's' : ''}
                                        {group.review_required_count > 0 && (
                                            <span className="text-amber-600 ml-2">
                                                ⚠ {group.review_required_count} need review
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => setExpandedGroup(expandedGroup === group.product_line_id ? null : group.product_line_id)}
                                    className="text-xs px-2 py-1 border rounded hover:bg-gray-100"
                                >
                                    {expandedGroup === group.product_line_id ? 'Collapse' : 'Expand'}
                                </button>
                                <button
                                    onClick={() => { setRenameTarget({ id: group.product_line_id, name: group.product_line_name }); setRenameValue(group.product_line_name); }}
                                    className="text-xs px-2 py-1 border rounded hover:bg-gray-100"
                                >
                                    Rename
                                </button>
                                {!mergeSource && (
                                    <button
                                        onClick={() => setMergeSource(group.product_line_id)}
                                        className="text-xs px-2 py-1 border rounded hover:bg-gray-100 text-orange-600"
                                    >
                                        Merge Into...
                                    </button>
                                )}
                                {mergeSource && mergeSource !== group.product_line_id && (
                                    <button
                                        onClick={() => handleMerge(group.product_line_id)}
                                        className="text-xs px-2 py-1 bg-orange-100 border border-orange-300 rounded hover:bg-orange-200 text-orange-700"
                                    >
                                        Merge Here
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Products list (collapsed preview) */}
                        {expandedGroup === group.product_line_id && (
                            <div className="p-3 border-t">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                    {group.products.map(product => (
                                        <div key={product.upc} className="text-xs bg-gray-50 rounded p-2 border">
                                            <div className="flex justify-between">
                                                <span className="font-mono">{product.upc}</span>
                                                <span className={`text-[10px] px-1 rounded ${
                                                    product.product_line_assignment_source === 'manual' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                                }`}>
                                                    {product.product_line_assignment_source || 'ai'}
                                                </span>
                                            </div>
                                            {product.input?.name && (
                                                <div className="text-gray-500 truncate mt-1">{product.input.name}</div>
                                            )}
                                            {product.product_line_review_required && (
                                                <div className="text-amber-500 mt-1">⚠ Review needed</div>
                                            )}
                                            <button
                                                onClick={() => setShowReassign(product.upc)}
                                                className="text-[10px] text-purple-600 hover:underline mt-1"
                                            >
                                                Reassign
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {data.groups.length === 0 && data.ungrouped.length === 0 && (
                    <div className="text-center text-gray-400 py-12">
                        No products in grouping stage. Select products in the Processed tab and click "Group Products".
                    </div>
                )}
            </div>

            {/* Rename Dialog */}
            {renameTarget && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
                        <h3 className="font-semibold mb-3">Rename Product Line</h3>
                        <input
                            type="text"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            className="w-full border rounded px-3 py-2 text-sm mb-4"
                            placeholder="New name..."
                        />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setRenameTarget(null)} className="px-3 py-1.5 text-sm border rounded">Cancel</button>
                            <button onClick={handleRename} className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded">Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
