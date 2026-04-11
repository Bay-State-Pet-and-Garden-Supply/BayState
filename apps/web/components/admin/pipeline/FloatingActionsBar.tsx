"use client";

import { Loader2, Plus, Trash2, Search, Archive, Upload } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  PersistedPipelineStatus,
  PipelineStage,
} from "@/lib/pipeline/types";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";

/**
 * Bulk action configuration for each pipeline stage.
 * 'imported' opens the scraper selection dialog instead of a direct move.
 */
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
  imported: { label: "Scrape Selected", nextStage: "scraped" },
  scraped: {
    label: "Consolidate Selected",
    nextStage: null,
    resetLabel: "Clear & Return to Import",
    previousStage: "imported",
    secondaryAction: "Scrape Additional Sources",
  },
  published: { label: "", nextStage: null },
  scraping: { label: "", nextStage: null },
  consolidating: { label: "", nextStage: null },
  failed: {
    label: "Return to Import",
    nextStage: "imported",
    resetLabel: "Clear & Return to Import",
    previousStage: "imported",
  },
  finalizing: {
    label: "",
    nextStage: null,
    resetLabel: "Return to Scraped",
    previousStage: "scraped",
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
  onOpenScrapeDialog?: () => void;
  onDelete?: () => void;
  actionState?: "upload" | "zip" | null;
  onUploadShopSite?: () => void;
  onDownloadZip?: () => void;
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
  onOpenScrapeDialog,
  onDelete,
  actionState = null,
  onUploadShopSite,
  onDownloadZip,
}: FloatingActionsBarProps) {
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  if (selectedCount === 0) return null;

  const bulkAction = BULK_ACTIONS[currentStage];
  const isTerminalStage = currentStage === "published";
  const hasBulkAction = !isTerminalStage && (bulkAction.nextStage !== null || (currentStage === "scraped" && !!onConsolidate));
  const hasResetAction =
    !!bulkAction.resetLabel && !!bulkAction.previousStage && !!onResetStage;
  const isImported = currentStage === "imported";
  const hasSecondaryAction =
    !!bulkAction.secondaryAction && !!onOpenScrapeDialog;

  const handlePrimaryAction = () => {
    if (isImported && onOpenScrapeDialog) {
      onOpenScrapeDialog();
    } else if (currentStage === "scraped" && onConsolidate) {
      onConsolidate();
    } else if (bulkAction.nextStage) {
      onBulkAction(bulkAction.nextStage);
    }
  };

  const handleResetAction = () => {
    if (bulkAction.previousStage && onResetStage) {
      setConfirmResetOpen(true);
    }
  };

  const handleConfirmReset = () => {
    setConfirmResetOpen(false);
    if (bulkAction.previousStage && onResetStage) {
      onResetStage(bulkAction.previousStage);
    }
  };

  return (
    <div className="fixed bottom-8 right-8 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-2xl ring-1 ring-black/5">
        {/* Selection Count */}
        <div className="flex items-center gap-3 border-r border-border pr-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-white tabular-nums">
            {selectedCount}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-foreground leading-none">
              {selectedCount === 1 ? "Product" : "Products"} Selected
            </span>
            <button
              type="button"
              onClick={onClearSelection}
              className="text-[10px] font-bold text-muted-foreground hover:text-red-600 text-left transition-colors uppercase tracking-wider mt-1"
            >
              Clear Selection
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {selectedCount < totalCount && currentStage !== "finalizing" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSelectAll}
              disabled={isLoading}
              className="h-10 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
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
              className="h-10 border-border text-xs font-bold text-muted-foreground hover:bg-muted"
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
              className="h-10 border-primary/20 text-xs font-bold text-primary hover:bg-primary/5"
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

          {isTerminalStage && onUploadShopSite && onDownloadZip && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onUploadShopSite}
                disabled={isLoading || actionState !== null}
                className="h-10 border-primary/20 text-xs font-bold text-primary hover:bg-primary/5"
              >
                {actionState === "upload" ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="mr-1.5 h-4 w-4" />
                    Upload to ShopSite
                  </>
                )}
              </Button>
              <Button
                size="sm"
                onClick={onDownloadZip}
                disabled={isLoading || actionState !== null}
                className="h-10 bg-primary px-5 text-xs font-bold text-white hover:bg-primary/90 shadow-lg shadow-primary/20"
              >
                {actionState === "zip" ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Downloading ZIP…
                  </>
                ) : (
                  <>
                    <Archive className="mr-1.5 h-4 w-4" />
                    Download ZIP
                  </>
                )}
              </Button>
            </>
          )}

          {hasBulkAction && (
            <Button
              onClick={handlePrimaryAction}
              disabled={isLoading}
              className="h-10 bg-primary px-6 text-xs font-bold text-white hover:bg-primary/90 shadow-lg shadow-primary/20"
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

      <ConfirmationDialog
        open={confirmResetOpen}
        onOpenChange={setConfirmResetOpen}
        onConfirm={handleConfirmReset}
        title="Reset Stage"
        description={`Are you sure you want to ${bulkAction.resetLabel?.toLowerCase()} for ${selectedCount} product${selectedCount !== 1 ? "s" : ""}? This action may clear data.`}
        confirmLabel={bulkAction.resetLabel ?? "Reset"}
      />
    </div>
  );
}
