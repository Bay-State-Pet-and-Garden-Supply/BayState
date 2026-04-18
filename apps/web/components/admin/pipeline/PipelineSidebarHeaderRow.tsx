"use client";

import * as React from "react";
import { Edit2, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableRow, TableCell } from "@/components/ui/table";
import { formatPipelineBatchLabel } from "./view-utils";
import { cn } from "@/lib/utils";
import type { PipelineProduct } from "@/lib/pipeline/types";

interface PipelineSidebarHeaderRowProps {
  cohortId: string;
  groupProducts: PipelineProduct[];
  cohortName?: string | null;
  cohortBrand?: string | null;
  selectedSkus: Set<string>;
  onSelectAll?: (skus: string[]) => void;
  onDeselectAll?: (skus: string[]) => void;
  onEditCohort?: (id: string, name: string | null, brandName: string | null) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: (id: string) => void;
}

/**
 * Reusable cohort header row for the pipeline sidebar table.
 * Implements the "Modern Farm Utilitarian" style with collapsible support.
 */
export function PipelineSidebarHeaderRow({
  cohortId,
  groupProducts,
  cohortName,
  cohortBrand,
  selectedSkus,
  onSelectAll,
  onDeselectAll,
  onEditCohort,
  isCollapsed = false,
  onToggleCollapse,
}: PipelineSidebarHeaderRowProps) {
  const allSelected = groupProducts.length > 0 && groupProducts.every((p) => selectedSkus.has(p.sku));
  const someSelected = groupProducts.some((p) => selectedSkus.has(p.sku)) && !allSelected;

  return (
    <TableRow
      key={`header-${cohortId}`}
      className="bg-zinc-200 hover:bg-zinc-300 border-b-4 border-zinc-950 min-w-0 cursor-pointer select-none sticky top-0 z-20"
      onClick={() => onToggleCollapse?.(cohortId)}
    >
      <TableCell className="p-0 max-w-0 w-full overflow-hidden">
        <div className="flex items-center pl-2 pr-4 py-3 gap-2 w-full">
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-zinc-950 hover:bg-zinc-400"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleCollapse?.(cohortId);
              }}
            >
              <ChevronRight 
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  !isCollapsed && "rotate-90"
                )} 
              />
            </Button>
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={(checked) => {
                const cohortSkus = groupProducts.map((p) => p.sku);
                if (checked) {
                  onSelectAll?.(cohortSkus);
                } else {
                  onDeselectAll?.(cohortSkus);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 border-zinc-950 data-[state=checked]:bg-zinc-950 data-[state=checked]:border-zinc-950"
            />
          </div>
          <div className="flex flex-1 items-center gap-2 overflow-hidden min-w-0">
            <div className="font-black text-[11px] uppercase tracking-tighter text-zinc-950 truncate">
              {formatPipelineBatchLabel(cohortId, cohortName || null)}
            </div>
            {cohortBrand && (
              <Badge variant="outline" className="h-4 text-[9px] px-1 font-black border-brand-forest-green text-brand-forest-green bg-brand-forest-green/10 uppercase tracking-tighter shrink-0">
                {cohortBrand}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <Badge variant="secondary" className="h-4 text-[9px] px-1 bg-zinc-950 text-white font-black uppercase tracking-tighter border-none">
              {groupProducts.length}
            </Badge>
            {cohortId !== "ungrouped" && onEditCohort && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-zinc-500 hover:text-zinc-950 hover:bg-zinc-400/50"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onEditCohort(
                    cohortId,
                    cohortName || null,
                    cohortBrand || null
                  );
                }}
              >
                <Edit2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}
