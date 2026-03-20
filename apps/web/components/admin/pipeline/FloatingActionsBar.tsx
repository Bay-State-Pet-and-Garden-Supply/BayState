'use client';

import { Loader2, X, CheckSquare, Plus, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PipelineStatus } from '@/lib/pipeline/types';

/**
 * Bulk action configuration for each pipeline stage.
 * 'imported' opens the scraper selection dialog instead of a direct move.
 */
const BULK_ACTIONS: Record<PipelineStatus, { 
  label: string; 
  nextStage: PipelineStatus | null; 
  resetLabel?: string;
  previousStage?: PipelineStatus | null;
  secondaryAction?: string;
}> = {
  imported: { label: 'Scrape Selected', nextStage: 'scraped' },
  monitoring: { label: '', nextStage: null, resetLabel: 'Cancel & Return to Import', previousStage: 'imported' },
  scraped: { label: 'Consolidate Selected', nextStage: 'consolidated', resetLabel: 'Clear & Return to Import', previousStage: 'imported', secondaryAction: 'Scrape Additional Sources' },
  consolidated: { label: 'Finalize Selected', nextStage: 'finalized', resetLabel: 'Reset Consolidation', previousStage: 'scraped' },
  finalized: { label: 'Publish Selected', nextStage: 'published', resetLabel: 'Return to Consolidation', previousStage: 'consolidated' },
  published: { label: '', nextStage: null },
};

interface FloatingActionsBarProps {
  selectedCount: number;
  totalCount: number;
  currentStage: PipelineStatus;
  isLoading: boolean;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onBulkAction: (nextStage: PipelineStatus) => void;
  onResetStage?: (previousStage: PipelineStatus) => void;
  onOpenScrapeDialog?: () => void;
  onDelete?: () => void;
}

export function FloatingActionsBar({
  selectedCount,
  totalCount,
  currentStage,
  isLoading,
  onClearSelection,
  onSelectAll,
  onBulkAction,
  onResetStage,
  onOpenScrapeDialog,
  onDelete,
}: FloatingActionsBarProps) {
  if (selectedCount === 0) return null;

  const bulkAction = BULK_ACTIONS[currentStage];
  const isTerminalStage = currentStage === 'published';
  const hasBulkAction = !isTerminalStage && bulkAction.nextStage !== null;
  const hasResetAction = !!bulkAction.resetLabel && !!bulkAction.previousStage && !!onResetStage;
  const isImported = currentStage === 'imported';
  const hasSecondaryAction = !!bulkAction.secondaryAction && !!onOpenScrapeDialog;

  const handlePrimaryAction = () => {
    if (isImported && onOpenScrapeDialog) {
      onOpenScrapeDialog();
    } else if (bulkAction.nextStage) {
      onBulkAction(bulkAction.nextStage);
    }
  };

  const handleResetAction = () => {
    if (bulkAction.previousStage && onResetStage) {
      if (confirm(`Are you sure you want to ${bulkAction.resetLabel?.toLowerCase()} for ${selectedCount} product${selectedCount !== 1 ? 's' : ''}? This action may clear data.`)) {
        onResetStage(bulkAction.previousStage);
      }
    }
  };

  return (
    <div className="fixed bottom-8 right-8 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl ring-1 ring-black/5">
        {/* Selection Count */}
        <div className="flex items-center gap-3 border-r border-zinc-100 pr-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#008850] text-[13px] font-bold text-white tabular-nums">
            {selectedCount}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-zinc-900 leading-none">
              {selectedCount === 1 ? 'Product' : 'Products'} Selected
            </span>
            <button
              onClick={onClearSelection}
              className="text-[10px] font-bold text-zinc-400 hover:text-red-600 text-left transition-colors uppercase tracking-wider mt-1"
            >
              Clear Selection
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {selectedCount < totalCount && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSelectAll}
              disabled={isLoading}
              className="h-10 text-xs font-bold text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
            >
              Select All {totalCount}
            </Button>
          )}

          {hasResetAction && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetAction}
              disabled={isLoading}
              className="h-10 border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50"
            >
              {bulkAction.resetLabel}
            </Button>
          )}

          {hasSecondaryAction && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenScrapeDialog?.()}
              disabled={isLoading}
              className="h-10 border-[#008850]/20 text-xs font-bold text-[#008850] hover:bg-[#008850]/5"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {bulkAction.secondaryAction}
            </Button>
          )}

          {onDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              disabled={isLoading}
              className="h-10 border-red-100 text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          )}

          {hasBulkAction && (
            <Button
              onClick={handlePrimaryAction}
              disabled={isLoading}
              className="h-10 bg-[#008850] px-6 text-xs font-bold text-white hover:bg-[#008850]/90 shadow-lg shadow-[#008850]/20"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {isImported && <Search className="mr-1.5 h-4 w-4" />}
                  {bulkAction.label}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
