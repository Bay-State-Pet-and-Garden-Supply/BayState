"use client";

import { Search, X, ChevronRight, Layers, Tag, Edit2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { RefObject } from "react";
import type { PipelineProduct } from "@/lib/pipeline/types";

export interface ProductListSidebarProps {
  products: PipelineProduct[];
  selectedSku: string | null;
  onSelectProduct: (sku: string) => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  search?: string;
  onSearchChange?: (value: string) => void;
  groupedProducts?: {
    groups: Record<string, PipelineProduct[]>;
    cohortIds: string[];
    names?: Record<string, string>;
  };
  cohortBrands?: Record<string, string>;
  onEditCohort?: (id: string, name: string | null, brandName: string | null) => void;
}

export function ProductListSidebar({
  products,
  selectedSku,
  onSelectProduct,
  scrollContainerRef,
  search,
  onSearchChange,
  groupedProducts,
  cohortBrands = {},
  onEditCohort,
}: ProductListSidebarProps) {
  const [localSearch, setLocalSearch] = useState(search || "");

  useEffect(() => {
    if (search !== undefined) setLocalSearch(search);
  }, [search]);

  const handleCommitSearch = () => {
    if (onSearchChange) {
      onSearchChange(localSearch);
    }
  };

  const handleClearSearch = () => {
    setLocalSearch("");
    if (onSearchChange) {
      onSearchChange("");
    }
  };

  const renderProductItem = (product: PipelineProduct) => {
    const name = product.consolidated?.name || product.input?.name || "Unknown";
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
  };

  return (
    <div className="w-1/3 border-r flex flex-col min-w-[320px] bg-muted/5 overflow-hidden">
      <div className="p-3 border-b bg-card">
        <div className="relative group">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-brand-forest-green" />
          <Input
            placeholder="Search SKUs or names..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleCommitSearch();
              }
            }}
            className="h-9 pl-9 pr-8 bg-background border-muted-foreground/20 focus-visible:ring-brand-forest-green/30"
          />
          {localSearch && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
        {groupedProducts && groupedProducts.cohortIds.length > 1 ? (
          <Accordion type="multiple" className="divide-y divide-border/50">
            {groupedProducts.cohortIds.map((cohortId) => {
              const groupProducts = groupedProducts.groups[cohortId] || [];
              if (groupProducts.length === 0) return null;
              
              return (
                <AccordionItem 
                  key={cohortId} 
                  value={cohortId}
                  className="border-b border-border/80 border-l-4 border-l-brand-forest-green/30"
                >
                  <AccordionTrigger className="px-3 py-1.5 hover:bg-muted/40 hover:no-underline [&[data-state=open]>div>svg]:rotate-90 bg-muted/20">
                    <div className="flex items-center gap-2">
                      <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 text-muted-foreground" />
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <span className="font-bold text-xs uppercase tracking-wider text-foreground/80 truncate">
                          {cohortId === "ungrouped" 
                            ? "Ungrouped" 
                            : groupedProducts?.names?.[cohortId] || `Cohort: ${cohortId}`
                          }
                        </span>
                        {cohortBrands[cohortId] && (
                          <Badge variant="outline" className="h-4 text-[9px] px-1 font-bold border-brand-forest-green/30 text-brand-forest-green bg-brand-forest-green/5">
                            {cohortBrands[cohortId]}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="h-4 text-[9px] px-1 bg-muted text-muted-foreground font-normal">
                          {groupProducts.length}
                        </Badge>
                        {cohortId !== "ungrouped" && onEditCohort && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 text-muted-foreground hover:text-brand-forest-green"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditCohort(
                                cohortId,
                                groupedProducts?.names?.[cohortId] || null,
                                cohortBrands[cohortId] || null
                              );
                            }}
                          >
                            <Edit2 className="h-2.5 w-2.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    <div className="divide-y divide-border/30 bg-muted/5">
                      {groupProducts.map((product) => renderProductItem(product))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        ) : (
          <div className="divide-y">
            {products.map((product) => renderProductItem(product))}
          </div>
        )}
      </div>
    </div>
  );
}
