"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Package,
  Plus,
  Database,
} from "lucide-react";
import type { PipelineProduct } from "@/lib/pipeline/types";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PipelineFilters } from "./PipelineFilters";
import { PipelineSearchField } from "./PipelineSearchField";
import { PipelineSidebarTable } from "./PipelineSidebarTable";

interface ImportedResultsViewProps {
  products: PipelineProduct[];
  selectedSkus: Set<string>;
  onSelectSku: (
    sku: string,
    selected: boolean,
    index?: number,
    isShiftClick?: boolean,
    visibleProducts?: PipelineProduct[],
  ) => void;
  onSelectAll?: (skus: string[]) => void;
  onDeselectAll?: (skus: string[]) => void;
  onRefresh: (silent?: boolean) => void;
  // Filter props
  search?: string;
  onSearchChange?: (value: string) => void;
  filters?: {
    source?: string;
    product_line?: string;
    cohort_id?: string;
  };
  onFilterChange?: (filters: {
    source?: string;
    product_line?: string;
    cohort_id?: string;
  }) => void;
  availableSources?: string[];
  isSearching?: boolean;
  // Cohort grouping props
  groupedProducts?: {
    groups: Record<string, PipelineProduct[]>;
    cohortIds: string[];
    names?: Record<string, string>;
  };
  cohortBrands?: Record<string, string>;
  onEditCohort?: (id: string, name: string | null, brandName: string | null) => void;
  onImportCsv?: () => void;
  onManualAdd?: () => void;
  isLoading?: boolean;
}

