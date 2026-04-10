'use client';

import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export interface PipelineFiltersState {
    startDate?: Date;
    endDate?: Date;
    source?: string;
    product_line?: string;
    cohort_id?: string;
    minConfidence?: number;
    maxConfidence?: number;
}

interface PipelineFiltersProps {
    filters: PipelineFiltersState;
    onFilterChange: (filters: PipelineFiltersState) => void;
    availableSources?: string[];
    className?: string;
}

export function PipelineFilters({ filters, onFilterChange, availableSources = [], className }: PipelineFiltersProps) {
    const [localFilters, setLocalFilters] = useState<PipelineFiltersState>(filters);
    const [isOpen, setIsOpen] = useState(false);

    // Sync local state when props change
    useEffect(() => {
        setLocalFilters(filters);
    }, [filters]);

    const handleApply = () => {
        onFilterChange(localFilters);
        setIsOpen(false);
    };

    const handleClear = () => {
        const cleared = {};
        setLocalFilters(cleared);
        onFilterChange(cleared);
        setIsOpen(false);
    };

    const activeFilterCount = [
        filters.startDate,
        filters.endDate,
        filters.source,
        filters.product_line,
        filters.cohort_id,
        filters.minConfidence !== undefined || filters.maxConfidence !== undefined
    ].filter(Boolean).length;

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        "gap-2 border-dashed",
                        activeFilterCount > 0 && "bg-blue-50 border-blue-200 text-blue-700",
                        className
                    )}
                >
                    <Filter className="h-4 w-4" />
                    Filters
                    {activeFilterCount > 0 && (
                        <Badge variant="secondary" className="ml-1 h-5 px-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200">
                            {activeFilterCount}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="start">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="font-medium leading-none">Filter Products</h4>
                        {activeFilterCount > 0 && (
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-auto p-0 text-xs text-muted-foreground hover:text-primary"
                                onClick={handleClear}
                            >
                                Clear all
                            </Button>
                        )}
                    </div>
                    
                    <div className="space-y-2">
                        <Label>Date Range (Updated)</Label>
                        <div className="grid gap-2">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !localFilters.startDate && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {localFilters.startDate ? (
                                            localFilters.endDate ? (
                                                <>
                                                    {format(localFilters.startDate, "LLL dd, y")} -{" "}
                                                    {format(localFilters.endDate, "LLL dd, y")}
                                                </>
                                            ) : (
                                                format(localFilters.startDate, "LLL dd, y")
                                            )
                                        ) : (
                                            <span>Pick a date range</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        defaultMonth={localFilters.startDate}
                                        selected={{
                                            from: localFilters.startDate,
                                            to: localFilters.endDate,
                                        }}
                                        onSelect={(range) => {
                                            setLocalFilters(prev => ({
                                                ...prev,
                                                startDate: range?.from,
                                                endDate: range?.to
                                            }));
                                        }}
                                        numberOfMonths={2}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="source">Source</Label>
                        <Select 
                            value={localFilters.source || "all"} 
                            onValueChange={(value) => setLocalFilters(prev => ({ 
                                ...prev, 
                                source: value === "all" ? undefined : value 
                            }))}
                        >
                            <SelectTrigger id="source">
                                <SelectValue placeholder="All Sources" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Sources</SelectItem>
                                {availableSources.map((source) => (
                                    <SelectItem key={source} value={source}>
                                        {source}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="product_line">Product Line</Label>
                        <Input
                            id="product_line"
                            type="search"
                            autoComplete="off"
                            placeholder="e.g. upc-prefix-123"
                            value={localFilters.product_line || ''}
                            onChange={(e) => setLocalFilters(prev => ({ ...prev, product_line: e.target.value || undefined }))}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="cohort_id">Cohort ID</Label>
                        <Input
                            id="cohort_id"
                            type="search"
                            autoComplete="off"
                            placeholder="e.g. bsr-cohort-123"
                            value={localFilters.cohort_id || ''}
                            onChange={(e) => setLocalFilters(prev => ({ ...prev, cohort_id: e.target.value || undefined }))}
                        />
                    </div>

                    <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-between">
                            <Label>Confidence Score</Label>
                            <span className="text-xs text-muted-foreground">
                                {(localFilters.minConfidence ?? 0).toFixed(1)} - {(localFilters.maxConfidence ?? 1).toFixed(1)}
                            </span>
                        </div>
                        <Slider
                            defaultValue={[0, 1]}
                            value={[localFilters.minConfidence ?? 0, localFilters.maxConfidence ?? 1]}
                            min={0}
                            max={1}
                            step={0.1}
                            onValueChange={(value) => {
                                setLocalFilters(prev => ({
                                    ...prev,
                                    minConfidence: value[0],
                                    maxConfidence: value[1]
                                }));
                            }}
                        />
                    </div>

                    <div className="pt-2">
                        <Button className="w-full" onClick={handleApply}>
                            Apply Filters
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
