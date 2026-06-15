"use client";

import { useEffect, useState } from 'react';
import { Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface PipelineFiltersState {
  source?: string;
  product_line?: string;
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
    const id = window.setTimeout(() => setLocalFilters(filters), 0);
    return () => window.clearTimeout(id);
  }, [filters]);

  const handleApply = () => {
    onFilterChange({
      source: localFilters.source || undefined,
      product_line: localFilters.product_line?.trim() || undefined,
    });
    setIsOpen(false);
  };

  const handleClear = () => {
    const cleared: PipelineFiltersState = {};
    setLocalFilters(cleared);
    onFilterChange(cleared);
    setIsOpen(false);
  };

  const activeFilterCount = [filters.source, filters.product_line].filter(Boolean).length;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'gap-2 border-border bg-card',
            activeFilterCount > 0 && 'border-primary/20 bg-primary/10 text-primary',
            className,
          )}
          aria-label="Open pipeline filters"
        >
          <Filter className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 ? (
            <Badge variant="outline" className="min-w-[1.5rem] justify-center px-1.5 py-0.5 text-[11px]">
              {activeFilterCount}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="start">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-foreground">Filter pipeline results</h4>
              <p className="text-xs leading-5 text-muted-foreground">
                Narrow the current stage by source or product line.
              </p>
            </div>
            {activeFilterCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleClear}
              >
                Clear all
              </Button>
            ) : null}
          </div>

          {showSourceFilter ? (
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Select
                value={localFilters.source || 'all'}
                onValueChange={(value) =>
                  setLocalFilters((prev) => ({
                    ...prev,
                    source: value === 'all' ? undefined : value,
                  }))
                }
              >
                <SelectTrigger id="source">
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  {availableSources.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="product_line">Product line</Label>
            <Input
              id="product_line"
              type="search"
              autoComplete="off"
              placeholder="e.g. Bentley Seeds"
              value={localFilters.product_line || ''}
              onChange={(event) =>
                setLocalFilters((prev) => ({
                  ...prev,
                  product_line: event.target.value || undefined,
                }))
              }
            />
          </div>


          <Button className="w-full" onClick={handleApply}>
            Apply filters
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