export function ImportedResultsView({
  products,
  selectedSkus,
  onSelectSku,
  onSelectAll,
  onDeselectAll,
  search,
  onSearchChange,
  filters,
  onFilterChange,
  availableSources = [],
  isSearching = false,
  groupedProducts,
  cohortBrands = {},
  onEditCohort,
  onImportCsv,
  onManualAdd,
  isLoading = false,
}: ImportedResultsViewProps) {
  // 1. Data Transformation & Memoized State
  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => a.sku.localeCompare(b.sku));
  }, [products]);

  // 2. Primary Selection State
  const [preferredSku, setPreferredSku] = useState<string | null>(
    sortedProducts.length > 0 ? sortedProducts[0].sku : null,
  );

  const selectedProduct = useMemo(() => {
    return sortedProducts.find((p) => p.sku === preferredSku) || null;
  }, [sortedProducts, preferredSku]);

  // track previous products to detect when a product is removed
  const prevProductsRef = useRef<PipelineProduct[]>(sortedProducts);

  // 4. Effects
  // Intelligent selection: When products change, if the current selection is gone,
  // select the next product that was after it.
  useEffect(() => {
    const prevProducts = prevProductsRef.current;
    if (prevProducts !== sortedProducts) {
      const currentExists = sortedProducts.some((p) => p.sku === preferredSku);
      if (!currentExists && preferredSku) {
        // Current SKU was removed.
        // Find where it was in the PREVIOUS list.
        const prevIndex = prevProducts.findIndex((p) => p.sku === preferredSku);
        if (prevIndex !== -1) {
          // Select the product that is now at that same index (or the one before if it was last)
          const nextIndex = Math.min(prevIndex, sortedProducts.length - 1);
          if (nextIndex >= 0) {
            setPreferredSku(sortedProducts[nextIndex].sku);
          } else {
            setPreferredSku(null);
          }
        }
      } else if (!preferredSku && sortedProducts.length > 0) {
        setPreferredSku(sortedProducts[0].sku);
      }
      prevProductsRef.current = sortedProducts;
    }
  }, [sortedProducts, preferredSku]);

  // 5. Render logic
  return (
    <div data-testid="product-table" className="flex h-full min-h-0 border-4 border-zinc-950 rounded-none overflow-hidden bg-white shadow-[8px_8px_0px_rgba(0,0,0,1)] max-w-full m-1 mr-4 mb-4">
      {/* Left Column: Product List */}
      <div className="w-96 min-w-[384px] max-w-[384px] border-r border-zinc-950 flex flex-col shrink-0 bg-zinc-50 overflow-x-hidden">
        <div className="flex flex-col border-b border-zinc-950 bg-white">
          <div className="flex items-center gap-2 p-2">
            <label className="flex shrink-0 items-center justify-center h-9 w-9 border border-zinc-950 bg-white shadow-[1px_1px_0px_rgba(0,0,0,1)] hover:bg-zinc-50 cursor-pointer transition-colors">
              <Checkbox
                checked={
                  sortedProducts.length > 0 &&
                  sortedProducts.every((p) => selectedSkus.has(p.sku))
                    ? true
                    : sortedProducts.some((p) => selectedSkus.has(p.sku))
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={(checked) => {
                  if (checked) {
                    onSelectAll?.(sortedProducts.map((p) => p.sku));
                  } else {
                    onDeselectAll?.(sortedProducts.map((p) => p.sku));
                  }
                }}
                className="h-4 w-4 rounded-none border-2 border-zinc-950 accent-zinc-950 data-[state=checked]:bg-zinc-950 data-[state=checked]:text-white data-[state=indeterminate]:bg-zinc-950 data-[state=indeterminate]:text-white"
              />
            </label>
            <PipelineSearchField
              value={search || ""}
              onChange={(value) => onSearchChange?.(value)}
              className="flex-1"
              isLoading={isSearching}
            />
            {filters && onFilterChange ? (
              <PipelineFilters
                filters={filters}
                onFilterChange={onFilterChange}
                availableSources={availableSources}
                showSourceFilter={false}
                className="h-9 w-9 shrink-0 p-0 border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
              />
            ) : null}
          </div>

          {(onImportCsv || onManualAdd) && (
             <div className="flex items-center gap-2 px-2 pb-2">
                {onImportCsv && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onImportCsv}
                    disabled={isLoading}
                    className="flex-1 h-8 border-2 border-zinc-950 text-zinc-950 hover:bg-zinc-100 text-[10px] font-black uppercase tracking-tighter shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
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
                    className="flex-1 h-8 border-2 border-zinc-950 text-zinc-950 hover:bg-zinc-100 text-[10px] font-black uppercase tracking-tighter shadow-[2px_2px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add Product
                  </Button>
                )}
             </div>
          )}
        </div>
        
        <PipelineSidebarTable
          products={sortedProducts}
          groupedProducts={groupedProducts}
          cohortBrands={cohortBrands}
          selectedSkus={selectedSkus}
          preferredSku={preferredSku}
          onSelectSku={onSelectSku}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
          onPreferredSkuChange={setPreferredSku}
          variant="imported"
          onEditCohort={onEditCohort}
        />
      </div>

      {/* Right Column: Product Details */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {selectedProduct ? (
          <>
            {/* Header */}
            <div className="bg-white border-b border-zinc-950 flex-shrink-0 z-10">
              <div className="p-2 sm:p-3 flex justify-between items-center">
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="h-5 w-5 text-zinc-500 shrink-0" />
                  <div className="min-w-0">
                    <h2 className="text-xl font-black uppercase tracking-tighter text-zinc-950 line-clamp-1" title={selectedProduct.input?.name || ""}>
                      {selectedProduct.input?.name}
                    </h2>
                    <div className="text-[10px] font-black uppercase tracking-tighter text-zinc-500 flex items-center gap-2">
                      <span className="bg-zinc-100 border border-zinc-950 px-1.5 py-0.5 rounded-none">{selectedProduct.sku}</span>
                      <span>•</span>
                      <span className="font-black text-zinc-950">
                        ${Number(selectedProduct.input?.price || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Details Content */}
            <div
              key={preferredSku}
              className="flex-1 overflow-y-auto p-4 sm:p-6"
            >
                <div className="max-w-2xl mx-auto space-y-6">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase tracking-tighter bg-zinc-950 text-white px-2 py-0.5 rounded-none">Imported Data</span>
                        </div>
                        <h1 className="text-3xl font-black uppercase tracking-tighter text-zinc-950 leading-tight">
                            {selectedProduct.input?.name}
                        </h1>
                        <p className="text-2xl font-black text-zinc-950">
                            ${Number(selectedProduct.input?.price || 0).toFixed(2)}
                        </p>
                    </div>

                    <Separator className="h-1 bg-zinc-950" />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-zinc-50 border-2 border-zinc-950 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                            <h3 className="text-[10px] font-black uppercase tracking-tighter text-zinc-500 mb-2">Internal Identifier</h3>
                            <p className="font-black uppercase tracking-tighter text-zinc-950">{selectedProduct.sku}</p>
                        </div>
                        {selectedProduct.product_line && (
                            <div className="p-4 bg-zinc-50 border-2 border-zinc-950 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                                <h3 className="text-[10px] font-black uppercase tracking-tighter text-zinc-500 mb-2">Product Line</h3>
                                <p className="font-black uppercase tracking-tighter text-zinc-950">{selectedProduct.product_line}</p>
                            </div>
                        )}
                        {selectedProduct.cohort_id && (
                             <div className="p-4 bg-zinc-50 border-2 border-zinc-950 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                                <h3 className="text-[10px] font-black uppercase tracking-tighter text-zinc-500 mb-2">Cohort ID</h3>
                                <p className="font-black uppercase tracking-tighter text-zinc-950">{selectedProduct.cohort_id}</p>
                            </div>
                        )}
                         {selectedProduct.cohort_brand_name && (
                             <div className="p-4 bg-zinc-50 border-2 border-zinc-950 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                                <h3 className="text-[10px] font-black uppercase tracking-tighter text-zinc-500 mb-2">Brand</h3>
                                <p className="font-black uppercase tracking-tighter text-zinc-950">{selectedProduct.cohort_brand_name}</p>
                            </div>
                        )}
                    </div>

                    {selectedProduct.input?.description && (
                        <div className="space-y-2">
                             <h3 className="text-xs font-black uppercase tracking-tighter text-zinc-950">Original Description</h3>
                             <div className="p-4 bg-white border-2 border-zinc-950 shadow-[4px_4px_0px_rgba(0,0,0,1)] text-sm font-medium leading-relaxed">
                                {selectedProduct.input.description}
                             </div>
                        </div>
                    )}
                </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-500">
            <Package className="h-12 w-12 mb-2 opacity-20" />
            <h3 className="text-lg font-black uppercase tracking-tighter text-zinc-950">Select a product</h3>
            <p className="text-[10px] font-black uppercase tracking-tighter mt-1">Choose a product from the list to view its imported details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
