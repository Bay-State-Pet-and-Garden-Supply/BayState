"use client";

import { Loader2, Plus, Trash2, Search, Archive, Upload, Globe } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
 PersistedPipelineStatus,
 PipelineStage,
} from "@/lib/pipeline/types";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import {
 Tooltip,
 TooltipContent,
 TooltipTrigger,
} from "@/components/ui/tooltip";

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
 searching: { label: "", nextStage: null },
 url_review: { label: "Return to Import", nextStage: "imported" },
 extracting: { label: "", nextStage: null },
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
 label: "Publish Selected",
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
 onDiscoverOfficialBrand?: () => void;
 onAssignBrand?: () => void;
 canDiscoverOfficialBrand?: boolean;
 officialBrandSelectionReason?: string | null;

 scrapeSelectionValidation?: { allowed: boolean; reason: string | null };
 onDelete?: () => void;
 actionState?: "upload" | "zip" | null;
 onUploadShopSite?: () => void;
 onDownloadZip?: () => void;
 showLegacyShopSiteActions?: boolean;
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
 onDiscoverOfficialBrand,
 onAssignBrand,
 canDiscoverOfficialBrand,
 officialBrandSelectionReason,
 scrapeSelectionValidation,
 onDelete,
 actionState = null,
 onUploadShopSite,
 onDownloadZip,
 showLegacyShopSiteActions = false,
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

 const isPrimaryDisabled = isLoading || (isImported && scrapeSelectionValidation?.allowed === false);

 const handlePrimaryAction = () => {
 if (isPrimaryDisabled) return;
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
 <div className="fixed bottom-10 right-10 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
 <div className="flex items-center gap-3 rounded-none border border-border bg-background p-2.5">
 {/* Selection Count */}
 <div className="flex items-center gap-3 border-r border-border pr-4">
 <div className="flex h-8 w-8 items-center justify-center rounded-none border border-border bg-foreground text-xs font-bold text-background tabular-nums">
 {selectedCount}
 </div>
 <div className="flex flex-col">
 <span className="text-[10px] font-semibold text-foreground leading-none">
 {selectedCount === 1 ? "Product" : "Products"}
 </span>
 <button
 type="button"
 onClick={onClearSelection}
 className="text-[9px] font-bold text-muted-foreground hover:text-destructive text-left transition-colors uppercase tracking-widest"
 >
 Clear
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
 className="h-9 px-3 text-[10px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground rounded-none"
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
 className="h-9 border border-border text-[10px] font-semibold text-foreground bg-background hover:bg-muted rounded-none transition-all"
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
 className="h-9 border border-border text-[10px] font-semibold text-brand-forest-green bg-background hover:bg-brand-forest-green/5 rounded-none transition-all"
 >
 <Plus className="mr-1 h-3.5 w-3.5" />
 {bulkAction.secondaryAction}
 </Button>
 )}

 {isImported && onDiscoverOfficialBrand && (
 <Tooltip>
 <TooltipTrigger asChild>
 <div className="inline-block">
 <Button
 variant="outline"
 size="sm"
 onClick={onDiscoverOfficialBrand}
 disabled={isLoading || !canDiscoverOfficialBrand}
 className={cn(
 "h-9 border border-border text-[10px] font-semibold bg-background rounded-none transition-all",
 canDiscoverOfficialBrand 
 ? "text-blue-600 hover:bg-blue-50" 
 : "text-muted-foreground opacity-50 cursor-not-allowed"
 )}
 >
 <Globe className="mr-1 h-3.5 w-3.5" />
 Discover URLs
 </Button>
 </div>
 </TooltipTrigger>
 {!canDiscoverOfficialBrand && officialBrandSelectionReason && (
 <TooltipContent side="top" className="max-w-xs">
 <p className="font-semibold text-[10px]">
 {officialBrandSelectionReason}
 </p>
 </TooltipContent>
 )}
 </Tooltip>
 )}

 {isImported && onAssignBrand && (
 <Button
 variant="outline"
 size="sm"
 onClick={onAssignBrand}
 disabled={isLoading}
 className="h-9 border border-border text-[10px] font-semibold text-brand-forest-green bg-background hover:bg-brand-forest-green/5 rounded-none transition-all"
 >
 <Tag className="mr-1 h-3.5 w-3.5" />
 Set Brand
 </Button>
 )}



 {onDelete && (
 <Button
 variant="outline"
 size="sm"
 onClick={onDelete}
 disabled={isLoading}
 className="h-9 border border-destructive text-[10px] font-semibold text-destructive bg-background hover:bg-destructive/5 rounded-none transition-all"
 >
 <Trash2 className="mr-1 h-3.5 w-3.5" />
 Delete
 </Button>
 )}

 {isTerminalStage && showLegacyShopSiteActions && onUploadShopSite && onDownloadZip && (
 <>
 <Button
 variant="outline"
 size="sm"
 onClick={onUploadShopSite}
 disabled={isLoading || actionState !== null}
 className="h-9 border border-border text-[10px] font-semibold text-foreground bg-background hover:bg-muted rounded-none transition-all"
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
 className="h-9 bg-foreground px-5 text-[10px] font-semibold text-background hover:bg-foreground/90 rounded-none transition-all"
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
 <Tooltip>
 <TooltipTrigger asChild>
 <div className="inline-block">
 <Button
 onClick={handlePrimaryAction}
 disabled={isPrimaryDisabled}
 className={cn(
 "h-9 border border-border px-6 text-[10px] font-semibold rounded-none transition-all",
 isPrimaryDisabled && isImported
 ? "bg-muted text-muted-foreground cursor-not-allowed border-dashed"
 : "bg-brand-forest-green text-background hover:bg-brand-forest-green/90"
 )}
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
 </div>
 </TooltipTrigger>
 {isImported && scrapeSelectionValidation?.allowed === false && (
 <TooltipContent side="top" className="max-w-xs bg-brand-burgundy border-border text-background">
 <p className="font-semibold text-[10px]">
 {scrapeSelectionValidation.reason}
 </p>
 </TooltipContent>
 )}
 </Tooltip>
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
