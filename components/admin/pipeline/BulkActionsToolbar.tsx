'use client';

import { useState } from 'react';
import { Bot, Loader2, Sparkles } from 'lucide-react';
import type { PipelineStatus } from '@/lib/pipeline';
import { ExportButton } from './ExportButton';
import { DeleteConfirmationDialog } from './DeleteConfirmationDialog';

interface BulkActionsToolbarProps {
    selectedCount: number;
    currentStatus: PipelineStatus;
    searchQuery?: string;
    onAction: (action: 'approve' | 'publish' | 'reject' | 'consolidate' | 'delete') => void;
    onScrape?: () => void;
    isScraping?: boolean;
    runnersAvailable?: boolean;
    onConsolidate?: () => void;
    isConsolidating?: boolean;
    onClearSelection: () => void;
    selectedSkus?: string[];
    onDeleteStart?: () => void;
    onDeleteEnd?: () => void;
}

const nextStatusMap: Record<PipelineStatus, { action: string; nextStatus: PipelineStatus }[]> = {
    staging: [], // Staging (Imported) tab is now read-only, no bulk actions
    scraped: [
        { action: 'consolidate', nextStatus: 'consolidated' },
    ],
    consolidated: [
        { action: 'approve', nextStatus: 'approved' },
        { action: 'reject', nextStatus: 'staging' },
    ],
    approved: [
        { action: 'publish', nextStatus: 'published' },
        { action: 'reject', nextStatus: 'consolidated' },
    ],
    published: [],
    failed: [], // Failed products need manual retry
};

const actionLabels: Record<string, string> = {
    consolidate: 'Prepare for Review',
    approve: 'Verify Data',
    publish: 'Make Live',
    reject: 'Move Back',
};

export function BulkActionsToolbar({
    selectedCount,
    currentStatus,
    searchQuery,
    onAction,
    onScrape,
    isScraping = false,
    runnersAvailable = false,
    onConsolidate,
    isConsolidating = false,
    onClearSelection,
    selectedSkus = [],
    onDeleteStart,
    onDeleteEnd,
}: BulkActionsToolbarProps) {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const actions = nextStatusMap[currentStatus];
    const showScrapeButton = currentStatus === 'staging' && onScrape;

    const visibleActions = onConsolidate
        ? actions.filter(a => a.action !== 'consolidate')
        : actions;

    const showConsolidateButton = onConsolidate && currentStatus === 'scraped';

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
                            {showScrapeButton && (
                                <button
                                    onClick={onScrape}
                                    disabled={isScraping || !runnersAvailable || isConsolidating}
                                    className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors ${runnersAvailable
                                        ? 'bg-purple-600 hover:bg-purple-700'
                                        : 'bg-gray-600 cursor-not-allowed'
                                        } disabled:opacity-50`}
                                    title={!runnersAvailable ? 'No scraping runners available' : undefined}
                                >
                                    {isScraping ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Bot className="h-4 w-4" />
                                    )}
                                    {isScraping ? 'Scraping...' : 'Enhance Data'}
                                </button>
                            )}

                            {showConsolidateButton && (
                                <button
                                    onClick={onConsolidate}
                                    disabled={isConsolidating || isScraping}
                                    className="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                                >
                                    {isConsolidating ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Sparkles className="h-4 w-4" />
                                    )}
                                    {isConsolidating ? 'Consolidating...' : 'AI Consolidate'}
                                </button>
                            )}

                            {visibleActions.map(({ action }) => (
                                <button
                                    key={action}
                                    onClick={() => onAction(action as 'approve' | 'publish' | 'reject' | 'consolidate')}
                                    disabled={isScraping || isConsolidating}
                                    className={`rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${action === 'reject'
                                        ? 'bg-red-600 hover:bg-red-700'
                                        : action === 'publish'
                                            ? 'bg-green-600 hover:bg-green-700'
                                            : 'bg-blue-600 hover:bg-blue-700'
                                        }`}
                                >
                                    {actionLabels[action] || action.charAt(0).toUpperCase() + action.slice(1)}
                                </button>
                            ))}

                            <button
                                onClick={handleDeleteClick}
                                disabled={isScraping || isConsolidating || isDeleting}
                                className="rounded px-3 py-1.5 text-sm font-medium transition-colors bg-red-600 hover:bg-red-700 disabled:opacity-50"
                                title="Permanently delete selected products"
                            >
                                Delete
                            </button>

                            <button
                                onClick={onClearSelection}
                                disabled={isScraping || isConsolidating}
                                className="rounded px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white disabled:opacity-50"
                            >
                                Clear
                            </button>
                            
                            <div className="h-4 w-px bg-gray-700 mx-2" />
                        </>
                    )}
                    
                    <ExportButton currentStatus={currentStatus} searchQuery={searchQuery} />
                </div>
            </div>
        </>
    );
}
