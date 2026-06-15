"use client";

import * as React from "react";
import { Package } from "lucide-react";
import type { PipelineProduct } from "@/lib/pipeline/types";
import { VirtualizedPipelineTable, type VirtualizedPipelineTableHandle } from "./VirtualizedPipelineTable";
import { PipelineSidebarProductRow } from "./PipelineSidebarProductRow";

export type PipelineSidebarTableVariant = "processed" | "reviewing" | "imported";

type FlatItem = {
  type: "product";
  product: PipelineProduct;
  index: number;
  visibleProducts: PipelineProduct[];
};

interface PipelineSidebarTableProps {
  products: PipelineProduct[];
  selectedUpcs: Set<string>;
  preferredUpc: string | null;
  onSelectUpc: (
    upc: string,
    isSelected: boolean,
    index?: number,
    isShiftClick?: boolean,
    visibleProducts?: PipelineProduct[],
  ) => void;
  onSelectAll?: (upcs: string[]) => void;
  onDeselectAll?: (upcs: string[]) => void;
  onPreferredUpcChange: (upc: string) => void;
  variant: PipelineSidebarTableVariant;
  scrollContainerRef?: React.RefObject<VirtualizedPipelineTableHandle | null>;
}

/**
 * Flat, virtualized product sidebar used by non-Imported pipeline workspaces.
 * Imported has its own brand-grouped workspace because products are not yet
 * classified into product lines at that stage.
 */
export function PipelineSidebarTable({
  products,
  selectedUpcs,
  preferredUpc,
  onSelectUpc,
  onPreferredUpcChange,
  variant,
  scrollContainerRef: externalRef,
}: PipelineSidebarTableProps) {
  const internalRef = React.useRef<VirtualizedPipelineTableHandle>(null);
  const scrollContainerRef = externalRef || internalRef;

  const flatItems = React.useMemo<FlatItem[]>(() => {
    return products.map((product, index) => ({
      type: "product",
      product,
      index,
      visibleProducts: products,
    }));
  }, [products]);

  const estimateSize = React.useCallback(() => 110, []);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();

        if (products.length === 0) return;

        const currentIndex = products.findIndex((p) => p.upc === preferredUpc);
        let nextIndex = currentIndex;

        if (e.key === "ArrowDown") {
          nextIndex = currentIndex === -1
            ? 0
            : currentIndex < products.length - 1
              ? currentIndex + 1
              : 0;
        } else if (e.key === "ArrowUp") {
          nextIndex = currentIndex === -1
            ? products.length - 1
            : currentIndex > 0
              ? currentIndex - 1
              : products.length - 1;
        }

        const nextProduct = products[nextIndex];
        if (nextProduct) {
          onPreferredUpcChange(nextProduct.upc);
        }
      }

      if (e.key === " ") {
        e.preventDefault();
        if (!preferredUpc) return;
        const item = flatItems.find((entry) => entry.product.upc === preferredUpc);
        if (!item) return;
        onSelectUpc(preferredUpc, !selectedUpcs.has(preferredUpc), item.index, false, item.visibleProducts);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flatItems, preferredUpc, products, selectedUpcs, onPreferredUpcChange, onSelectUpc]);

  React.useLayoutEffect(() => {
    if (preferredUpc && scrollContainerRef.current) {
      const index = flatItems.findIndex((item) => item.product.upc === preferredUpc);
      if (index !== -1) {
        scrollContainerRef.current.scrollToIndex(index, { align: "auto" });
      }
    }
  }, [preferredUpc, flatItems, scrollContainerRef]);

  const renderRow = (item: FlatItem) => (
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
      showCheckboxes
    />
  );

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
