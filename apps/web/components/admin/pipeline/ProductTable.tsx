"use client";

import { useMemo, useState, useRef, useCallback } from "react";
import {
  Column,
  ColumnDef,
  Row,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PipelineProduct, PipelineStage } from "@/lib/pipeline/types";
import { type PipelineFiltersState } from "./PipelineFilters";

interface ProductTableProps {
  products: PipelineProduct[];
  selectedSkus: Set<string>;
  onSelectSku: (
    sku: string,
    selected: boolean,
    index?: number,
    isShiftClick?: boolean,
    visibleProducts?: PipelineProduct[],
  ) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  currentStage: PipelineStage;
  search?: string;
  onSearchChange?: (value: string) => void;
  filters?: PipelineFiltersState;
  onFilterChange?: (filters: PipelineFiltersState) => void;
  availableSources?: string[];
  totalCount?: number;
  onSelectAllTotal?: () => void | Promise<void>;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

function getSourceCount(
  sources: Record<string, unknown> | null | undefined,
): number {
  if (!sources || typeof sources !== "object") return 0;
  return Object.keys(sources).length;
}

interface DataTableColumnHeaderProps<
  TData,
  TValue,
> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
}

function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 data-[state=open]:bg-accent"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        <span>{title}</span>
        {column.getIsSorted() === "desc" ? (
          <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" />
        ) : column.getIsSorted() === "asc" ? (
          <ChevronUp className="ml-2 h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronsUpDown className="ml-2 h-4 w-4" aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}

export function ProductTable({
  products,
  selectedSkus,
  onSelectSku,
  onSelectAll,
  onDeselectAll,
  currentStage,
  search,
  onSearchChange,
  filters,
  onFilterChange,
  availableSources,
  totalCount,
  onSelectAllTotal,
}: ProductTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "sku", desc: false },
  ]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const showSources = currentStage === "scraped";
  const showConfidence = currentStage === "finalizing";

  const columns = useMemo<ColumnDef<PipelineProduct>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => {
          const productsCount = table.getRowModel().rows.length;
          const selectedCount =
            productsCount > 0 &&
            table
              .getRowModel()
              .rows.every((r) => selectedSkus.has(r.original.sku));
          const someSelected =
            productsCount > 0 &&
            table
              .getRowModel()
              .rows.some((r) => selectedSkus.has(r.original.sku)) &&
            !selectedCount;

          return (
            <Checkbox
              checked={
                selectedCount ? true : someSelected ? "indeterminate" : false
              }
              onCheckedChange={() => {
                if (selectedCount || someSelected) {
                  onDeselectAll();
                } else {
                  onSelectAll();
                }
              }}
              aria-label="Select all"
              className="translate-y-[2px]"
            />
          );
        },
        cell: ({ row, table }) => {
          const isChecked = selectedSkus.has(row.original.sku);
          const visibleRows = table.getRowModel().rows;
          const visibleIndex = row.index;

          return (
            <Checkbox
              checked={isChecked}
              onCheckedChange={() => {
                // For direct checkbox interaction, we still want to support the same logic
                // Keyboard focus will trigger separate events
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectSku(
                  row.original.sku,
                  !isChecked,
                  visibleIndex,
                  e.shiftKey,
                  visibleRows.map((r) => r.original),
                );
              }}
              aria-label="Select row"
              className="translate-y-[2px]"
            />
          );
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "sku",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="SKU" />
        ),
        cell: ({ row }) => (
          <div 
            className="font-mono text-[10px] text-zinc-950 font-black uppercase tracking-tight tabular-nums"
            role="gridcell"
            aria-label={String(row.getValue("sku"))}
          >
            {row.getValue("sku")}
          </div>
        ),
      },
      {
        id: "name",
        accessorFn: (p) => p.consolidated?.name ?? p.input?.name ?? "",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => {
          const product = row.original;
          const name = product.consolidated?.name || product.input?.name || "—";
          return (
            <div className="flex items-center gap-2 max-w-[300px]">
              <span
                className="truncate font-black uppercase tracking-tight text-xs text-zinc-950"
                title={name}
              >
                {name}
              </span>
              {product.error_message && (
                <span
                  title={product.error_message}
                  className="shrink-0 flex items-center justify-center"
                >
                  <AlertCircle className="h-3.5 w-3.5 text-brand-burgundy" aria-hidden="true" />
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "price",
        accessorFn: (p) => p.consolidated?.price ?? p.input?.price ?? 0,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Price"
            className="justify-end text-right"
          />
        ),
        cell: ({ row }) => {
          const price = row.getValue("price") as number;
          return (
            <div className="text-right font-black text-zinc-950 text-xs tabular-nums">
              {price > 0 ? `$${price.toFixed(2)}` : "—"}
            </div>
          );
        },
      },
      ...(showSources
        ? [
            {
              id: "sources",
              accessorFn: (p: PipelineProduct) => getSourceCount(p.sources),
              header: ({
                column,
              }: {
                column: Column<PipelineProduct, unknown>;
              }) => (
                <DataTableColumnHeader
                  column={column}
                  title="Sources"
                  className="justify-center text-center"
                />
              ),
              cell: ({ row }: { row: Row<PipelineProduct> }) => {
                const count = row.getValue("sources") as number;
                return (
                  <div className="flex justify-center">
                    {count > 0 ? (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 rounded-none border border-zinc-950 bg-zinc-100 text-zinc-950 font-black uppercase tabular-nums"
                      >
                        {count} source{count !== 1 ? "s" : ""}
                      </Badge>
                    ) : (
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                        —
                      </span>
                    )}
                  </div>
                );
              },
            },
          ]
        : []),
      ...(showConfidence
        ? [
            {
              accessorKey: "confidence_score",
              header: ({
                column,
              }: {
                column: Column<PipelineProduct, unknown>;
              }) => (
                <DataTableColumnHeader
                  column={column}
                  title="Confidence"
                  className="justify-center text-center"
                />
              ),
              cell: ({ row }: { row: Row<PipelineProduct> }) => {
                const confidence = row.getValue("confidence_score") as number;
                if (confidence === undefined || confidence === null)
                  return (
                    <div className="text-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                      —
                    </div>
                  );

                return (
                  <div className="flex justify-center">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5 py-0 rounded-none border font-black uppercase tabular-nums",
                        confidence >= 0.8
                          ? "border-brand-forest-green text-brand-forest-green bg-brand-forest-green/10"
                          : confidence >= 0.5
                            ? "border-brand-gold text-brand-burgundy bg-brand-gold/10"
                            : "border-brand-burgundy text-brand-burgundy bg-brand-burgundy/10",
                      )}
                    >
                      {Math.round(confidence * 100)}%
                    </Badge>
                  </div>
                );
              },
            },
          ]
        : []),
      {
        accessorKey: "updated_at",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Updated" />
        ),
        cell: ({ row }) => (
          <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight text-right tabular-nums">
            {formatDate(row.getValue("updated_at"))}
          </div>
        ),
      },
    ],
    [
      showSources,
      showConfidence,
      selectedSkus,
      onSelectSku,
      onSelectAll,
      onDeselectAll,
    ],
  );

  const table = useReactTable({
    data: products,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();

  // Virtualization setup
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 32, // approx height of a row
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const paddingTop = virtualRows.length > 0 ? virtualRows?.[0]?.start || 0 : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - (virtualRows?.[virtualRows.length - 1]?.end || 0)
      : 0;

  // Keyboard navigation handler (attached to container)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (rows.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev === null ? 0 : Math.min(prev + 1, rows.length - 1);
          rowVirtualizer.scrollToIndex(next, { align: "center" });
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev === null ? 0 : Math.max(prev - 1, 0);
          rowVirtualizer.scrollToIndex(next, { align: "center" });
          return next;
        });
      } else if (e.key === " ") {
        if (focusedIndex !== null) {
          e.preventDefault();
          const row = rows[focusedIndex];
          if (row) {
            const isChecked = selectedSkus.has(row.original.sku);
            onSelectSku(
              row.original.sku,
              !isChecked,
              focusedIndex,
              e.shiftKey,
              rows.map((r) => r.original),
            );
          }
        }
      } else if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onSelectAll();
      } else if (e.key === "Escape") {
        setFocusedIndex(null);
        containerRef.current?.blur();
      }
    },
    [
      rows,
      focusedIndex,
      rowVirtualizer,
      selectedSkus,
      onSelectSku,
      onSelectAll,
    ],
  );

  return (
    <div
      className="max-h-[600px] min-h-0 overflow-auto rounded-none outline-none focus-within:ring-1 focus-within:ring-zinc-950 p-1 pr-8 pb-8 [&_[data-slot=table-container]]:overflow-visible"
      ref={containerRef}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="grid"
      aria-multiselectable="true"
      aria-rowcount={rows.length}
    >
      <Table className="table-fixed border-separate border-spacing-0">
        <TableHeader className="sticky top-0 bg-zinc-50 z-20 shadow-[0_1px_0_0_rgba(0,0,0,1)]">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="hover:bg-transparent border-b-0"
            >
              {headerGroup.headers.map((header) => {
                // Define fixed widths for columns to ensure alignment across multiple tables
                let widthClass = "";
                if (header.id === "select") widthClass = "w-[40px]";
                else if (header.id === "sku") widthClass = "w-[120px]";
                else if (header.id === "name") widthClass = "min-w-0 flex-1";
                else if (header.id === "price") widthClass = "w-[100px]";
                else if (
                  header.id === "sources" ||
                  header.id === "confidence_score"
                )
                  widthClass = "w-[120px]";
                else if (header.id === "updated_at") widthClass = "w-[150px]";

                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "h-8 py-0 font-black uppercase tracking-tighter text-zinc-950 bg-inherit",
                      widthClass,
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {paddingTop > 0 && (
            <TableRow className="hover:bg-transparent border-0">
              <TableCell
                style={{ height: `${paddingTop}px` }}
                colSpan={columns.length}
                className="p-0 border-0"
              />
            </TableRow>
          )}
          {virtualRows.length > 0 ? (
            virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              const index = virtualRow.index;
              const isSelected = selectedSkus.has(row.original.sku);
              const isFocused = focusedIndex === index;

              return (
                <TableRow
                  key={row.id}
                  data-index={index}
                  data-state={isSelected && "selected"}
                  className={cn(
                    "cursor-pointer transition-colors border-b border-zinc-200 h-8",
                    isSelected
                      ? "bg-brand-forest-green/10"
                      : "hover:bg-zinc-50",
                    isFocused && "ring-2 ring-inset ring-zinc-950 bg-zinc-100",
                  )}
                  onClick={(e) => {
                    setFocusedIndex(index);
                    onSelectSku(
                      row.original.sku,
                      !isSelected,
                      index,
                      e.shiftKey,
                      rows.map((r) => r.original),
                    );
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "py-1",
                        cell.column.id === "name" ? "max-w-0" : "",
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-16 text-center font-bold uppercase tracking-widest text-zinc-400"
              >
                No products in this step.
              </TableCell>
            </TableRow>
          ) : null}
          {paddingBottom > 0 && (
            <TableRow className="hover:bg-transparent border-0">
              <TableCell
                style={{ height: `${paddingBottom}px` }}
                colSpan={columns.length}
                className="p-0 border-0"
              />
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
