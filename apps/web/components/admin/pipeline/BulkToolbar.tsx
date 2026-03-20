'use client';

import { Loader2, X, CheckSquare, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PipelineStatus } from '@/lib/pipeline/types';
import { STAGE_CONFIG } from '@/lib/pipeline/types';

/**
 * Bulk action configuration for each pipeline stage.
 * 'imported' opens the scraper selection dialog instead of a direct move.
 */
const BULK_ACTIONS: Record<PipelineStatus, { 
  label: string; 
  nextStage: PipelineStatus | null; 
  resetLabel?: string;
  previousStage?: PipelineStatus | null;
}> = {
  imported: { label: 'Scrape Selected', nextStage: 'scraped' },
  monitoring: { label: '', nextStage: null, resetLabel: 'Cancel & Return to Import', previousStage: 'imported' },
  scraped: { label: 'Consolidate Selected', nextStage: 'consolidated', resetLabel: 'Clear & Return to Import', previousStage: 'imported' },
  consolidated: { label: 'Finalize Selected', nextStage: 'finalized', resetLabel: 'Reset Consolidation', previousStage: 'scraped' },
  finalized: { label: 'Publish Selected', nextStage: 'published', resetLabel: 'Return to Consolidation', previousStage: 'consolidated' },
  published: { label: '', nextStage: null },
};

interface BulkToolbarProps {
  selectedCount: number;
  totalCount: number;
  currentStage: PipelineStatus;
  isLoading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  /** For imported stage, opens scraper dialog. For others, moves to next stage. */
  onBulkAction: (nextStage: PipelineStatus) => void;
  /** Resets products to a previous stage, clearing results */
  onResetStage?: (previousStage: PipelineStatus) => void;
  /** Opens the scraper selection dialog (imported stage only) */
  onOpenScrapeDialog?: () => void;
}

export function BulkToolbar({
  selectedCount,
  totalCount,
  currentStage,
  isLoading,
  search,
  onSearchChange,
  onClearSelection,
  onSelectAll,
  onBulkAction,
  onResetStage,
  onOpenScrapeDialog,
}: BulkToolbarProps) {
  const bulkAction = BULK_ACTIONS[currentStage];
  const stageConfig = STAGE_CONFIG[currentStage];
  const isTerminalStage = currentStage === 'published';
  const hasBulkAction = !isTerminalStage && bulkAction.nextStage !== null;
  const hasResetAction = !!bulkAction.resetLabel && !!bulkAction.previousStage && !!onResetStage;
  const isImported = currentStage === 'imported';

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
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 shadow-sm"
      role="toolbar"
      aria-label="Bulk actions toolbar"
    >
      {/* Select All / count / clear */}
      <div className="flex items-center gap-2">
        {selectedCount === 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onSelectAll}
            disabled={isLoading || totalCount === 0}
            className="h-8"
          >
            <CheckSquare className="mr-1.5 h-3.5 w-3.5" />
            Select All ({totalCount})
          </Button>
        ) : (
          <>
            <span
              className="inline-flex items-center justify-center rounded-full bg-[#008850] px-2.5 py-0.5 text-sm font-semibold text-white"
              aria-live="polite"
            >
              {selectedCount}
            </span>
            <span className="text-sm font-medium text-zinc-700">
              {selectedCount === 1 ? 'product' : 'products'} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              disabled={isLoading}
              className="text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
            >
              <X className="mr-1 h-4 w-4" />
              Clear
            </Button>
          </>
        )}
      </div>

      {/* Stage indicator */}
      <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-500">
        <span>in</span>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 font-medium"
          style={{
            backgroundColor: `${stageConfig.color}15`,
            color: stageConfig.color,
          }}
        >
          {stageConfig.label}
        </span>
      </div>

      {/* Search input */}
      <div className="min-w-[220px] flex-1">
        <input
          type="text"
          placeholder="Search by SKU or name..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-md border border-input bg-white px-3 py-1.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {selectedCount > 0 && selectedCount < totalCount && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSelectAll}
            disabled={isLoading}
            className="h-8 text-xs text-zinc-600"
          >
            Select All ({totalCount})
          </Button>
        )}

        {hasResetAction && selectedCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetAction}
            disabled={isLoading}
            className="h-9 border-zinc-300 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          >
            {bulkAction.resetLabel}
          </Button>
        )}

        {hasBulkAction && selectedCount > 0 && (
          <Button
            onClick={handlePrimaryAction}
            disabled={isLoading}
            className={`${isImported ? 'bg-[#008850] hover:bg-[#008850]/90' : 'bg-[#008850] hover:bg-[#008850]/90'} text-white`}
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
  );
}
