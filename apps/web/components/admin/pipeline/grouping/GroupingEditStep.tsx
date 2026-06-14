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

interface GroupingEditStepProps {
    groups: GroupData[];
    onRefresh: () => void;
    onNavigateStep: (step: string) => void;
}

export default function GroupingEditStep({ groups, onRefresh, onNavigateStep }: GroupingEditStepProps) {
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
    const [selectedUpcs, setSelectedUpcs] = useState<Set<string>>(new Set());
    const [dragSource, setDragSource] = useState<{ upc: string; sourceGroupId: string } | null>(null);
    const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [mergeSource, setMergeSource] = useState<string | null>(null);
    const [splitDialog, setSplitDialog] = useState(false);
    const [splitName, setSplitName] = useState('');
    const [moveToGroup, setMoveToGroup] = useState<string>('');
    const [showMoveDialog, setShowMoveDialog] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    const callAction = useCallback(async (url: string, body: any) => {
        setActionLoading(true);
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
            setActionLoading(false);
        }
    }, [onRefresh]);

    // Drag and drop handlers — native HTML5
    const handleDragStart = (upc: string, sourceGroupId: string) => {
        setDragSource({ upc, sourceGroupId });
    };

    const handleDrop = (targetGroupId: string) => {
        if (!dragSource || dragSource.sourceGroupId === targetGroupId) {
            setDragSource(null);
            return;
        }
        callAction(`/api/admin/grouping/groups/${targetGroupId}`, {
            action: 'reassign',
            upcs: [dragSource.upc],
        });
        setDragSource(null);
    };

    const handleDragOver = (e: React.DragEvent) => e.preventDefault();

    // Bulk operations
    const handleBulkMove = () => {
        if (!moveToGroup || selectedUpcs.size === 0) return;
        callAction(`/api/admin/grouping/groups/${moveToGroup}`, {
            action: 'reassign',
            upcs: Array.from(selectedUpcs),
        });
        setSelectedUpcs(new Set());
        setShowMoveDialog(false);
    };

    const handleBulkUngroup = () => {
        if (selectedUpcs.size === 0) return;
        callAction(`/api/admin/grouping/groups/ungrouped`, {
            action: 'ungroup',
            upcs: Array.from(selectedUpcs),
        });
        setSelectedUpcs(new Set());
    };

    const handleSplitSelected = () => {
        if (!splitName.trim() || selectedUpcs.size === 0) return;
        const firstUpc = Array.from(selectedUpcs)[0];
        callAction(`/api/admin/grouping/groups/${firstUpc}`, {
            action: 'split',
            upcs: Array.from(selectedUpcs),
            new_name: splitName.trim(),
        });
        setSelectedUpcs(new Set());
        setSplitName('');
        setSplitDialog(false);
    };

    const handleRename = async () => {
        if (!renameTarget || !renameValue.trim()) return;
        await callAction(`/api/admin/grouping/groups/${renameTarget.id}`, { action: 'rename', new_name: renameValue.trim() });
        setRenameTarget(null);
        setRenameValue('');
    };

    const handleMerge = (targetLineId: string) => {
        if (!mergeSource) return;
        callAction(`/api/admin/grouping/groups/${mergeSource}`, { action: 'merge', target_product_line_id: targetLineId });
        setMergeSource(null);
    };

    const toggleUpcSelection = (upc: string) => {
        setSelectedUpcs(prev => {
            const next = new Set(prev);
            if (next.has(upc)) next.delete(upc);
            else next.add(upc);
            return next;
        });
    };

    if (groups.length === 0) {
        return (
            <div className="text-center text-gray-400 py-12">
                No product groups to edit. Complete the Review step first.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Bulk selection toolbar */}
            {selectedUpcs.size > 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-sm text-purple-700 font-medium">{selectedUpcs.size} selected</span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowMoveDialog(true)}
                            className="px-2.5 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                        >
                            Move to Group...
                        </button>
                        <button
                            onClick={handleBulkUngroup}
                            disabled={actionLoading}
                            className="px-2.5 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 disabled:opacity-50"
                        >
                            Ungroup
                        </button>
                        <button
                            onClick={() => setSplitDialog(true)}
                            className="px-2.5 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        >
                            Create New Group from Selection
                        </button>
                        <button
                            onClick={() => setSelectedUpcs(new Set())}
                            className="px-2.5 py-1 text-xs border rounded hover:bg-gray-50"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            )}

            {/* Group cards */}
            <div className="space-y-4">
                {groups.map(group => (
                    <div
                        key={group.product_line_id}
                        className={`border rounded-lg overflow-hidden transition-shadow ${
                            dragSource && dragSource.sourceGroupId !== group.product_line_id ? 'border-dashed border-purple-300 bg-purple-50/30' : ''
                        }`}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(group.product_line_id)}
                    >
                        {/* Group header */}
                        <div className="flex items-center justify-between p-3 bg-gray-50">
                            <div className="flex items-center gap-3">
                                <div>
                                    {/* Inline-rename group name */}
                                    {renameTarget?.id === group.product_line_id ? (
                                        <input
                                            type="text"
                                            value={renameValue}
                                            onChange={e => setRenameValue(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenameTarget(null); }}
                                            className="text-sm font-medium border rounded px-2 py-0.5"
                                            autoFocus
                                        />
                                    ) : (
                                        <div
                                            className="font-medium text-gray-900 cursor-pointer hover:text-purple-700"
                                            onClick={() => { setRenameTarget({ id: group.product_line_id, name: group.product_line_name }); setRenameValue(group.product_line_name); }}
                                            title="Click to rename"
                                        >
                                            {group.product_line_name}
                                        </div>
                                    )}
                                    <div className="text-xs text-gray-500">
                                        {group.products.length} product{group.products.length !== 1 ? 's' : ''}
                                        <span className="ml-2 text-[10px] text-gray-400">(drag products here)</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-1">
                                {renameTarget?.id !== group.product_line_id && (
                                    <button
                                        onClick={() => { setRenameTarget({ id: group.product_line_id, name: group.product_line_name }); setRenameValue(group.product_line_name); }}
                                        className="text-xs px-2 py-1 border rounded hover:bg-gray-100"
                                    >
                                        Rename
                                    </button>
                                )}
                                {renameTarget?.id === group.product_line_id && (
                                    <>
                                        <button onClick={handleRename} className="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700">Save</button>
                                        <button onClick={() => setRenameTarget(null)} className="text-xs px-2 py-1 border rounded hover:bg-gray-100">Cancel</button>
                                    </>
                                )}
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
                                {mergeSource === group.product_line_id && (
                                    <span className="text-xs text-orange-600 px-2 py-1">Select target above...</span>
                                )}
                                <button
                                    onClick={() => setExpandedGroup(expandedGroup === group.product_line_id ? null : group.product_line_id)}
                                    className="text-xs px-2 py-1 border rounded hover:bg-gray-100"
                                >
                                    {expandedGroup === group.product_line_id ? 'Collapse' : 'Expand'}
                                </button>
                            </div>
                        </div>

                        {/* Products list */}
                        {expandedGroup === group.product_line_id && (
                            <div className="p-3 border-t">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                    {group.products.map(product => (
                                        <div
                                            key={product.upc}
                                            draggable
                                            onDragStart={() => handleDragStart(product.upc, group.product_line_id)}
                                            className={`text-xs bg-gray-50 rounded p-2 border cursor-grab active:cursor-grabbing ${
                                                selectedUpcs.has(product.upc) ? 'ring-2 ring-purple-400' : ''
                                            } ${dragSource?.upc === product.upc ? 'opacity-50' : ''}`}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedUpcs.has(product.upc)}
                                                    onChange={() => toggleUpcSelection(product.upc)}
                                                    className="rounded"
                                                />
                                                <span className="font-mono flex-1">{product.upc}</span>
                                                <span className={`text-[10px] px-1 rounded ${
                                                    product.product_line_assignment_source === 'manual' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                                }`}>
                                                    {product.product_line_assignment_source || 'ai'}
                                                </span>
                                            </div>
                                            {product.input?.name && (
                                                <div className="text-gray-500 truncate mt-0.5 ml-5">{product.input.name}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Proceed to Consolidate */}
            <div className="flex justify-center pt-4">
                <button
                    onClick={() => onNavigateStep('consolidate')}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
                >
                    Done Editing — Proceed to Consolidate
                </button>
            </div>

            {/* Move to Group Dialog */}
            {showMoveDialog && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
                        <h3 className="font-semibold mb-3">Move {selectedUpcs.size} Products to Group</h3>
                        <select
                            value={moveToGroup}
                            onChange={e => setMoveToGroup(e.target.value)}
                            className="w-full border rounded px-3 py-2 text-sm mb-4"
                        >
                            <option value="">Choose a group...</option>
                            {groups.map(g => (
                                <option key={g.product_line_id} value={g.product_line_id}>{g.product_line_name}</option>
                            ))}
                        </select>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => { setShowMoveDialog(false); setMoveToGroup(''); }} className="px-3 py-1.5 text-sm border rounded">Cancel</button>
                            <button onClick={handleBulkMove} disabled={!moveToGroup} className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded disabled:opacity-50">Move</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Split Dialog */}
            {splitDialog && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
                        <h3 className="font-semibold mb-3">Create New Product Line</h3>
                        <p className="text-xs text-gray-500 mb-2">{selectedUpcs.size} products will be moved to a new group</p>
                        <input
                            type="text"
                            value={splitName}
                            onChange={e => setSplitName(e.target.value)}
                            placeholder="New product line name..."
                            className="w-full border rounded px-3 py-2 text-sm mb-4"
                        />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => { setSplitDialog(false); setSplitName(''); }} className="px-3 py-1.5 text-sm border rounded">Cancel</button>
                            <button onClick={handleSplitSelected} disabled={!splitName.trim()} className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded disabled:opacity-50">Create & Move</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
