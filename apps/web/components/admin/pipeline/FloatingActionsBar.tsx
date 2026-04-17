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
  exporting: {
    label: "",
    nextStage: null,
    resetLabel: "Return to Finalizing",
    previousStage: "finalizing",
  },
  scraping: { label: "", nextStage: null },
  consolidating: { label: "", nextStage: null },
  failed: {
    label: "Return to Import",
    nextStage: "imported",
    resetLabel: "Clear & Return to Import",
    previousStage: "imported",
  },
  finalizing: {
    label: "Approve Selected",
    nextStage: "exporting",
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
  const isTerminalStage = currentStage === "exporting";
  const hasBulkAction =
    !isTerminalStage &&
    (bulkAction.nextStage !== null ||
      (currentStage === "scraped" && !!onConsolidate));
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
    <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 rounded-xl border border-zinc-900 bg-card p-2 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
        {/* Selection Count */}
        <div className="flex items-center gap-2 border-r border-zinc-200 pr-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-black text-white tabular-nums">
            {selectedCount}
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-tighter text-foreground leading-none">
              {selectedCount === 1 ? "Product" : "Products"}
            </span>
            <button
              type="button"
              onClick={onClearSelection}
              className="text-[9px] font-bold text-muted-foreground hover:text-red-600 text-left transition-colors uppercase tracking-wider"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          {selectedCount < totalCount && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSelectAll}
              disabled={isLoading}
              className="h-8 text-[10px] font-black uppercase tracking-tight text-muted-foreground hover:bg-muted hover:text-foreground"
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
              className="h-8 border-zinc-900 text-[10px] font-black uppercase tracking-tight text-muted-foreground hover:bg-muted"
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
              className="h-8 border-zinc-900 text-[10px] font-black uppercase tracking-tight text-brand-forest-green hover:bg-brand-forest-green/5"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {bulkAction.secondaryAction}
            </Button>
          )}

          {onDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              disabled={isLoading}
              className="h-8 border-red-600 text-[10px] font-black uppercase tracking-tight text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
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
                className="h-8 border-zinc-900 text-[10px] font-black uppercase tracking-tight text-zinc-900 hover:bg-zinc-100"
              >
                {actionState === "upload" ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="mr-1 h-3.5 w-3.5" />
                    Upload
                  </>
                )}
              </Button>
              <Button
                size="sm"
                onClick={onDownloadZip}
                disabled={isLoading || actionState !== null}
                className="h-8 bg-zinc-900 px-4 text-[10px] font-black uppercase tracking-tight text-white hover:bg-zinc-800"
              >
                {actionState === "zip" ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    Zipping…
                  </>
                ) : (
                  <>
                    <Archive className="mr-1 h-3.5 w-3.5" />
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
              className="h-8 bg-brand-forest-green px-5 text-[10px] font-black uppercase tracking-tight text-white hover:bg-brand-forest-green/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {isImported && <Search className="mr-1 h-3.5 w-3.5" />}
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
