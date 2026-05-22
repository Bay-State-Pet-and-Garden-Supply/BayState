"use client";

import * as React from "react";
import { Package } from "lucide-react";
import type { PipelineProduct } from "@/lib/pipeline/types";
import type { Brand } from "@/lib/types";
import { VirtualizedPipelineTable, type VirtualizedPipelineTableHandle } from "./VirtualizedPipelineTable";
import { PipelineSidebarHeaderRow } from "./PipelineSidebarHeaderRow";
import { PipelineSidebarProductRow } from "./PipelineSidebarProductRow";

export type PipelineSidebarTableVariant = "processed" | "reviewing" | "imported";

type FlatItem = 
  | { type: 'header'; cohortId: string; groupProducts: PipelineProduct[] }
  | { type: 'product'; product: PipelineProduct; index: number; visibleProducts: PipelineProduct[] };

interface PipelineSidebarTableProps {
  products: PipelineProduct[];
  groupedProducts?: {
    groups: Record<string, PipelineProduct[]>;
    cohortIds: string[];
    names?: Record<string, string>;
  };
  cohortBrands?: Record<string, string>;
  cohortBrandObjects?: Record<string, Brand>;
  
  // Selection
  selectedUpcs: Set<string>;
  preferredUpc: string | null;
  preferredCohortId?: string | null;
  onSelectUpc: (upc: string, isSelected: boolean, index?: number, isShiftClick?: boolean, visibleProducts?: PipelineProduct[]) => void;
  onSelectAll?: (upcs: string[]) => void;
  onDeselectAll?: (upcs: string[]) => void;
  onPreferredUpcChange: (upc: string) => void;
  onPreferredCohortChange?: (cohortId: string) => void;
  
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
  cohortBrandObjects = {},
  selectedUpcs,
  preferredUpc,
  preferredCohortId,
  onSelectUpc,
  onSelectAll,
  onDeselectAll,
  onPreferredUpcChange,
  onPreferredCohortChange,
  variant,
  onEditCohort,
  scrollContainerRef: externalRef,
}: PipelineSidebarTableProps) {
  const internalRef = React.useRef<VirtualizedPipelineTableHandle>(null);
  const scrollContainerRef = externalRef || internalRef;
  const [expandedCohortIds, setExpandedCohortIds] = React.useState<Set<string>>(new Set());

  const toggleCohortExpansion = React.useCallback((cohortId: string) => {
    setExpandedCohortIds((prev) => {
      const next = new Set(prev);
      if (next.has(cohortId)) {
        next.delete(cohortId);
      } else {
        next.add(cohortId);
      }
      return next;
    });
  }, []);

  // Logical product order for keyboard navigation, regardless of expansion state
  const allProductItems = React.useMemo(() => {
    const isUngroupedOnly = !groupedProducts || 
      groupedProducts.cohortIds.length === 0 || 
      (groupedProducts.cohortIds.length === 1 && groupedProducts.cohortIds[0] === "ungrouped");

    if (isUngroupedOnly) {
      return products;
    }

    const ordered: PipelineProduct[] = [];
    groupedProducts.cohortIds.forEach((cohortId) => {
      const groupProducts = groupedProducts.groups[cohortId] || [];
      ordered.push(...groupProducts);
    });
    return ordered;
  }, [groupedProducts, products]);

  // Ensure preferredUpc's cohort is expanded so it's visible in the virtualized list
  React.useEffect(() => {
    if (preferredUpc && groupedProducts && variant !== "imported") {
      const cohortId = groupedProducts.cohortIds.find(cid => 
        groupedProducts.groups[cid]?.some(p => p.upc === preferredUpc)
      );
      if (cohortId && !expandedCohortIds.has(cohortId)) {
        setExpandedCohortIds(prev => {
          const next = new Set(prev);
          next.add(cohortId);
          return next;
        });
      }
    }
  }, [preferredUpc, groupedProducts, variant]);

  // Data flattening logic: handles cohort grouping and "ungrouped" fallback
  const flatItems = React.useMemo(() => {
    const isUngroupedOnly = !groupedProducts || 
      groupedProducts.cohortIds.length === 0 || 
      (groupedProducts.cohortIds.length === 1 && groupedProducts.cohortIds[0] === "ungrouped");

    if (variant === "imported" && groupedProducts) {
      const items: FlatItem[] = [];
      groupedProducts.cohortIds.forEach((cohortId) => {
        const groupProducts = groupedProducts.groups[cohortId] || [];
        if (groupProducts.length === 0) return;
        items.push({ type: 'header', cohortId, groupProducts });
      });
      return items;
    }

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
      
      // Only add products if expanded
      if (expandedCohortIds.has(cohortId)) {
        groupProducts.forEach((product) => {
          const globalIndex = products.findIndex(p => p.upc === product.upc);
          items.push({ 
            type: 'product', 
            product, 
            index: globalIndex === -1 ? 0 : globalIndex, 
            visibleProducts: groupProducts 
          });
        });
      }
    });

    return items;
  }, [groupedProducts, products, expandedCohortIds, variant]);

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

      if (variant === "imported") return; // Skip for flat cohort view for now

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        
        if (allProductItems.length === 0) return;

        const currentIndex = allProductItems.findIndex(p => p.upc === preferredUpc);
        let nextIndex = currentIndex;

        if (e.key === "ArrowDown") {
          if (currentIndex === -1) {
            nextIndex = 0;
          } else {
            nextIndex = currentIndex < allProductItems.length - 1 ? currentIndex + 1 : 0;
          }
        } else if (e.key === "ArrowUp") {
          if (currentIndex === -1) {
            nextIndex = allProductItems.length - 1;
          } else {
            nextIndex = currentIndex > 0 ? currentIndex - 1 : allProductItems.length - 1;
          }
        }

        const nextProduct = allProductItems[nextIndex];
        onPreferredUpcChange(nextProduct.upc);
      }

      if (e.key === " ") { // Space bar
        e.preventDefault();
        if (preferredUpc) {
          const isSelected = selectedUpcs.has(preferredUpc);
          
          // Try to find in flatItems first (best for visible products)
          const item = flatItems.find(item => item.type === 'product' && item.product.upc === preferredUpc) as Extract<FlatItem, { type: 'product' }> | undefined;
          
          if (item) {
            onSelectUpc(preferredUpc, !isSelected, item.index, false, item.visibleProducts);
          } else {
            // Fallback for products whose cohorts are still expanding
            if (groupedProducts) {
              const cohortId = groupedProducts.cohortIds.find(cid => 
                groupedProducts.groups[cid]?.some(p => p.upc === preferredUpc)
              );
              if (cohortId) {
                const groupProducts = groupedProducts.groups[cohortId];
                const globalIndex = products.findIndex(p => p.upc === preferredUpc);
                onSelectUpc(preferredUpc, !isSelected, globalIndex === -1 ? 0 : globalIndex, false, groupProducts);
              }
            } else {
              const globalIndex = products.findIndex(p => p.upc === preferredUpc);
              if (globalIndex !== -1) {
                onSelectUpc(preferredUpc, !isSelected, globalIndex, false, products);
              }
            }
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allProductItems, flatItems, preferredUpc, selectedUpcs, onPreferredUpcChange, onSelectUpc, variant]);

  // Programmatic scrolling: Scroll to preferred UPC when it changes
  React.useLayoutEffect(() => {
    if (variant !== "imported" && preferredUpc && scrollContainerRef.current) {
      const index = flatItems.findIndex(item => item.type === 'product' && item.product.upc === preferredUpc);
      if (index !== -1) {
        scrollContainerRef.current.scrollToIndex(index, { align: 'auto' });
      }
    }
  }, [preferredUpc, flatItems, scrollContainerRef, variant]);

  const renderRow = (item: FlatItem) => {
    const showCheckboxes = variant !== "imported";

    if (item.type === 'header') {
      return (
        <PipelineSidebarHeaderRow
          key={`header-${item.cohortId}`}
          cohortId={item.cohortId}
          groupProducts={item.groupProducts}
          cohortName={groupedProducts?.names?.[item.cohortId]}
          cohortBrand={cohortBrands[item.cohortId]}
          cohortBrandObject={cohortBrandObjects[item.cohortId]}
          selectedUpcs={selectedUpcs}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
          onEditCohort={onEditCohort}
          isCollapsed={variant === "imported" ? true : !expandedCohortIds.has(item.cohortId)}
          onToggleCollapse={variant === "imported" ? onPreferredCohortChange : toggleCohortExpansion}
          isActive={variant === "imported" && preferredCohortId === item.cohortId}
          hideChevron={variant === "imported"}
          showCheckboxes={showCheckboxes}
        />
      );
    }

    return (
      <PipelineSidebarProductRow
        key={item.product.upc}
        product={item.product}
        index={item.index}
        visibleProducts={item.visibleProducts}
        variant={variant}
        isFocused={preferredUpc === item.product.upc}
        isSelected={selectedUpcs.has(item.product.upc)}
        onSelectUpc={onSelectUpc}
        onPreferredUpcChange={onPreferredUpcChange}
        showCheckboxes={showCheckboxes}
      />
    );
  };

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
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
          <Package className="h-12 w-12 mb-4 opacity-20" />
          <p className="text-sm font-semibold">No products found</p>
        </div>
      )}
    </div>
  );
}
