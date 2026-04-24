"use client";

import { useEffect, useState } from "react";
import { Filter } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface PipelineFiltersState {
  source?: string;
  product_line?: string;
  cohort_id?: string;
}

interface PipelineFiltersProps {
  filters: PipelineFiltersState;
  onFilterChange: (filters: PipelineFiltersState) => void;
  availableSources?: string[];
  className?: string;
  showSourceFilter?: boolean;
}

export function PipelineFilters({
  filters,
  onFilterChange,
  availableSources = [],
  className,
  showSourceFilter = availableSources.length > 0,
}: PipelineFiltersProps) {
  const [localFilters, setLocalFilters] = useState<PipelineFiltersState>(filters);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const handleApply = () => {
    onFilterChange({
      source: localFilters.source || undefined,
      product_line: localFilters.product_line?.trim() || undefined,
      cohort_id: localFilters.cohort_id?.trim() || undefined,
    });
    setIsOpen(false);
  };

  const handleClear = () => {
    const cleared: PipelineFiltersState = {};
    setLocalFilters(cleared);
    onFilterChange(cleared);
    setIsOpen(false);
  };

  const activeFilterCount = [
    filters.source,
    filters.product_line,
    filters.cohort_id,
  ].filter(Boolean).length;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-8 border-dashed",
            activeFilterCount > 0 &&
              "gap-1.5 border-brand-forest-green/20 bg-brand-forest-green/10 text-brand-forest-green",
            className,
          )}
          aria-label="Open product filters"
        >
          <Filter className="h-3.5 w-3.5" />
          {activeFilterCount > 0 ? (
            <Badge
              variant="secondary"
              className="h-4 bg-brand-forest-green/15 px-1 text-[10px] text-brand-forest-green hover:bg-brand-forest-green/20"
            >
              {activeFilterCount}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 border border-zinc-900 shadow-[1px_1px_0px_rgba(0,0,0,1)]" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h4 className="text-sm font-bold uppercase tracking-tight leading-none">Filter products</h4>
              <p className="text-[10px] text-muted-foreground">
                Only filters that the pipeline actually applies are shown here.
              </p>
            </div>
            {activeFilterCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground"
                onClick={handleClear}
              >
                Clear all
              </Button>
            ) : null}
          </div>

          {showSourceFilter ? (
            <div className="space-y-1">
              <Label htmlFor="source" className="text-[10px] font-bold uppercase text-muted-foreground">Source</Label>
              <Select
                value={localFilters.source || "all"}
                onValueChange={(value) =>
                  setLocalFilters((prev) => ({
                    ...prev,
                    source: value === "all" ? undefined : value,
                  }))
                }
              >
                <SelectTrigger id="source" className="h-8 text-xs">
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All sources</SelectItem>
                  {availableSources.map((source) => (
                    <SelectItem key={source} value={source} className="text-xs">
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1">
            <Label htmlFor="product_line" className="text-[10px] font-bold uppercase text-muted-foreground">Product line</Label>
            <Input
              id="product_line"
              type="search"
              autoComplete="off"
              placeholder="e.g. Bentley Seeds"
              className="h-8 text-xs"
              value={localFilters.product_line || ""}
              onChange={(event) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  product_line: event.target.value || undefined,
                }))
              }
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="cohort_id" className="text-[10px] font-bold uppercase text-muted-foreground">Batch ID</Label>
            <Input
              id="cohort_id"
              type="search"
              autoComplete="off"
              placeholder="e.g. 3389440f"
              className="h-8 text-xs"
              value={localFilters.cohort_id || ""}
              onChange={(event) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  cohort_id: event.target.value || undefined,
                }))
              }
            />
          </div>

          <div className="pt-1">
            <Button className="h-8 w-full text-xs font-bold uppercase" onClick={handleApply}>
              Apply filters
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
