"use client";

import { ChevronRight, Edit2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import type { RefObject } from "react";
import type { PipelineProduct } from "@/lib/pipeline/types";
import {
  PipelineFilters,
  type PipelineFiltersState,
} from "@/components/admin/pipeline/PipelineFilters";
import { PipelineSearchField } from "@/components/admin/pipeline/PipelineSearchField";
import { formatPipelineBatchLabel } from "@/components/admin/pipeline/view-utils";

export interface ProductListSidebarProps {
  products: PipelineProduct[];
  selectedSku: string | null;
  onSelectProduct: (sku: string) => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
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
  const renderProductItem = (product: PipelineProduct, index?: number) => {
    const name = product.consolidated?.name || product.input?.name || "Unknown";
    const price = product.consolidated?.price ?? product.input?.price;
    const isFocused = selectedSku === product.sku;
    const isSelected = selectedSkus.has(product.sku);

    return (
      <div
        key={product.sku}
        data-sku={product.sku}
        className={`group flex items-start p-4 cursor-pointer hover:bg-muted/50 transition-colors relative ${
          isFocused
            ? "bg-primary/5 shadow-[inset_3px_0_0_0_hsl(var(--primary))]"
            : ""
        }`}
        onClick={() => onSelectProduct(product.sku)}
      >
        <div 
          className="mr-3 mt-0.5 pt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox 
            checked={isSelected}
            onCheckedChange={(checked) => {
              if (onSelectSku) {
                onSelectSku(
                  product.sku, 
                  checked === true, 
                  index, 
                  (window.event as MouseEvent)?.shiftKey
                );
              }
            }}
            className="h-4 w-4 border-muted-foreground/30 data-[state=checked]:bg-brand-forest-green data-[state=checked]:border-brand-forest-green"
          />
        </div>
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
            className={`text-sm font-medium line-clamp-2 mt-0.5 ${isFocused ? "text-primary" : ""}`}
          >
            {name}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-80 border-r flex flex-col shrink-0 bg-muted/5 overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-card p-3">
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
            className="h-9 w-9 shrink-0 p-0"
          />
        ) : null}
      </div>
      <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
        {groupedProducts && (groupedProducts.cohortIds.length > 1 || (groupedProducts.cohortIds.length === 1 && groupedProducts.cohortIds[0] !== "ungrouped")) ? (
          <Accordion type="multiple" className="divide-y divide-border/50">
            {groupedProducts.cohortIds.map((cohortId) => {
              const groupProducts = groupedProducts.groups[cohortId] || [];
              if (groupProducts.length === 0) return null;
              
              return (
                <AccordionItem 
                  key={cohortId} 
                  value={cohortId}
                  className="border-b border-border/80"
                >
                  <div className="flex items-center hover:bg-muted/40 bg-muted/20 pr-1 group">
                    <AccordionTrigger className="flex-1 px-4 py-3 hover:no-underline [&[data-state=open]>div>svg]:rotate-90">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 text-muted-foreground" />
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <span className="font-bold text-xs uppercase tracking-wider text-foreground/80 truncate">
                            {formatPipelineBatchLabel(
                              cohortId,
                              groupedProducts?.names?.[cohortId] || null,
                            )}
                          </span>
                        </div>
                      </div>
                    </AccordionTrigger>
                    
                    <div className="flex items-center gap-1.5 shrink-0 ml-auto pr-2">
                      <div 
                        className="flex items-center gap-1 mr-1" 
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox 
                          checked={groupProducts.length > 0 && groupProducts.every(p => selectedSkus.has(p.sku))}
                          onCheckedChange={(checked) => {
                            if (!onSelectSku) return;
                            groupProducts.forEach(p => {
                              onSelectSku(p.sku, checked === true);
                            });
                          }}
                          className="h-3.5 w-3.5 border-muted-foreground/30 data-[state=checked]:bg-brand-forest-green data-[state=checked]:border-brand-forest-green"
                        />
                      </div>
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
                            e.preventDefault();
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

                  <AccordionContent className="pb-0">
                    <div className="divide-y divide-border/30 bg-muted/5">
                      {groupProducts.map((product) => {
                        const globalIndex = products.findIndex((p) => p.sku === product.sku);
                        return renderProductItem(product, globalIndex);
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        ) : (
          <div className="divide-y">
            {products.map((product, idx) => renderProductItem(product, idx))}
          </div>
        )}
      </div>
    </div>
  );
}
