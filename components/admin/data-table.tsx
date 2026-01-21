'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  searchable?: boolean;
  render?: (value: unknown, row: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T extends { id: string | number }> {
  data: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  pageSize?: number;
  pageSizeOptions?: number[];
  selectable?: boolean;
  onSelectionChange?: (selected: T[]) => void;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
  actions?: (row: T) => React.ReactNode;
}

type SortDirection = 'asc' | 'desc' | null;

interface SortState {
  key: string | null;
  direction: SortDirection;
}

export function DataTable<T extends { id: string | number }>({
  data,
  columns,
  searchPlaceholder = 'Search...',
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 20, 50, 100],
  selectable = false,
  onSelectionChange,
  onRowClick,
  loading = false,
  emptyMessage = 'No results found.',
  emptyAction,
  actions,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ key: null, direction: null });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());

  // Filter data by search
  const searchableKeys = columns.filter((c) => c.searchable !== false).map((c) => c.key);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;

    const lowerSearch = search.toLowerCase();
    return data.filter((row) =>
      searchableKeys.some((key) => {
        const value = getNestedValue(row, key);
        return String(value ?? '').toLowerCase().includes(lowerSearch);
      })
    );
  }, [data, search, searchableKeys]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sort.key || !sort.direction) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = getNestedValue(a, sort.key!);
      const bVal = getNestedValue(b, sort.key!);

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();

      if (sort.direction === 'asc') {
        return aStr.localeCompare(bStr);
      }
      return bStr.localeCompare(aStr);
    });
  }, [filteredData, sort]);

  // Paginate
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = page * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, page, pageSize]);

  // Selection handlers
  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === paginatedData.length) {
      setSelectedIds(new Set());
      onSelectionChange?.([]);
    } else {
      const newSelected = new Set(paginatedData.map((row) => row.id));
      setSelectedIds(newSelected);
      onSelectionChange?.(paginatedData);
    }
  }, [paginatedData, selectedIds.size, onSelectionChange]);

  const handleSelectRow = useCallback(
    (row: T) => {
      const newSelected = new Set(selectedIds);
      if (newSelected.has(row.id)) {
        newSelected.delete(row.id);
      } else {
        newSelected.add(row.id);
      }
      setSelectedIds(newSelected);
      onSelectionChange?.(data.filter((r) => newSelected.has(r.id)));
    },
    [selectedIds, data, onSelectionChange]
  );

  // Sort handler
  const handleSort = (key: string) => {
    setSort((prev) => {
      if (prev.key !== key) {
        return { key, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      return { key: null, direction: null };
    });
  };

  // Reset page when search changes
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const renderSortIcon = (column: Column<T>) => {
    if (!column.sortable) return null;

    if (sort.key !== column.key) {
      return <ChevronsUpDown className="ml-1 inline h-4 w-4 text-muted-foreground" />;
    }
    if (sort.direction === 'asc') {
      return <ChevronUp className="ml-1 inline h-4 w-4" />;
    }
    return <ChevronDown className="ml-1 inline h-4 w-4" />;
  };

  const allSelected = paginatedData.length > 0 && selectedIds.size === paginatedData.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < paginatedData.length;

  return (
    <div className="space-y-4">
      {/* Search and Page Size */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Show</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
            className="rounded-md border px-2 py-1 text-sm"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span className="text-sm text-muted-foreground">entries</span>
        </div>
      </div>

      {/* Selection info */}
      {selectable && selectedIds.size > 0 && (
        <div className="rounded-md bg-purple-50 px-4 py-2 text-sm text-purple-700">
          {selectedIds.size} row(s) selected
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {selectable && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected}
                    ref={(el) => {
                      if (el) {
                        (el as HTMLInputElement & { indeterminate: boolean }).indeterminate = someSelected;
                      }
                    }}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={column.className || ''}
                >
                  {column.sortable ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8 data-[state=open]:bg-accent"
                      onClick={() => handleSort(column.key)}
                    >
                      <span>{column.header}</span>
                      {renderSortIcon(column)}
                    </Button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              ))}
              {actions && <TableHead className="w-24">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)}
                  className="h-32 text-center"
                >
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : paginatedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)}
                  className="h-32 text-center"
                >
                  <p className="text-muted-foreground">{emptyMessage}</p>
                  {emptyAction && <div className="mt-4">{emptyAction}</div>}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((row) => (
                <TableRow
                  key={row.id}
                  className={onRowClick ? 'cursor-pointer' : ''}
                  onClick={() => onRowClick?.(row)}
                  data-state={selectedIds.has(row.id) ? 'selected' : undefined}
                >
                  {selectable && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        onCheckedChange={() => handleSelectRow(row)}
                        aria-label={`Select row ${row.id}`}
                      />
                    </TableCell>
                  )}
                  {columns.map((column) => {
                    const value = getNestedValue(row, column.key);
                    return (
                      <TableCell key={column.key} className={column.className}>
                        {column.render ? column.render(value, row) : String(value ?? '')}
                      </TableCell>
                    );
                  })}
                  {actions && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {actions(row)}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-sm text-muted-foreground">
          Showing {paginatedData.length > 0 ? page * pageSize + 1 : 0} to{' '}
          {Math.min((page + 1) * pageSize, sortedData.length)} of {sortedData.length} entries
          {search && ` (filtered from ${data.length} total)`}
        </p>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(0)}
            disabled={page === 0}
          >
            First
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="px-2 text-sm">
            Page {page + 1} of {Math.max(1, totalPages)}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(totalPages - 1)}
            disabled={page >= totalPages - 1}
          >
            Last
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Get a nested value from an object using dot notation.
 * e.g., getNestedValue({ a: { b: 1 } }, 'a.b') => 1
 */
function getNestedValue<T>(obj: T, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export { getNestedValue };
