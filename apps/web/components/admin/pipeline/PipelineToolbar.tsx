"use client";

import { useState, useEffect } from "react";
import { Search, Plus, Database, CheckSquare, Archive, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PipelineFilters, type PipelineFiltersState } from "./PipelineFilters";
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
  // Advanced filters
  filters: PipelineFiltersState;
  onFilterChange: (filters: PipelineFiltersState) => void;
  availableSources?: string[];
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
  filters,
  onFilterChange,
  availableSources = [],
  selectedCount,
  actionState = null,
  onUploadShopSite,
  onDownloadZip,
}: PipelineToolbarProps) {
  const isScrapedStage = currentStage === "scraped";
  const isPublishedStage = currentStage === "published";
  const isImportedStage = currentStage === "imported";

  // State to track individual inputs
  const [localSearch, setLocalSearch] = useState(search);

  // Keep local search in sync with prop
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== search) {
        onSearchChange(localSearch);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [localSearch, onSearchChange, search]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-4 border-b border-border">
      <div className="flex flex-1 items-center gap-4">
        {/* Selection State */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSelectAll}
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            {selectedCount > 0 ? (
              <span className="flex items-center text-brand-forest-green font-medium">
                <CheckSquare className="mr-1.5 h-4 w-4" />
                {selectedCount} Selected
              </span>
            ) : (
              <span className="flex items-center">
                <CheckSquare className="mr-1.5 h-4 w-4" />
                Select All ({totalCount})
              </span>
            )}
          </Button>
          {selectedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelectAll()} // actually onSelectAll(false) if we support it
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
            >
              Clear
            </Button>
          )}
        </div>

        <div className="h-4 w-[1px] bg-border mx-1" />

        {/* Search and Advanced Filters */}
        <div className="flex flex-1 items-center gap-2 min-w-[300px]">
          <PipelineFilters 
            filters={filters} 
            onFilterChange={onFilterChange} 
            availableSources={availableSources}
            className="h-9"
          />

          <div className="relative flex-1 group">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-brand-forest-green" />
            <input
              type="text"
              placeholder="Search SKUs or names..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-forest-green/50 focus-visible:border-brand-forest-green disabled:cursor-not-allowed disabled:opacity-50"
            />
            {localSearch && (
              <button
                onClick={() => setLocalSearch("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isPublishedStage && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onUploadShopSite}
              disabled={isLoading || actionState === "upload"}
              className="h-9 border-brand-forest-green/20 text-brand-forest-green hover:bg-brand-forest-green/5"
            >
              {actionState === "upload" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-4 w-4" />
              )}
              Upload to ShopSite
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDownloadZip}
              disabled={isLoading || actionState === "zip"}
              className="h-9 border-brand-burgundy/20 text-brand-burgundy hover:bg-brand-burgundy/5"
            >
              {actionState === "zip" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Archive className="mr-1.5 h-4 w-4" />
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
            className="h-9 border-border text-muted-foreground hover:bg-muted"
          >
            <Database className="mr-1.5 h-4 w-4" />
            Import CSV
          </Button>
        )}

        {onManualAdd && (
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
