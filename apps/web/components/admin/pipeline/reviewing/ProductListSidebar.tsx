"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import type { RefObject } from "react";
import type { PipelineProduct } from "@/lib/pipeline/types";
import type { Brand } from "@/lib/types";
import {
  PipelineFilters,
  type PipelineFiltersState,
} from "@/components/admin/pipeline/PipelineFilters";
import { PipelineSearchField } from "@/components/admin/pipeline/PipelineSearchField";
import { PipelineSidebarTable } from "@/components/admin/pipeline/PipelineSidebarTable";
import type { VirtualizedPipelineTableHandle } from "@/components/admin/pipeline/VirtualizedPipelineTable";

interface ProductListSidebarProps {
  products: PipelineProduct[];
  selectedUpc: string | null;
  onSelectProduct: (upc: string) => void;
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
  cohortBrandObjects?: Record<string, Brand>;
  onEditCohort?: (id: string, name: string | null, brandName: string | null) => void;
  selectedUpcs?: Set<string>;
  onSelectUpc?: (upc: string, selected: boolean, index?: number, isShiftClick?: boolean, visibleProducts?: PipelineProduct[]) => void;
}

export function ProductListSidebar({
  products,
  selectedUpc,
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
  cohortBrandObjects = {},
  onEditCohort,
  selectedUpcs = new Set(),
  onSelectUpc,
}: ProductListSidebarProps) {
  
  const onSelectAll = React.useCallback((upcs: string[]) => {
    if (!onSelectUpc) return;
    upcs.forEach(upc => onSelectUpc(upc, true));
  }, [onSelectUpc]);

  const onDeselectAll = React.useCallback((upcs: string[]) => {
    if (!onSelectUpc) return;
    upcs.forEach(upc => onSelectUpc(upc, false));
  }, [onSelectUpc]);

  return (
    <div className="w-96 min-w-[384px] max-w-[384px] border-r border-border flex flex-col shrink-0 bg-muted/10 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-card p-3">
        <label className="flex shrink-0 items-center justify-center h-9 w-9 border border-border bg-background hover:bg-muted transition-colors cursor-pointer">
          <Checkbox
            checked={
              products.length > 0 &&
              products.every((p) => selectedUpcs.has(p.upc))
                ? true
                : products.some((p) => selectedUpcs.has(p.upc))
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(checked) => {
              if (checked) {
                onSelectAll?.(products.map((p) => p.upc));
              } else {
                onDeselectAll?.(products.map((p) => p.upc));
              }
            }}
            className="h-4 w-4 rounded-none border border-border accent-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground"
          />
        </label>
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
            className="h-9 w-9 shrink-0 p-0 border border-border"
          />
        ) : null}
      </div>
      
      <div className="flex-1 min-h-0 flex flex-col">
        <PipelineSidebarTable
          variant="reviewing"
          products={products}
          groupedProducts={groupedProducts}
          cohortBrands={cohortBrands}
          cohortBrandObjects={cohortBrandObjects}
          selectedUpcs={selectedUpcs}
          preferredUpc={selectedUpc}
          onSelectUpc={onSelectUpc || (() => {})}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
          onPreferredUpcChange={onSelectProduct}
          onEditCohort={onEditCohort}
          scrollContainerRef={scrollContainerRef}
        />
      </div>
    </div>
  );
}

