'use client';

import { Loader2, X, CheckSquare, Search, Plus, Trash2, Database } from 'lucide-react';
import Link from 'next/link';
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
  secondaryAction?: string;
}> = {
  imported: { label: 'Scrape Selected', nextStage: 'scraped' },
  monitoring: { label: '', nextStage: null, resetLabel: 'Cancel & Return to Import', previousStage: 'imported' },
  scraped: { label: 'Consolidate Selected', nextStage: 'consolidated', resetLabel: 'Clear & Return to Import', previousStage: 'imported', secondaryAction: 'Scrape Additional Sources' },
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
  /** Opens the manual add product dialog */
  onManualAdd?: () => void;
  /** Opens the Integra import dialog */
  onIntegraImport?: () => void;
  /** Deletes selected products */
  onDelete?: () => void;
  // Source filtering
  sourceFilter?: string;
  onSourceFilterChange?: (value: string) => void;
  availableSourceFilters?: string[];
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
  onManualAdd,
  onIntegraImport,
  onDelete,
  sourceFilter = '',
  onSourceFilterChange,
  availableSourceFilters = [],
}: BulkToolbarProps) {
  const bulkAction = BULK_ACTIONS[currentStage];
  const stageConfig = STAGE_CONFIG[currentStage];
  const isTerminalStage = currentStage === 'published';
  const hasBulkAction = !isTerminalStage && bulkAction.nextStage !== null;
  const hasResetAction = !!bulkAction.resetLabel && !!bulkAction.previousStage && !!onResetStage;
  const isImported = currentStage === 'imported';
  const hasSecondaryAction = !!bulkAction.secondaryAction && !!onOpenScrapeDialog;
  const isScrapedStage = currentStage === 'scraped';

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

      {/* Search and Source Filter */}
      <div className="flex flex-1 items-center gap-2 min-w-[300px]">
        {isScrapedStage && onSourceFilterChange && (
          <select
            id="source-filter"
            value={sourceFilter}
            onChange={(e) => onSourceFilterChange(e.target.value)}
            className="h-9 rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All Sources</option>
            {availableSourceFilters.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by SKU or name..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-md border border-input bg-white pl-9 pr-3 py-1.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {isImported && onIntegraImport && (
          <Button
            variant="outline"
            size="sm"
            onClick={onIntegraImport}
            className="h-9 border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800"
          >
            <Database className="mr-1.5 h-4 w-4" />
            Import from Integra
          </Button>
        )}

        {isImported && onManualAdd && (
          <Button
            variant="outline"
            size="sm"
            onClick={onManualAdd}
            disabled={isLoading}
            className="h-9 border-zinc-200 text-zinc-600 hover:bg-zinc-50"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Product
          </Button>
        )}

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

        {hasSecondaryAction && selectedCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenScrapeDialog?.()}
            disabled={isLoading}
            className="h-9 border-[#008850]/30 text-[#008850] hover:bg-[#008850]/5"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {bulkAction.secondaryAction}
          </Button>
        )}

        {onDelete && selectedCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={isLoading}
            className="h-9 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Delete Selected
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
