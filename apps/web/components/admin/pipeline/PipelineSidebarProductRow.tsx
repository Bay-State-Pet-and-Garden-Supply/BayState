"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { PipelineProduct } from "@/lib/pipeline/types";
import type { PipelineSidebarTableVariant } from "./PipelineSidebarTable";

interface PipelineSidebarProductRowProps {
  product: PipelineProduct;
  index: number;
  visibleProducts: PipelineProduct[];
  variant: PipelineSidebarTableVariant;
  isFocused: boolean;
  isSelected: boolean;
  onSelectUpc: (upc: string, isSelected: boolean, index?: number, isShiftClick?: boolean, visibleProducts?: PipelineProduct[]) => void;
  onPreferredUpcChange: (upc: string) => void;
  showCheckboxes?: boolean;
}

/**
 * Reusable product row for the pipeline sidebar table.
 * Implements the "Modern Farm Utilitarian" style with variant support.
 */
export function PipelineSidebarProductRow({
  product,
  index,
  visibleProducts,
  variant,
  isFocused,
  isSelected,
  onSelectUpc,
  onPreferredUpcChange,
  showCheckboxes = true,
}: PipelineSidebarProductRowProps) {
  const name = product.consolidated?.name || product.input?.name || "Unknown";
  const price = product.consolidated?.price ?? product.input?.price;
  const sourceKeys = Object.keys(product.sources || {}).filter(
    (key) => !key.startsWith("_"),
  );

  return (
    <TableRow
      key={product.upc}
      data-upc={product.upc}
      className={cn(
        "cursor-pointer transition-colors duration-300 ease-out relative min-w-0 border-b border-border",
        isFocused ? "bg-primary/5" : "bg-background hover:bg-muted/30"
      )}
      onClick={() => onPreferredUpcChange(product.upc)}
    >
      <TableCell className="p-4 whitespace-normal max-w-0 w-full overflow-hidden">
        <div className="flex items-start gap-3 w-full">
          {showCheckboxes && (
            <div
              className="mt-0.5 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onSelectUpc(
                  product.upc,
                  !isSelected,
                  index,
                  e.shiftKey,
                  visibleProducts,
                );
              }}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => {
                  // Handle keyboard interaction for checkbox
                  if (typeof window !== 'undefined' && !(window.event instanceof MouseEvent)) {
                    onSelectUpc(
                      product.upc,
                      checked === true,
                      index,
                      false,
                      visibleProducts,
                    )
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectUpc(
                    product.upc,
                    !isSelected,
                    index,
                    e.shiftKey,
                    visibleProducts,
                  );
                }}
                className="h-4 w-4 border-foreground data-[state=checked]:bg-foreground data-[state=checked]:border-foreground"
              />
            </div>
          )}
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex justify-between items-start gap-2 min-w-0">
              <div className="font-semibold text-xs text-muted-foreground truncate flex-1 uppercase tracking-wider">
                {product.upc}
              </div>
              {price !== undefined && (
                <div className="text-sm font-bold text-foreground shrink-0">
                  ${Number(price).toFixed(2)}
                </div>
              )}
            </div>
            <div
              className={cn(
                "text-sm font-semibold line-clamp-2 mt-0.5 break-all",
                isFocused ? "text-foreground" : "text-foreground/80"
              )}
            >
              {name}
            </div>
            
            {variant === "processed" && (
              <div className="flex flex-wrap items-center gap-2 mt-2 min-w-0">
                {sourceKeys.map((key) => (
                  <Badge
                    key={key}
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0.5 font-semibold bg-muted text-foreground border border-border truncate max-w-full rounded-sm"
                  >
                    {key}
                  </Badge>
                ))}
                {sourceKeys.length === 0 && (
                  <span className="text-[10px] text-muted-foreground shrink-0 font-semibold">
                    —
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}
