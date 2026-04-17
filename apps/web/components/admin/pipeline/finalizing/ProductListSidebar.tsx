"use client";

import * as React from "react";
import type { RefObject } from "react";
import type { PipelineProduct } from "@/lib/pipeline/types";
import {
  PipelineFilters,
  type PipelineFiltersState,
} from "@/components/admin/pipeline/PipelineFilters";
import { PipelineSearchField } from "@/components/admin/pipeline/PipelineSearchField";
import { PipelineSidebarTable } from "@/components/admin/pipeline/PipelineSidebarTable";
import type { VirtualizedPipelineTableHandle } from "@/components/admin/pipeline/VirtualizedPipelineTable";

export interface ProductListSidebarProps {
  products: PipelineProduct[];
  selectedSku: string | null;
  onSelectProduct: (sku: string) => void;
  scrollContainerRef: RefObject<VirtualizedPipelineTableHandle | null>;
  search?: string;
  onSearchChange?: (value: string) => void;
  filters?: PipelineFiltersState;
  onFilterChange?: (filters: PipelineFiltersState) => void;
  availableSources?: string[];
  showSourceFilter?: boolean;
  isLoading?: boolean;
  groupedProducts?: {
    groups: Record<string, PipelineProduct[]>;
    cohortIds: string[];
    names?: Record<string, string>;
  };
  cohortBrands?: Record<string, string>;
  onEditCohort?: (id: string, name: string | null, brandName: string | null) => void;
  selectedSkus?: Set<string>;
  onSelectSku?: (sku: string, selected: boolean, index?: number, isShiftClick?: boolean, visibleProducts?: PipelineProduct[]) => void;
}

export function ProductListSidebar({
  products,
  selectedSku,
  onSelectProduct,
  scrollContainerRef,
  search,
  onSearchChange,
  filters,
  onFilterChange,
  availableSources = [],
  showSourceFilter = false,
  isLoading = false,
  groupedProducts,
  cohortBrands = {},
  onEditCohort,
  selectedSkus = new Set(),
  onSelectSku,
}: ProductListSidebarProps) {
  
  const onSelectAll = React.useCallback((skus: string[]) => {
    if (!onSelectSku) return;
    skus.forEach(sku => onSelectSku(sku, true));
  }, [onSelectSku]);

  const onDeselectAll = React.useCallback((skus: string[]) => {
    if (!onSelectSku) return;
    skus.forEach(sku => onSelectSku(sku, false));
  }, [onSelectSku]);

  return (
    <div className="w-80 min-w-[320px] max-w-[320px] border-r-4 border-zinc-950 flex flex-col shrink-0 bg-zinc-50 overflow-hidden">
      <div className="flex items-center gap-2 border-b-4 border-zinc-950 bg-white p-3">
        <PipelineSearchField
          value={search || ""}
          onChange={(value) => onSearchChange?.(value)}
          className="flex-1"
          isLoading={isLoading}
        />
        {filters && onFilterChange ? (
          <PipelineFilters
            filters={filters}
            onFilterChange={onFilterChange}
            availableSources={availableSources}
            showSourceFilter={showSourceFilter}
            className="h-9 w-9 shrink-0 p-0 border-2 border-zinc-950 shadow-[2px_2px_0px_rgba(0,0,0,1)]"
          />
        ) : null}
      </div>
      
      <div className="flex-1 min-h-0 flex flex-col">
        <PipelineSidebarTable
          variant="finalizing"
          products={products}
          groupedProducts={groupedProducts}
          cohortBrands={cohortBrands}
          selectedSkus={selectedSkus}
          preferredSku={selectedSku}
          onSelectSku={onSelectSku || (() => {})}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
          onPreferredSkuChange={onSelectProduct}
          onEditCohort={onEditCohort}
          scrollContainerRef={scrollContainerRef}
        />
      </div>
    </div>
  );
}
