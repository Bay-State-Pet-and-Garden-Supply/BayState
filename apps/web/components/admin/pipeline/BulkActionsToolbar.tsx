'use client';

import { useState } from 'react';
import { Loader2, ArrowRight, Trash2 } from 'lucide-react';
import type { NewPipelineStatus, PipelineStatus } from '@/lib/pipeline';
import { ExportButton } from './ExportButton';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';

interface BulkActionsToolbarProps {
    selectedCount: number;
    currentStatus: NewPipelineStatus | PipelineStatus;
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
}

type ToolbarAction = 'moveToEnriched' | 'moveToFinalized' | 'approve' | 'publish' | 'reject' | 'consolidate' | 'delete';

type ActionButton = {
    action: ToolbarAction;
    label: string;
    className: string;
};

const newStatusMap: Record<NewPipelineStatus, ActionButton[]> = {
    registered: [
        // Note: Products are automatically moved to 'enriched' by scrapers
        // Manual enrichment is not available - scrapers handle this transition
    ],
    enriched: [
        { action: 'moveToFinalized', label: 'Move to Finalized', className: 'bg-green-600 hover:bg-green-700' },
    ],
    finalized: [], // Terminal state - no outgoing transitions
};


const legacyActionsMap: Record<PipelineStatus, ActionButton[]> = {
    staging: [],
    scraped: [{ action: 'consolidate', label: 'Consolidate', className: 'bg-blue-600 hover:bg-blue-700' }],
    consolidated: [
        { action: 'approve', label: 'Approve', className: 'bg-green-600 hover:bg-green-700' },
        { action: 'reject', label: 'Reject', className: 'bg-amber-600 hover:bg-amber-700' },
    ],
    approved: [
        { action: 'publish', label: 'Publish', className: 'bg-green-600 hover:bg-green-700' },
        { action: 'reject', label: 'Reject', className: 'bg-amber-600 hover:bg-amber-700' },
    ],
    published: [],
    failed: [],
};

function isNewPipelineStatus(status: NewPipelineStatus | PipelineStatus): status is NewPipelineStatus {
    return status === 'registered' || status === 'enriched' || status === 'finalized';
}

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
}: BulkActionsToolbarProps) {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const isNewPipeline = isNewPipelineStatus(currentStatus);
    const actions = isNewPipeline ? newStatusMap[currentStatus] : legacyActionsMap[currentStatus];
    const isBusy = isMovingToEnriched || isDeleting || isConsolidating || isClearingScrapeResults;

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
                    <span className="text-sm text-gray-400">
                        Pipeline Actions
                    </span>
                )}

                <div className="flex-1" />

                <div className="flex items-center gap-2">
                    {selectedCount > 0 && (
                        <>
                            {/* Status transition buttons - scrapers handle enrichment automatically */}

                            {/* Status transition buttons */}
                            {actions.map(({ action, label, className }) => (
                                <button
                                    key={action}
                                    onClick={() => {
                                        if (action === 'consolidate' && onConsolidate) {
                                            void onConsolidate();
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

                            {!isNewPipeline && currentStatus === 'scraped' && onClearScrapeResults && (
                                <button
                                    onClick={() => void onClearScrapeResults()}
                                    disabled={isBusy}
                                    className="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
                                >
                                    {isClearingScrapeResults ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    {isClearingScrapeResults ? 'Clearing…' : 'Clear Scrape Results'}
                                </button>
                            )}

                            <button
                                onClick={handleDeleteClick}
                                disabled={isBusy}
                                className="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors bg-red-600 hover:bg-red-700 disabled:opacity-50"
                                title="Permanently delete selected products"
                            >
                                <Trash2 className="h-4 w-4" />
                                Delete
                            </button>

                            <button
                                onClick={onClearSelection}
                                disabled={isBusy}
                                className="rounded px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white disabled:opacity-50"
                            >
                                Clear
                            </button>
                            
                            <div className="h-4 w-px bg-gray-700 mx-2" />
                        </>
                    )}
                    
                    {isNewPipeline && <ExportButton currentStatus={currentStatus as NewPipelineStatus} searchQuery={searchQuery} />}
                </div>
            </div>
        </>
    );
}
