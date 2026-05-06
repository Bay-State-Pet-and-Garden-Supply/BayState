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
import type { Brand } from "@/lib/types";

interface PipelineSidebarHeaderRowProps {
  cohortId: string;
  groupProducts: PipelineProduct[];
  cohortName?: string | null;
  cohortBrand?: string | null;
  cohortBrandObject?: Brand;
  selectedSkus: Set<string>;
  onSelectAll?: (skus: string[]) => void;
  onDeselectAll?: (skus: string[]) => void;
  onEditCohort?: (id: string, name: string | null, brandName: string | null) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: (id: string) => void;
  isActive?: boolean;
  hideChevron?: boolean;
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
  cohortBrandObject,
  selectedSkus,
  onSelectAll,
  onDeselectAll,
  onEditCohort,
  isCollapsed = false,
  onToggleCollapse,
  isActive = false,
  hideChevron = false,
}: PipelineSidebarHeaderRowProps) {
  const allSelected = groupProducts.length > 0 && groupProducts.every((p) => selectedSkus.has(p.sku));
  const someSelected = groupProducts.some((p) => selectedSkus.has(p.sku)) && !allSelected;
  const hasConfiguredDomains = Boolean(cohortBrandObject?.official_domains && cohortBrandObject.official_domains.length > 0);

  return (
    <TableRow
      key={`header-${cohortId}`}
      className={cn(
        "group cursor-pointer select-none transition-all duration-500 ease-out",
        isActive ? "bg-primary/20 hover:bg-primary/30 border-b-4 border-foreground shadow-sm" : 
        isCollapsed 
          ? "bg-background hover:bg-muted/20 border-b border-border shadow-none" 
          : "bg-card hover:bg-card/80 border-b-4 border-foreground shadow-sm"
      )}
      onClick={() => onToggleCollapse?.(cohortId)}
    >
      <TableCell className="p-0 max-w-0 w-full overflow-hidden">
        <div className="flex items-center pl-2 pr-4 py-3 gap-2 w-full">
          <div className="flex items-center gap-1.5 shrink-0">
            {!hideChevron && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-foreground hover:bg-muted/50 transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleCollapse?.(cohortId);
                }}
              >
                <ChevronRight 
                  className={cn(
                    "h-4 w-4 transition-transform duration-500 ease-out",
                    !isCollapsed && "rotate-90"
                  )} 
                />
              </Button>
            )}
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
              className="h-4 w-4 border-foreground data-[state=checked]:bg-foreground data-[state=checked]:border-foreground"
            />
          </div>
          <div className="flex-1 flex items-center gap-2 overflow-hidden min-w-0">
            <div className="font-black text-[11px] uppercase tracking-widest text-foreground truncate shrink-0">
              {formatPipelineBatchLabel(cohortId, cohortName || null)}
            </div>
            {cohortBrand && (
              <Badge variant="outline" className={cn(
                "h-4 text-[9px] px-1 font-black uppercase tracking-widest shrink-0 rounded-none",
                hasConfiguredDomains
                  ? "border-brand-forest-green text-brand-forest-green bg-brand-forest-green/10"
                  : "border-brand-gold text-brand-burgundy bg-brand-gold/10"
              )}>
                {cohortBrand}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <Badge variant="secondary" className="h-4 text-[9px] px-1 bg-foreground text-background font-black uppercase tracking-widest border-none rounded-none">
              {groupProducts.length}
            </Badge>
            {cohortId !== "ungrouped" && onEditCohort && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/50"
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

