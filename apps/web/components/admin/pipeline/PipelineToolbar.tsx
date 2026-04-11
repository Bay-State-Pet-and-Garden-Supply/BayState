"use client";

import { Plus, Database, Archive, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PipelineStage } from "@/lib/pipeline/types";

interface PipelineToolbarProps {
  currentStage: PipelineStage;
  isLoading: boolean;
  /** Opens the manual add product dialog */
  onManualAdd?: () => void;
  /** Opens the Integra import dialog */
  onIntegraImport?: () => void;
  actionState?: "upload" | "zip" | null;
  onUploadShopSite?: () => void;
  onDownloadZip?: () => void;
}

export function PipelineToolbar({
  currentStage,
  isLoading,
  onManualAdd,
  onIntegraImport,
  actionState = null,
  onUploadShopSite,
  onDownloadZip,
}: PipelineToolbarProps) {
  const isPublishedStage = currentStage === "published";
  const isImportedStage = currentStage === "imported";

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 py-3 border-b border-border mb-2">
      <div className="flex items-center gap-2">
        {isPublishedStage && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onUploadShopSite}
              disabled={isLoading || actionState === "upload"}
              className="h-8 border-brand-forest-green/20 text-brand-forest-green hover:bg-brand-forest-green/5 text-xs font-semibold"
            >
              {actionState === "upload" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-3.5 w-3.5" />
              )}
              Upload to ShopSite
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadZip}
              disabled={isLoading || actionState === "zip"}
              className="h-8 border-brand-burgundy/20 text-brand-burgundy hover:bg-brand-burgundy/5 text-xs font-semibold"
            >
              {actionState === "zip" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Archive className="mr-1.5 h-3.5 w-3.5" />
              )}
              Images ZIP
            </Button>
          </>
        )}

        {isImportedStage && (
          <Button
            variant="outline"
            size="sm"
            onClick={onIntegraImport}
            disabled={isLoading}
            className="h-8 border-border text-muted-foreground hover:bg-muted text-xs font-semibold"
          >
            <Database className="mr-1.5 h-3.5 w-3.5" />
            Import CSV
          </Button>
        )}

        {onManualAdd && (
          <Button
            variant="outline"
            size="sm"
            onClick={onManualAdd}
            disabled={isLoading}
            className="h-8 border-border text-muted-foreground hover:bg-muted text-xs font-semibold"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Product
          </Button>
        )}
      </div>
    </div>
  );
}
