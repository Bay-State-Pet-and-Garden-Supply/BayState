'use client';

import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PipelineStatus } from '@/lib/pipeline/types';
import { STAGE_CONFIG } from '@/lib/pipeline/types';

/**
 * Bulk action configuration for each pipeline stage
 * Defines the label and next stage for bulk operations
 */
const BULK_ACTIONS: Record<PipelineStatus, { label: string; nextStage: PipelineStatus | null }> = {
  imported: { label: 'Move to Scraped', nextStage: 'scraped' },
  scraped: { label: 'Move to Consolidated', nextStage: 'consolidated' },
  consolidated: { label: 'Move to Finalized', nextStage: 'finalized' },
  finalized: { label: 'Publish Selected', nextStage: 'published' },
  published: { label: '', nextStage: null },
};

interface BulkToolbarProps {
  /** Number of products currently selected */
  selectedCount: number;
  /** Current pipeline stage being viewed */
  currentStage: PipelineStatus;
  /** Whether a bulk operation is in progress */
  isLoading: boolean;
  /** Callback to clear the current selection */
  onClearSelection: () => void;
  /** Callback to perform bulk action with the next stage */
  onBulkAction: (nextStage: PipelineStatus) => void;
}

/**
 * BulkToolbar Component
 *
 * Displays bulk operation controls when products are selected in the pipeline.
 * Shows stage-specific action buttons and selection count.
 *
 * @example
 * ```tsx
 * <BulkToolbar
 *   selectedCount={5}
 *   currentStage="imported"
 *   isLoading={false}
 *   onClearSelection={() => setSelectedSkus([])}
 *   onBulkAction={(nextStage) => handleBulkMove(nextStage)}
 * />
 * ```
 */
export function BulkToolbar({
  selectedCount,
  currentStage,
  isLoading,
  onClearSelection,
  onBulkAction,
}: BulkToolbarProps) {
  // Don't render if no products are selected
  if (selectedCount === 0) {
    return null;
  }

  // Get the bulk action configuration for the current stage
  const bulkAction = BULK_ACTIONS[currentStage];
  const stageConfig = STAGE_CONFIG[currentStage];

  // Published is a terminal stage - no bulk actions available
  const isTerminalStage = currentStage === 'published';
  const hasBulkAction = !isTerminalStage && bulkAction.nextStage !== null;

  return (
    <div
      className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 shadow-sm"
      role="toolbar"
      aria-label="Bulk actions toolbar"
    >
      {/* Selection count */}
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center rounded-full bg-[#008850] px-2.5 py-0.5 text-sm font-semibold text-white"
          aria-live="polite"
        >
          {selectedCount}
        </span>
        <span className="text-sm font-medium text-zinc-700">
          {selectedCount === 1 ? 'product' : 'products'} selected
        </span>
      </div>

      {/* Current stage indicator */}
      <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-500">
        <span>from</span>
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

      {/* Spacer */}
      <div className="flex-1" />

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {/* Stage-specific bulk action button */}
        {hasBulkAction && (
          <Button
            onClick={() => {
              if (bulkAction.nextStage) {
                onBulkAction(bulkAction.nextStage);
              }
            }}
            disabled={isLoading}
            className="bg-[#008850] hover:bg-[#008850]/90 text-white"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              bulkAction.label
            )}
          </Button>
        )}

        {/* Clear selection button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          disabled={isLoading}
          className="text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
        >
          <X className="mr-1.5 h-4 w-4" />
          Clear
        </Button>
      </div>
    </div>
  );
}