"use client";

import { useMemo, useState, useEffect, useRef } from "react";
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
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PipelineProduct, PipelineStatus, PipelineStage } from "@/lib/pipeline/types";

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
}

function formatDate(iso: string): string {
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

interface DataTableColumnHeaderProps<TData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
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
          <ChevronDown className="ml-2 h-4 w-4" />
        ) : column.getIsSorted() === "asc" ? (
          <ChevronUp className="ml-2 h-4 w-4" />
        ) : (
          <ChevronsUpDown className="ml-2 h-4 w-4" />
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
}: ProductTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "sku", desc: false }]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const showSources = currentStage === "scraped" || currentStage === "consolidated";
  const showConfidence = currentStage === "consolidated" || currentStage === "finalized";

  const columns = useMemo<ColumnDef<PipelineProduct>[]>(() => [
    {
      id: "select",
      header: ({ table }) => {
        const productsCount = table.getRowModel().rows.length;
        const selectedCount = productsCount > 0 && table.getRowModel().rows.every(r => selectedSkus.has(r.original.sku));
        const someSelected = productsCount > 0 && table.getRowModel().rows.some(r => selectedSkus.has(r.original.sku)) && !selectedCount;

        return (
          <Checkbox
            checked={selectedCount ? true : someSelected ? "indeterminate" : false}
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
        const visibleIndex = visibleRows.findIndex(r => r.id === row.id);
        
        return (
          <Checkbox
            checked={isChecked}
            onCheckedChange={() => {
              // Handle keyboard selection
              if (typeof window !== 'undefined' && !(window.event instanceof MouseEvent)) {
                onSelectSku(
                  row.original.sku,
                  !isChecked,
                  visibleIndex,
                  false,
                  visibleRows.map(r => r.original)
                );
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectSku(
                row.original.sku,
                !isChecked,
                visibleIndex,
                e.shiftKey,
                visibleRows.map(r => r.original)
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
      header: ({ column }) => <DataTableColumnHeader column={column} title="SKU" />,
      cell: ({ row }) => <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-tight">{row.getValue("sku")}</div>,
    },
    {
      id: "name",
      accessorFn: (p) => p.consolidated?.name ?? p.input?.name ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => {
        const product = row.original;
        const name = product.consolidated?.name || product.input?.name || "—";
        return (
          <div className="flex items-center gap-2 max-w-[300px]">
            <span className="truncate font-medium text-sm" title={name}>
              {name}
            </span>
            {product.error_message && (
              <span title={product.error_message} className="shrink-0 flex items-center justify-center">
                <AlertCircle className="h-3.5 w-3.5 text-destructive" />
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
        <DataTableColumnHeader column={column} title="Price" className="justify-end text-right" />
      ),
      cell: ({ row }) => {
        const price = row.getValue("price") as number;
        return (
          <div className="text-right font-medium">
            {price > 0 ? `$${price.toFixed(2)}` : "—"}
          </div>
        );
      },
    },
    ...(showSources ? [{
      id: "sources",
      accessorFn: (p: PipelineProduct) => getSourceCount(p.sources),
      header: ({ column }: { column: Column<PipelineProduct, unknown> }) => (
        <DataTableColumnHeader column={column} title="Sources" className="justify-center text-center" />
      ),
      cell: ({ row }: { row: Row<PipelineProduct> }) => {
        const count = row.getValue("sources") as number;
        return (
          <div className="flex justify-center">
            {count > 0 ? (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {count} source{count !== 1 ? "s" : ""}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
        );
      },
    }] : []),
    ...(showConfidence ? [{
      accessorKey: "confidence_score",
      header: ({ column }: { column: Column<PipelineProduct, unknown> }) => (
        <DataTableColumnHeader column={column} title="Confidence" className="justify-center text-center" />
      ),
      cell: ({ row }: { row: Row<PipelineProduct> }) => {
        const confidence = row.getValue("confidence_score") as number;
        if (confidence === undefined || confidence === null) return <div className="text-center text-xs text-muted-foreground">—</div>;
        
        return (
          <div className="flex justify-center">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0",
                confidence >= 0.8
                  ? "border-green-300 text-green-700 bg-green-50"
                  : confidence >= 0.5
                    ? "border-yellow-300 text-yellow-700 bg-yellow-50"
                    : "border-red-300 text-red-700 bg-red-50"
              )}
            >
              {Math.round(confidence * 100)}%
            </Badge>
          </div>
        );
      },
    }] : []),
    {
      accessorKey: "updated_at",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Updated" />,
      cell: ({ row }) => <div className="text-[10px] text-muted-foreground">{formatDate(row.getValue("updated_at"))}</div>,
    },
  ], [showSources, showConfidence, selectedSkus, onSelectSku, onSelectAll, onDeselectAll]);

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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA" ||
        activeElement?.getAttribute("contenteditable") === "true"
      ) {
        return;
      }

      const rows = table.getRowModel().rows;
      if (rows.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev === null ? 0 : Math.min(prev + 1, rows.length - 1);
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev === null ? 0 : Math.max(prev - 1, 0);
          return next;
        });
      } else if (e.key === " ") {
        if (focusedIndex !== null) {
          e.preventDefault();
          const row = rows[focusedIndex];
          if (row) {
            onSelectSku(
              row.original.sku,
              !selectedSkus.has(row.original.sku),
              focusedIndex,
              e.shiftKey,
              rows.map(r => r.original)
            );
          }
        }
      } else if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onSelectAll();
      } else if (e.key === "Escape") {
        setFocusedIndex(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedIndex, table, onSelectSku, onSelectAll, selectedSkus]);

  // Scroll focused row into view
  useEffect(() => {
    if (focusedIndex !== null && containerRef.current) {
      const rowElement = containerRef.current.querySelector(`[data-index="${focusedIndex}"]`);
      if (rowElement) {
        rowElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [focusedIndex]);

  return (
    <div className="h-full min-h-0 overflow-y-auto rounded-md border bg-white shadow-sm" ref={containerRef}>
      <Table>
        <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="bg-muted/30">
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row, index) => {
              const isSelected = selectedSkus.has(row.original.sku);
              const isFocused = focusedIndex === index;

              return (
                <TableRow
                  key={row.id}
                  data-index={index}
                  data-state={isSelected && "selected"}
                  className={cn(
                    "cursor-pointer transition-colors border-l-2 border-l-transparent",
                    isSelected ? "bg-primary/5 border-l-primary" : "hover:bg-muted/30",
                    isFocused && "ring-1 ring-inset ring-primary/30 bg-muted/20"
                  )}
                  onClick={(e) => {
                    setFocusedIndex(index);
                    onSelectSku(
                      row.original.sku,
                      !isSelected,
                      index,
                      e.shiftKey,
                      table.getRowModel().rows.map(r => r.original)
                    );
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-32 text-center text-muted-foreground"
              >
                No products in this stage.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
