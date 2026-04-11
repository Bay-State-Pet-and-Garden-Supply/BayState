"use client";

import { Search, X } from "lucide-react";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import type { RefObject } from "react";
import type { PipelineProduct } from "@/lib/pipeline/types";

export interface ProductListSidebarProps {
  products: PipelineProduct[];
  selectedSku: string | null;
  onSelectProduct: (sku: string) => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  search?: string;
  onSearchChange?: (value: string) => void;
}

export function ProductListSidebar({
  products,
  selectedSku,
  onSelectProduct,
  scrollContainerRef,
  search,
  onSearchChange,
}: ProductListSidebarProps) {
  const [localSearch, setLocalSearch] = useState(search || "");

  useEffect(() => {
    if (search !== undefined) setLocalSearch(search);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== search && onSearchChange) {
        onSearchChange(localSearch);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [localSearch, onSearchChange, search]);

  return (
    <div className="w-1/3 border-r flex flex-col min-w-[320px] bg-muted/5 overflow-hidden">
      <div className="p-3 border-b bg-card">
        <div className="relative group">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-brand-forest-green" />
          <Input
            placeholder="Search SKUs or names..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="h-9 pl-9 pr-8 bg-background border-muted-foreground/20 focus-visible:ring-brand-forest-green/30"
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
