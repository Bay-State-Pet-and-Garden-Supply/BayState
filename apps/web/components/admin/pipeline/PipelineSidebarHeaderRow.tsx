"use client";

import * as React from "react";
import { Edit2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableRow, TableCell } from "@/components/ui/table";
import { formatPipelineBatchLabel } from "./view-utils";
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
}

/**
 * Reusable cohort header row for the pipeline sidebar table.
 * Implements the "Modern Farm Utilitarian" style.
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
}: PipelineSidebarHeaderRowProps) {
  const allSelected = groupProducts.length > 0 && groupProducts.every((p) => selectedSkus.has(p.sku));
  const someSelected = groupProducts.some((p) => selectedSkus.has(p.sku)) && !allSelected;

  return (
    <TableRow
      key={`header-${cohortId}`}
      className="bg-zinc-100/80 hover:bg-zinc-200/80 border-b-4 border-zinc-950 min-w-0"
    >
      <TableCell className="p-0 whitespace-normal">
        <div className="flex items-center px-4 py-3 gap-2 min-w-0">
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
          <div className="flex flex-1 items-center gap-2 overflow-hidden">
            <span className="font-black text-[11px] uppercase tracking-tighter text-zinc-950 truncate">
              {formatPipelineBatchLabel(cohortId, cohortName || null)}
            </span>
            {cohortBrand && (
              <Badge variant="outline" className="h-4 text-[9px] px-1 font-black border-zinc-950 text-zinc-950 bg-white uppercase tracking-tighter">
                {cohortBrand}
              </Badge>
            )}
            <Badge variant="secondary" className="h-4 text-[9px] px-1 bg-zinc-950 text-white font-black uppercase tracking-tighter">
              {groupProducts.length}
            </Badge>
          </div>
          {cohortId !== "ungrouped" && onEditCohort && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-zinc-950 hover:bg-zinc-300"
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
      </TableCell>
    </TableRow>
  );
}
