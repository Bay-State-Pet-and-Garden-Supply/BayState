"use client";

import * as React from "react";
import { Package } from "lucide-react";
import type { PipelineProduct } from "@/lib/pipeline/types";
import { VirtualizedPipelineTable, type VirtualizedPipelineTableHandle } from "./VirtualizedPipelineTable";
import { PipelineSidebarHeaderRow } from "./PipelineSidebarHeaderRow";
import { PipelineSidebarProductRow } from "./PipelineSidebarProductRow";

export type PipelineSidebarTableVariant = "scraped" | "finalizing";

export type FlatItem = 
  | { type: 'header'; cohortId: string; groupProducts: PipelineProduct[] }
  | { type: 'product'; product: PipelineProduct; index: number; visibleProducts: PipelineProduct[] };

export interface PipelineSidebarTableProps {
  products: PipelineProduct[];
  groupedProducts?: {
    groups: Record<string, PipelineProduct[]>;
    cohortIds: string[];
    names?: Record<string, string>;
  };
  cohortBrands?: Record<string, string>;
  
  // Selection
  selectedSkus: Set<string>;
  preferredSku: string | null;
  onSelectSku: (sku: string, isSelected: boolean, index?: number, isShiftClick?: boolean, visibleProducts?: PipelineProduct[]) => void;
  onSelectAll?: (skus: string[]) => void;
  onDeselectAll?: (skus: string[]) => void;
  onPreferredSkuChange: (sku: string) => void;
  
  // Customization
  variant: PipelineSidebarTableVariant;
  onEditCohort?: (id: string, name: string | null, brandName: string | null) => void;
  scrollContainerRef?: React.RefObject<VirtualizedPipelineTableHandle | null>;
}

/**
 * Unified PipelineSidebarTable component foundation.
 * Consolidates duplicated sidebar table logic from ScrapedResultsView and ProductListSidebar.
 */
export function PipelineSidebarTable({
  products,
  groupedProducts,
  cohortBrands = {},
  selectedSkus,
  preferredSku,
  onSelectSku,
  onSelectAll,
  onDeselectAll,
  onPreferredSkuChange,
  variant,
  onEditCohort,
  scrollContainerRef: externalRef,
}: PipelineSidebarTableProps) {
  const internalRef = React.useRef<VirtualizedPipelineTableHandle>(null);
  const scrollContainerRef = externalRef || internalRef;

  // Data flattening logic: handles cohort grouping and "ungrouped" fallback
  const flatItems = React.useMemo(() => {
    const isUngroupedOnly = !groupedProducts || 
      groupedProducts.cohortIds.length === 0 || 
      (groupedProducts.cohortIds.length === 1 && groupedProducts.cohortIds[0] === "ungrouped");

    if (isUngroupedOnly) {
      return products.map((p, i) => ({ 
        type: 'product' as const, 
        product: p, 
        index: i, 
        visibleProducts: products 
      }));
    }

    const items: FlatItem[] = [];
    groupedProducts.cohortIds.forEach((cohortId) => {
      const groupProducts = groupedProducts.groups[cohortId] || [];
      if (groupProducts.length === 0) return;

      items.push({ type: 'header', cohortId, groupProducts });
      groupProducts.forEach((product) => {
        const globalIndex = products.findIndex(p => p.sku === product.sku);
        items.push({ 
          type: 'product', 
          product, 
          index: globalIndex === -1 ? 0 : globalIndex, 
          visibleProducts: groupProducts 
        });
      });
    });

    return items;
  }, [groupedProducts, products]);

  // Virtualization size estimation: 48px for headers, 110px for products
  const estimateSize = React.useCallback((index: number) => {
    const item = flatItems[index];
    if (item?.type === 'header') return 48;
    return 110;
  }, [flatItems]);

  // Keyboard navigation: ArrowUp, ArrowDown, and Space bar
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (
        e.target instanceof HTMLInputElement || 
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        
        const productItems = flatItems.filter(item => item.type === 'product') as Extract<FlatItem, { type: 'product' }>[];
        if (productItems.length === 0) return;

        const currentIndex = productItems.findIndex(item => item.product.sku === preferredSku);
        let nextIndex = currentIndex;

        if (e.key === "ArrowDown") {
          if (currentIndex === -1) {
            nextIndex = 0;
          } else {
            nextIndex = currentIndex < productItems.length - 1 ? currentIndex + 1 : 0;
          }
        } else if (e.key === "ArrowUp") {
          if (currentIndex === -1) {
            nextIndex = productItems.length - 1;
          } else {
            nextIndex = currentIndex > 0 ? currentIndex - 1 : productItems.length - 1;
          }
        }

        const nextProduct = productItems[nextIndex].product;
        onPreferredSkuChange(nextProduct.sku);
      }

      if (e.key === " ") { // Space bar
        e.preventDefault();
        if (preferredSku) {
          const isSelected = selectedSkus.has(preferredSku);
          const item = flatItems.find(item => item.type === 'product' && item.product.sku === preferredSku) as Extract<FlatItem, { type: 'product' }> | undefined;
          
          if (item) {
            onSelectSku(preferredSku, !isSelected, item.index, false, item.visibleProducts);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flatItems, preferredSku, selectedSkus, onPreferredSkuChange, onSelectSku]);

  // Programmatic scrolling: Scroll to preferred SKU when it changes
  React.useLayoutEffect(() => {
    if (preferredSku && scrollContainerRef.current) {
      const index = flatItems.findIndex(item => item.type === 'product' && item.product.sku === preferredSku);
      if (index !== -1) {
        scrollContainerRef.current.scrollToIndex(index, { align: 'auto' });
      }
    }
  }, [preferredSku, flatItems, scrollContainerRef]);

  const renderRow = React.useCallback((item: FlatItem) => {
    if (item.type === 'header') {
      return (
        <PipelineSidebarHeaderRow
          key={`header-${item.cohortId}`}
          cohortId={item.cohortId}
          groupProducts={item.groupProducts}
          cohortName={groupedProducts?.names?.[item.cohortId]}
          cohortBrand={cohortBrands[item.cohortId]}
          selectedSkus={selectedSkus}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
          onEditCohort={onEditCohort}
        />
      );
    }

    return (
      <PipelineSidebarProductRow
        key={item.product.sku}
        product={item.product}
        index={item.index}
        visibleProducts={item.visibleProducts}
        variant={variant}
        isFocused={preferredSku === item.product.sku}
        isSelected={selectedSkus.has(item.product.sku)}
        onSelectSku={onSelectSku}
        onPreferredSkuChange={onPreferredSkuChange}
      />
    );
  }, [
    variant,
    preferredSku,
    selectedSkus,
    onSelectSku,
    onSelectAll,
    onDeselectAll,
    onPreferredSkuChange,
    onEditCohort,
    groupedProducts,
    cohortBrands
  ]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {flatItems.length > 0 ? (
        <VirtualizedPipelineTable
          ref={scrollContainerRef}
          items={flatItems}
          estimateSize={estimateSize}
          renderRow={renderRow}
          containerClassName="p-0 pr-0 pb-0"
          tableProps={{
            className: "border-none shadow-none w-full",
          }}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500">
          <Package className="h-12 w-12 mb-4 opacity-20" />
          <p className="text-sm font-black uppercase tracking-tighter">No products found</p>
        </div>
      )}
    </div>
  );
}
