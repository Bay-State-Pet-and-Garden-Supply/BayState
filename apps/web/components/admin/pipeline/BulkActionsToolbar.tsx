'use client';

import { useState } from 'react';
import { Loader2, ArrowRight, Trash2 } from 'lucide-react';
import type { PipelineStatus } from '@/lib/pipeline/types';
import { ExportButton } from './ExportButton';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';

interface BulkActionsToolbarProps {
    selectedCount: number;
    currentStatus: PipelineStatus;
    searchQuery?: string;
    onAction: (action: ToolbarAction) => void;
    onMoveToEnriched?: () => void;
    isMovingToEnriched?: boolean;
    onClearSelection: () => void;
    selectedSkus?: string[];
    onDeleteStart?: () => void;
    onDeleteEnd?: () => void;
    onConsolidate?: () => void;
    isConsolidating?: boolean;
    onClearScrapeResults?: () => void;
    isClearingScrapeResults?: boolean;
    onEnrich?: () => void;
    isEnriching?: boolean;
}

type ToolbarAction = 'moveToEnriched' | 'moveToFinalized' | 'approve' | 'publish' | 'reject' | 'consolidate' | 'delete' | 'enrich';

type ActionButton = {
    action: ToolbarAction;
    label: string;
    className: string;
};

const newStatusMap: Record<PipelineStatus, ActionButton[]> = {
    imported: [
        { action: 'enrich', label: 'Run Scrapers', className: 'bg-blue-600 hover:bg-blue-700' },
    ],
    monitoring: [], // Transient state
    scraped: [
        { action: 'consolidate', label: 'AI Consolidate', className: 'bg-purple-600 hover:bg-purple-700' },
    ],
    consolidated: [
        { action: 'approve', label: 'Approve', className: 'bg-green-600 hover:bg-green-700' },
        { action: 'reject', label: 'Reject', className: 'bg-amber-600 hover:bg-amber-700' },
    ],
    finalized: [
        { action: 'publish', label: 'Publish', className: 'bg-green-600 hover:bg-green-700' },
        { action: 'reject', label: 'Reject', className: 'bg-amber-600 hover:bg-amber-700' },
    ],
    failed: [], // Retry handled elsewhere
    published: [], // Terminal state
};


const legacyActionsMap: Record<PipelineStatus, ActionButton[]> = {
    imported: [],
    monitoring: [],
    scraped: [{ action: 'consolidate', label: 'Consolidate', className: 'bg-blue-600 hover:bg-blue-700' }],
    consolidated: [
        { action: 'approve', label: 'Approve', className: 'bg-green-600 hover:bg-green-700' },
        { action: 'reject', label: 'Reject', className: 'bg-amber-600 hover:bg-amber-700' },
    ],
    finalized: [
        { action: 'publish', label: 'Publish', className: 'bg-green-600 hover:bg-green-700' },
        { action: 'reject', label: 'Reject', className: 'bg-amber-600 hover:bg-amber-700' },
    ],
    failed: [],
    published: [],
};


export function BulkActionsToolbar({
    selectedCount,
    currentStatus,
    searchQuery,
    onAction,
    onMoveToEnriched,
    isMovingToEnriched = false,
    onClearSelection,
    selectedSkus = [],
    onDeleteStart,
    onDeleteEnd,
    onConsolidate,
    isConsolidating = false,
    onClearScrapeResults,
    isClearingScrapeResults = false,
    onEnrich,
    isEnriching = false,
}: BulkActionsToolbarProps) {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const isNewPipeline = true;
    const actions = newStatusMap[currentStatus];
    const isBusy = isMovingToEnriched || isDeleting || isConsolidating || isClearingScrapeResults || isEnriching;

    const handleDeleteClick = () => {
        setIsDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        setIsDeleting(true);
        onDeleteStart?.();
        try {
            onAction('delete');
            await new Promise(resolve => setTimeout(resolve, 100));
            setIsDeleteDialogOpen(false);
        } finally {
            setIsDeleting(false);
            onDeleteEnd?.();
        }
    };

    return (
        <>
            <DeleteConfirmationDialog
                isOpen={isDeleteDialogOpen}
                onOpenChange={setIsDeleteDialogOpen}
                productCount={selectedCount}
                onConfirm={handleDeleteConfirm}
                isDeleting={isDeleting}
            />
            
            <div className="flex items-center gap-4 rounded-lg bg-gray-900 px-4 py-3 text-white">
                {selectedCount > 0 ? (
                    <span className="text-sm">
                        {selectedCount} product{selectedCount > 1 ? 's' : ''} selected
                    </span>
                ) : (
                    <span className="text-sm text-muted-foreground">
                        Pipeline Actions
                    </span>
                )}

                <div className="flex-1" />

                <div className="flex items-center gap-2">
                    {selectedCount > 0 && (
                        <>
                            {/* Status transition buttons */}

                            {actions.map(({ action, label, className }) => (
                                <button
                                    key={action}
                                    type="button"
                                    onClick={() => {
                                        if (action === 'consolidate' && onConsolidate) {
                                            void onConsolidate();
                                            return;
                                        }
                                        if (action === 'enrich' && onEnrich) {
                                            void onEnrich();
                                            return;
                                        }
                                        onAction(action);
                                    }}
                                    disabled={isBusy}
                                    className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${className}`}
                                >
                                    {action === 'consolidate' && isConsolidating ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : action === 'reject' ? (
                                        <Trash2 className="h-4 w-4" />
                                    ) : (
                                        <ArrowRight className="h-4 w-4" />
                                    )}
                                    {action === 'consolidate' && isConsolidating ? 'Consolidating…' : label}
                                </button>
                            ))}

                            {(currentStatus === 'scraped') && onClearScrapeResults && (
                                <button
                                    type="button"
                                    onClick={() => void onClearScrapeResults()}
                                    disabled={isBusy}
                                    className="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
                                >
                                    {isClearingScrapeResults ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    {isClearingScrapeResults ? 'Clearing…' : 'Clear Scrape Results'}
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={handleDeleteClick}
                                disabled={isBusy}
                                className="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors bg-red-600 hover:bg-red-700 disabled:opacity-50"
                                title="Permanently delete selected products"
                            >
                                <Trash2 className="h-4 w-4" />
                                Delete
                            </button>

                            <button
                                type="button"
                                onClick={onClearSelection}
                                disabled={isBusy}
                                className="rounded px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white disabled:opacity-50"
                            >
                                Clear
                            </button>
                            
                            <div className="h-4 w-px bg-gray-700 mx-2" />
                        </>
                    )}
                    
                    {isNewPipeline && <ExportButton currentStatus={currentStatus} searchQuery={searchQuery} />}
                </div>
            </div>
        </>
    );
}
