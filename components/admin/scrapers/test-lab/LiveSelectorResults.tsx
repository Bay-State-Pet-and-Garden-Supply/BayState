/**
 * Live Selector Results Component
 *
 * Real-time selector validation display with filtering, sorting,
 * and expandable details for error messages and sample text.
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import {
    CheckCircle2,
    XCircle,
    AlertCircle,
    HelpCircle,
    ChevronDown,
    ChevronRight,
    Search,
    ArrowUpDown,
    AlertTriangle,
    Clock,
    Code2,
    AlignLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectorEvent {
    selector_name: string;
    selector_value: string;
    status: 'FOUND' | 'MISSING' | 'ERROR' | 'SKIPPED';
    duration_ms?: number;
    error_message?: string;
    sample_text?: string;
    timestamp: string;
}

export type SortField = 'status' | 'duration' | 'name';
export type SortDirection = 'asc' | 'desc';

export interface LiveSelectorResultsProps {
    selectorEvents: SelectorEvent[];
    onFilter?: (filterText: string) => void;
    onSort?: (field: SortField, direction: SortDirection) => void;
    maxItems?: number;
    className?: string;
}

const STATUS_PRIORITY: Record<SelectorEvent['status'], number> = {
    ERROR: 0,
    MISSING: 1,
    SKIPPED: 2,
    FOUND: 3,
};

const STATUS_CONFIG: Record<
    SelectorEvent['status'],
    {
        icon: React.ReactNode;
        badgeVariant: 'default' | 'destructive' | 'secondary' | 'outline';
        badgeClass: string;
        label: string;
    }
> = {
    FOUND: {
        icon: <CheckCircle2 className="h-4 w-4" />,
        badgeVariant: 'default',
        badgeClass: 'bg-green-100 text-green-800 border-green-300 hover:bg-green-100',
        label: 'Found',
    },
    MISSING: {
        icon: <XCircle className="h-4 w-4" />,
        badgeVariant: 'destructive',
        badgeClass: 'bg-red-100 text-red-800 border-red-300 hover:bg-red-100',
        label: 'Missing',
    },
    ERROR: {
        icon: <AlertCircle className="h-4 w-4" />,
        badgeVariant: 'destructive',
        badgeClass: 'bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-100',
        label: 'Error',
    },
    SKIPPED: {
        icon: <HelpCircle className="h-4 w-4" />,
        badgeVariant: 'secondary',
        badgeClass: 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-100',
        label: 'Skipped',
    },
};

export function LiveSelectorResults({
    selectorEvents,
    onFilter,
    onSort,
    maxItems = 100,
    className,
}: LiveSelectorResultsProps) {
    const [filterText, setFilterText] = useState('');
    const [sortField, setSortField] = useState<SortField>('status');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    // Handle filter change
    const handleFilterChange = useCallback(
        (value: string) => {
            setFilterText(value);
            onFilter?.(value);
        },
        [onFilter]
    );

    // Handle sort toggle
    const handleSort = useCallback(
        (field: SortField) => {
            const newDirection: SortDirection =
                sortField === field && sortDirection === 'asc' ? 'desc' : 'asc';
            setSortField(field);
            setSortDirection(newDirection);
            onSort?.(field, newDirection);
        },
        [sortField, sortDirection, onSort]
    );

    // Toggle row expansion
    const toggleRowExpansion = useCallback((selectorName: string) => {
        setExpandedRows((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(selectorName)) {
                newSet.delete(selectorName);
            } else {
                newSet.add(selectorName);
            }
            return newSet;
        });
    }, []);

    // Filter and sort events
    const processedEvents = useMemo(() => {
        let filtered = selectorEvents;

        // Apply filter
        if (filterText.trim()) {
            const lowerFilter = filterText.toLowerCase();
            filtered = filtered.filter(
                (event) =>
                    event.selector_name.toLowerCase().includes(lowerFilter) ||
                    event.selector_value.toLowerCase().includes(lowerFilter)
            );
        }

        // Apply sort
        const sorted = [...filtered].sort((a, b) => {
            let comparison = 0;

            switch (sortField) {
                case 'status':
                    comparison = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
                    break;
                case 'duration':
                    const durationA = a.duration_ms ?? Infinity;
                    const durationB = b.duration_ms ?? Infinity;
                    comparison = durationA - durationB;
                    break;
                case 'name':
                    comparison = a.selector_name.localeCompare(b.selector_name);
                    break;
            }

            return sortDirection === 'asc' ? comparison : -comparison;
        });

        // Limit to max items
        return sorted.slice(0, maxItems);
    }, [selectorEvents, filterText, sortField, sortDirection, maxItems]);

    // Stats
    const stats = useMemo(() => {
        const total = selectorEvents.length;
        const found = selectorEvents.filter((e) => e.status === 'FOUND').length;
        const missing = selectorEvents.filter((e) => e.status === 'MISSING').length;
        const error = selectorEvents.filter((e) => e.status === 'ERROR').length;
        const skipped = selectorEvents.filter((e) => e.status === 'SKIPPED').length;

        return { total, found, missing, error, skipped };
    }, [selectorEvents]);

    // Check if row is expandable (has error message or sample text)
    const isExpandable = useCallback((event: SelectorEvent) => {
        return !!(event.error_message || event.sample_text);
    }, []);

    return (
        <div className={cn('space-y-4', className)}>
            {/* Header with stats */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">Selector Results</h3>
                    <Badge variant="outline" className="font-mono">
                        {stats.total}
                    </Badge>
                </div>

                {/* Status summary */}
                <div className="flex items-center gap-2 text-sm">
                    {stats.found > 0 && (
                        <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="h-3 w-3" />
                            {stats.found}
                        </span>
                    )}
                    {stats.missing > 0 && (
                        <span className="flex items-center gap-1 text-red-600">
                            <XCircle className="h-3 w-3" />
                            {stats.missing}
                        </span>
                    )}
                    {stats.error > 0 && (
                        <span className="flex items-center gap-1 text-orange-600">
                            <AlertTriangle className="h-3 w-3" />
                            {stats.error}
                        </span>
                    )}
                    {stats.skipped > 0 && (
                        <span className="flex items-center gap-1 text-gray-500">
                            <HelpCircle className="h-3 w-3" />
                            {stats.skipped}
                        </span>
                    )}
                </div>
            </div>

            {/* Filter input */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    placeholder="Filter by selector name or value..."
                    value={filterText}
                    onChange={(e) => handleFilterChange(e.target.value)}
                    className="pl-9"
                />
            </div>

            {/* Sort controls */}
            <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Sort by:</span>
                <Button
                    variant={sortField === 'status' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleSort('status')}
                    className="h-8"
                >
                    Status
                    {sortField === 'status' && (
                        <ArrowUpDown
                            className={cn(
                                'ml-1 h-3 w-3 transition-transform',
                                sortDirection === 'desc' && 'rotate-180'
                            )}
                        />
                    )}
                </Button>
                <Button
                    variant={sortField === 'duration' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleSort('duration')}
                    className="h-8"
                >
                    Duration
                    {sortField === 'duration' && (
                        <ArrowUpDown
                            className={cn(
                                'ml-1 h-3 w-3 transition-transform',
                                sortDirection === 'desc' && 'rotate-180'
                            )}
                        />
                    )}
                </Button>
                <Button
                    variant={sortField === 'name' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleSort('name')}
                    className="h-8"
                >
                    Name
                    {sortField === 'name' && (
                        <ArrowUpDown
                            className={cn(
                                'ml-1 h-3 w-3 transition-transform',
                                sortDirection === 'desc' && 'rotate-180'
                            )}
                        />
                    )}
                </Button>
            </div>

            {/* Results table */}
            {processedEvents.length > 0 ? (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-8"></TableHead>
                                <TableHead>Selector Name</TableHead>
                                <TableHead className="hidden md:table-cell">Value</TableHead>
                                <TableHead className="w-24">Status</TableHead>
                                <TableHead className="w-24 text-right">Duration</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {processedEvents.map((event) => {
                                const config = STATUS_CONFIG[event.status];
                                const isExpanded = expandedRows.has(event.selector_name);
                                const expandable = isExpandable(event);

                                return (
                                    <Collapsible
                                        key={event.selector_name}
                                        open={isExpanded}
                                        onOpenChange={() =>
                                            expandable && toggleRowExpansion(event.selector_name)
                                        }
                                        asChild
                                    >
                                        <>
                                            <TableRow
                                                className={cn(
                                                    'cursor-default',
                                                    expandable && 'cursor-pointer hover:bg-muted/50'
                                                )}
                                                onClick={() =>
                                                    expandable && toggleRowExpansion(event.selector_name)
                                                }
                                            >
                                                <TableCell className="p-2">
                                                    {expandable ? (
                                                        <CollapsibleTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-6 w-6 p-0"
                                                            >
                                                                {isExpanded ? (
                                                                    <ChevronDown className="h-4 w-4" />
                                                                ) : (
                                                                    <ChevronRight className="h-4 w-4" />
                                                                )}
                                                            </Button>
                                                        </CollapsibleTrigger>
                                                    ) : (
                                                        <span className="inline-block w-6" />
                                                    )}
                                                </TableCell>
                                                <TableCell className="font-mono text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className={cn(
                                                                'text-muted-foreground',
                                                                event.status === 'FOUND' &&
                                                                    'text-green-600',
                                                                event.status === 'MISSING' &&
                                                                    'text-red-600',
                                                                event.status === 'ERROR' &&
                                                                    'text-orange-600',
                                                                event.status === 'SKIPPED' &&
                                                                    'text-gray-500'
                                                            )}
                                                        >
                                                            {config.icon}
                                                        </span>
                                                        {event.selector_name}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden md:table-cell">
                                                    <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs">
                                                        {event.selector_value.length > 50
                                                            ? `${event.selector_value.slice(0, 50)}...`
                                                            : event.selector_value}
                                                    </code>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant={config.badgeVariant}
                                                        className={cn(
                                                            'text-xs font-medium',
                                                            config.badgeClass
                                                        )}
                                                    >
                                                        {config.label}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {event.duration_ms ? (
                                                        <span className="flex items-center justify-end gap-1 text-sm text-muted-foreground">
                                                            <Clock className="h-3 w-3" />
                                                            {event.duration_ms}ms
                                                        </span>
                                                    ) : (
                                                        <span className="text-sm text-muted-foreground">
                                                            —
                                                        </span>
                                                    )}
                                                </TableCell>
                                            </TableRow>

                                            {/* Expandable details */}
                                            {expandable && (
                                                <CollapsibleContent asChild>
                                                    <TableRow className="bg-muted/30">
                                                        <TableCell colSpan={5} className="p-0">
                                                            <div className="space-y-3 p-4">
                                                                {event.error_message && (
                                                                    <div className="space-y-1">
                                                                        <div className="flex items-center gap-2 text-sm font-medium text-red-600">
                                                                            <AlertCircle className="h-4 w-4" />
                                                                            Error Message
                                                                        </div>
                                                                        <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                                                                            {event.error_message}
                                                                        </p>
                                                                    </div>
                                                                )}
                                                                {event.sample_text && (
                                                                    <div className="space-y-1">
                                                                        <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                                                                            <AlignLeft className="h-4 w-4" />
                                                                            Sample Text Found
                                                                        </div>
                                                                        <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">
                                                                            {event.sample_text}
                                                                        </p>
                                                                    </div>
                                                                )}
                                                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                                    <span className="flex items-center gap-1">
                                                                        <Code2 className="h-3 w-3" />
                                                                        Full selector:{' '}
                                                                        <code className="font-mono">
                                                                            {event.selector_value}
                                                                        </code>
                                                                    </span>
                                                                    <span className="flex items-center gap-1">
                                                                        <Clock className="h-3 w-3" />
                                                                        {new Date(
                                                                            event.timestamp
                                                                        ).toLocaleTimeString()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                </CollapsibleContent>
                                            )}
                                        </>
                                    </Collapsible>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            ) : (
                <div className="rounded-md border border-dashed p-8 text-center">
                    {filterText ? (
                        <>
                            <Search className="mx-auto h-8 w-8 text-muted-foreground/50" />
                            <p className="mt-2 text-sm text-muted-foreground">
                                No selectors match your filter
                            </p>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleFilterChange('')}
                                className="mt-2"
                            >
                                Clear filter
                            </Button>
                        </>
                    ) : (
                        <>
                            <HelpCircle className="mx-auto h-8 w-8 text-muted-foreground/50" />
                            <p className="mt-2 text-sm text-muted-foreground">
                                No selector validation events yet
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Results will appear here as selectors are validated
                            </p>
                        </>
                    )}
                </div>
            )}

            {/* Max items warning */}
            {selectorEvents.length > maxItems && (
                <div className="flex items-center gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertTriangle className="h-4 w-4" />
                    <span>
                        Showing {maxItems} of {selectorEvents.length} selectors. Refine your
                        filter to see more.
                    </span>
                </div>
            )}
        </div>
    );
}
