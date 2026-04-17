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
  onSelectSku: (sku: string, isSelected: boolean, index?: number, isShiftClick?: boolean, visibleProducts?: PipelineProduct[]) => void;
  onPreferredSkuChange: (sku: string) => void;
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
  onSelectSku,
  onPreferredSkuChange,
}: PipelineSidebarProductRowProps) {
  const name = product.consolidated?.name || product.input?.name || "Unknown";
  const price = product.consolidated?.price ?? product.input?.price;
  const sourceKeys = Object.keys(product.sources || {}).filter(
    (key) => !key.startsWith("_"),
  );

  return (
    <TableRow
      key={product.sku}
      data-sku={product.sku}
      className={cn(
        "cursor-pointer transition-colors relative min-w-0",
        isFocused ? "bg-zinc-100" : "hover:bg-zinc-50"
      )}
      onClick={() => onPreferredSkuChange(product.sku)}
    >
      <TableCell className="p-4 whitespace-normal">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="mt-0.5 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onSelectSku(
                product.sku,
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
                  onSelectSku(
                    product.sku,
                    checked === true,
                    index,
                    false,
                    visibleProducts,
                  )
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectSku(
                  product.sku,
                  !isSelected,
                  index,
                  e.shiftKey,
                  visibleProducts,
                );
              }}
              className="h-4 w-4 border-zinc-950 data-[state=checked]:bg-zinc-950 data-[state=checked]:border-zinc-950"
            />
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex justify-between items-start gap-2 min-w-0">
              <div className="font-black text-[10px] text-zinc-500 truncate flex-1 uppercase tracking-tighter">
                {product.sku}
              </div>
              {price !== undefined && (
                <div className="text-sm font-black text-zinc-950 shrink-0 uppercase tracking-tighter">
                  ${Number(price).toFixed(2)}
                </div>
              )}
            </div>
            <div
              className={cn(
                "text-sm font-black uppercase tracking-tighter line-clamp-2 mt-0.5 break-words",
                isFocused ? "text-zinc-950" : "text-zinc-700"
              )}
            >
              {name}
            </div>
            
            {variant === "scraped" && (
              <div className="flex flex-wrap items-center gap-2 mt-2 min-w-0">
                {sourceKeys.map((key) => (
                  <Badge
                    key={key}
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 font-black uppercase tracking-tighter bg-zinc-100 text-zinc-950 border-2 border-zinc-950 truncate max-w-full"
                  >
                    {key}
                  </Badge>
                ))}
                {sourceKeys.length === 0 && (
                  <span className="text-[10px] text-zinc-500 shrink-0 font-black uppercase tracking-tighter">
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
