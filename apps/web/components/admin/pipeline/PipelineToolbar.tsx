"use client";

import { Search, Plus, Database, CheckSquare, Archive, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PipelineStage } from "@/lib/pipeline/types";

interface PipelineToolbarProps {
  totalCount: number;
  currentStage: PipelineStage;
  isLoading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onSelectAll: () => void;
  /** Opens the manual add product dialog */
  onManualAdd?: () => void;
  /** Opens the Integra import dialog */
  onIntegraImport?: () => void;
  // Source filtering
  sourceFilter?: string;
  onSourceFilterChange?: (value: string) => void;
  availableSourceFilters?: string[];
  selectedCount: number;
  actionState?: "upload" | "zip" | null;
  onUploadShopSite?: () => void;
  onDownloadZip?: () => void;
}

export function PipelineToolbar({
  totalCount,
  currentStage,
  isLoading,
  search,
  onSearchChange,
  onSelectAll,
  onManualAdd,
  onIntegraImport,
  sourceFilter = "",
  onSourceFilterChange,
  availableSourceFilters = [],
  selectedCount,
  actionState = null,
  onUploadShopSite,
  onDownloadZip,
}: PipelineToolbarProps) {
  const isImported = currentStage === "imported";
  const isScrapedStage = currentStage === "scraped";
  const isFinalizing = currentStage === "finalizing";
  const isPublished = currentStage === "published";

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted px-4 py-3 shadow-sm"
      role="toolbar"
      aria-label="Pipeline toolbar"
    >
      {/* Select All (when none selected) */}
      {selectedCount === 0 && !isFinalizing && (
        <Button
          variant="outline"
          size="sm"
          onClick={onSelectAll}
          disabled={isLoading || totalCount === 0}
          className="h-9 border-border text-muted-foreground hover:bg-muted"
        >
          <CheckSquare className="mr-1.5 h-3.5 w-3.5" />
          Select All ({totalCount})
        </Button>
      )}

      {/* Search and Source Filter */}
      <div className="flex flex-1 items-center gap-2 min-w-[300px]">
        {isScrapedStage && onSourceFilterChange && (
          <select
            id="source-filter"
            value={sourceFilter}
            onChange={(e) => onSourceFilterChange(e.target.value)}
            className="h-9 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
            className="w-full rounded-md border border-input bg-card pl-9 pr-3 py-1.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      {/* Static Actions (Import/Add) */}
      <div className="flex items-center gap-2">
        {isPublished && selectedCount === 0 && onUploadShopSite && onDownloadZip && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onUploadShopSite}
              disabled={isLoading || totalCount === 0 || actionState !== null}
              className="h-9 border-primary/20 text-primary hover:bg-primary/5 hover:text-primary"
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
              disabled={isLoading || totalCount === 0 || actionState !== null}
              className="h-9 bg-primary text-white hover:bg-primary/90"
            >
              {actionState === "zip" ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Downloading ZIP…
                </>
              ) : (
                <>
                  <Archive className="mr-1.5 h-4 w-4" />
                  Download Image ZIP
                </>
              )}
            </Button>
          </>
        )}

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
            className="h-9 border-border text-muted-foreground hover:bg-muted"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add Product
          </Button>
        )}
      </div>
    </div>
  );
}
