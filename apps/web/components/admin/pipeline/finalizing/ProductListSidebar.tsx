"use client";

import type { RefObject } from "react";
import type { PipelineProduct } from "@/lib/pipeline/types";

export interface ProductListSidebarProps {
  products: PipelineProduct[];
  selectedSku: string | null;
  onSelectProduct: (sku: string) => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

export function ProductListSidebar({
  products,
  selectedSku,
  onSelectProduct,
  scrollContainerRef,
}: ProductListSidebarProps) {
  return (
    <div className="w-1/3 border-r flex flex-col min-w-[320px] bg-muted/5 overflow-hidden">
      <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
        <div className="divide-y">
          {products.map((product) => {
            const name =
              product.consolidated?.name || product.input?.name || "Unknown";
            const price = product.consolidated?.price ?? product.input?.price;
            const isSelected = selectedSku === product.sku;

            return (
              <div
                key={product.sku}
                data-sku={product.sku}
                className={`group p-3 cursor-pointer hover:bg-muted/50 transition-colors relative ${
                  isSelected
                    ? "bg-primary/5 shadow-[inset_3px_0_0_0_hsl(var(--primary))]"
                    : ""
                }`}
                onClick={() => onSelectProduct(product.sku)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <div className="font-mono text-[10px] text-muted-foreground truncate flex-1 uppercase tracking-tight">
                        {product.sku}
                      </div>
                      {price !== undefined && (
                        <div className="text-sm font-bold text-primary">
                          ${Number(price).toFixed(2)}
                        </div>
                      )}
                    </div>
                    <div
                      className={`text-sm font-medium line-clamp-2 mt-0.5 ${isSelected ? "text-primary" : ""}`}
                    >
                      {name}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
