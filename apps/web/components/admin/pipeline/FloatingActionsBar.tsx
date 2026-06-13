"use client";

import { useState } from 'react';
import { Loader2, Tag, Trash2, Upload, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmationDialog } from '@/components/admin/confirmation-dialog';
import type { PersistedPipelineStatus, PipelineStage } from '@/lib/pipeline/types';

const BULK_ACTIONS: Record<
  PipelineStage,
  {
    label: string;
    nextStage: PersistedPipelineStatus | null;
    resetLabel?: string;
    previousStage?: PersistedPipelineStatus | null;
    secondaryAction?: string;
  }
> = {
  imported: { label: '', nextStage: null },
  extracting: { label: '', nextStage: null },
  processed: {
    label: 'Group selected',
    nextStage: 'grouping',
    resetLabel: 'Return to Imported',
    previousStage: 'imported',
  },
  grouping: {
    label: 'Consolidate selected groups',
    nextStage: 'merging',
    resetLabel: 'Return to Processed',
    previousStage: 'processed',
  },
  merging: { label: '', nextStage: null },
  reviewing: {
    label: 'Publish selected',
    nextStage: 'publishing',
    resetLabel: 'Return to Processed',
    previousStage: 'processed',
  },
  publishing: { label: '', nextStage: null },
  needs_attention: { label: 'Retry Failed Sources', nextStage: 'extracting', resetLabel: 'Return to Imported', previousStage: 'imported' },
  failed: {
    label: 'Return to Imported',
    nextStage: 'imported',
    resetLabel: 'Clear and return to Imported',
    previousStage: 'imported',
  },
};

interface FloatingActionsBarProps {
  selectedCount: number;
  totalCount: number;
  currentStage: PipelineStage;
  isLoading: boolean;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onBulkAction: (nextStage: PersistedPipelineStatus) => void;
  onResetStage?: (previousStage: PersistedPipelineStatus) => void;
  onConsolidate?: () => void;
  onGroupProducts?: () => void;
  onConsolidateGroups?: () => void;
  onAssignBrand?: () => void;
  onDelete?: () => void;
  actionState?: 'upload' | 'zip' | null;
  onUploadShopSite?: () => void;
  onDownloadZip?: () => void;
  showLegacyShopSiteActions?: boolean;
  consolidationInfo?: { provider: string; model: string } | null;
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
  onConsolidate,
  onGroupProducts,
  onConsolidateGroups,
  onAssignBrand,
  onDelete,
  actionState = null,
  onUploadShopSite,
  onDownloadZip,
  showLegacyShopSiteActions = false,
  consolidationInfo,
}: FloatingActionsBarProps) {
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  if (selectedCount === 0) return null;

  const bulkAction = BULK_ACTIONS[currentStage];
  const isPublishing = currentStage === 'publishing';
  const hasResetAction =
    Boolean(bulkAction.resetLabel) && Boolean(bulkAction.previousStage) && Boolean(onResetStage);

  const handlePrimaryAction = () => {
    if (isLoading) return;

    if (currentStage === 'processed' && onGroupProducts) {
      onGroupProducts();
      return;
    }

    if (currentStage === 'grouping' && onConsolidateGroups) {
      onConsolidateGroups();
      return;
    }

    if (currentStage === 'processed' && onConsolidate) {
      onConsolidate();
      return;
    }

    if (bulkAction.nextStage) {
      onBulkAction(bulkAction.nextStage);
    }
  };

  const handleConfirmReset = () => {
    setConfirmResetOpen(false);

    if (bulkAction.previousStage && onResetStage) {
      onResetStage(bulkAction.previousStage);
    }
  };

  return (
    <>
      <div className="shrink-0 border-t border-border bg-[var(--surface-admin-bg)] px-1 pb-1 pt-4">
        <div className="admin-panel flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium text-foreground">
                {selectedCount} product{selectedCount === 1 ? '' : 's'} selected
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearSelection}
                className="h-auto px-0 text-sm text-muted-foreground hover:text-foreground"
              >
                Clear selection
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Batch actions stay here so operators always know where to confirm the next step.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedCount < totalCount ? (
              <Button variant="outline" onClick={onSelectAll} disabled={isLoading}>
                Select all {totalCount}
              </Button>
            ) : null}

            {hasResetAction ? (
              <Button variant="outline" onClick={() => setConfirmResetOpen(true)} disabled={isLoading}>
                {bulkAction.resetLabel}
              </Button>
            ) : null}



            {onAssignBrand ? (
              <Button variant="outline" onClick={onAssignBrand} disabled={isLoading}>
                <Tag className="h-4 w-4" />
                Set brand
              </Button>
            ) : null}

            {onDelete ? (
              <Button variant="outline" onClick={onDelete} disabled={isLoading} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            ) : null}

            {!isPublishing && (bulkAction.nextStage || (currentStage === 'processed' && onConsolidate)) ? (
              <span className="flex items-center gap-2">
                {currentStage === 'processed' && consolidationInfo ? (
                  <Badge
                    variant="secondary"
                    className="rounded-none border border-border bg-muted font-semibold text-[10px] h-6 tracking-widest text-muted-foreground gap-1"
                  >
                    <Cpu className="h-3 w-3" />
                    {consolidationInfo.provider === 'deepseek'
                      ? 'DeepSeek'
                      : consolidationInfo.provider === 'openai'
                        ? 'OpenAI'
                        : consolidationInfo.provider === 'gemini'
                          ? 'Gemini'
                          : consolidationInfo.provider}{' '}
                    {consolidationInfo.model}
                  </Badge>
                ) : null}
                <Button onClick={handlePrimaryAction} disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {bulkAction.label}
                </Button>
              </span>
            ) : null}

            {isPublishing && showLegacyShopSiteActions && onUploadShopSite && onDownloadZip ? (
              <>
                <Button variant="outline" onClick={onUploadShopSite} disabled={isLoading || actionState !== null}>
                  {actionState === 'upload' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {actionState === 'upload' ? 'Uploading...' : 'Upload'}
                </Button>
                <Button onClick={onDownloadZip} disabled={isLoading || actionState !== null}>
                  {actionState === 'zip' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {actionState === 'zip' ? 'Preparing zip...' : 'Download zip'}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <ConfirmationDialog
        open={confirmResetOpen}
        onOpenChange={setConfirmResetOpen}
        onConfirm={handleConfirmReset}
        title="Move selected products back"
        description="This changes the selected products back to the earlier stage so they can be reviewed again."
        confirmLabel={bulkAction.resetLabel || 'Move products'}
        variant="default"
        isLoading={isLoading}
      />
    </>
  );
}
