"use client";

import { useMemo, useState } from "react";
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
import type { PipelineProduct, PipelineStatus } from "@/lib/pipeline/types";
import { STAGE_CONFIG } from "@/lib/pipeline/types";

const DEFAULT_STAGE_CONFIG = {
  label: "Unknown",
  color: "#6B7280",
  description: "Unknown pipeline stage",
};

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
  currentStage: PipelineStatus;
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

export function ProductTable({
  products,
  selectedSkus,
  onSelectSku,
  onSelectAll,
  onDeselectAll,
  currentStage,
}: ProductTableProps) {
  const allSelected =
    products.length > 0 && products.every((p) => selectedSkus.has(p.sku));
  const someSelected =
    products.some((p) => selectedSkus.has(p.sku)) && !allSelected;

  const [sortField, setSortField] = useState<
    "sku" | "name" | "price" | "sources" | "confidence" | "updated"
  >("sku");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const sortedProducts = useMemo(() => {
    const result = [...products];

    const valueFor = (
      product: PipelineProduct,
      field: string,
    ): string | number => {
      switch (field) {
        case "sku":
          return product.sku;
        case "name":
          return product.consolidated?.name ?? product.input?.name ?? "";
        case "price":
          return product.consolidated?.price ?? product.input?.price ?? 0;
        case "sources":
          return getSourceCount(product.sources);
        case "confidence":
          return product.confidence_score ?? 0;
        case "updated":
          return new Date(product.updated_at).getTime();
        default:
          return "";
      }
    };

    result.sort((a, b) => {
      const aValue = valueFor(a, sortField);
      const bValue = valueFor(b, sortField);

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
      }

      const aString = String(aValue).toLowerCase();
      const bString = String(bValue).toLowerCase();

      if (aString < bString) return sortDirection === "asc" ? -1 : 1;
      if (aString > bString) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [products, sortField, sortDirection]);

  const handleHeaderCheckbox = () => {
    if (allSelected || someSelected) {
      onDeselectAll();
    } else {
      onSelectAll();
    }
  };

  const showSources =
    currentStage === "scraped" || currentStage === "consolidated";
  const showConfidence =
    currentStage === "consolidated" || currentStage === "finalized";

  return (
    <div className="h-full min-h-0 overflow-y-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="w-10">
              <Checkbox
                checked={
                  allSelected ? true : someSelected ? "indeterminate" : false
                }
                onCheckedChange={handleHeaderCheckbox}
                aria-label="Select all products"
              />
            </TableHead>
            <TableHead className="w-36">
              <button
                className="flex items-center gap-1"
                onClick={() => {
                  const next =
                    sortField === "sku" && sortDirection === "asc"
                      ? "desc"
                      : "asc";
                  setSortField("sku");
                  setSortDirection(next);
                }}
              >
                SKU
                {sortField === "sku"
                  ? sortDirection === "asc"
                    ? "▲"
                    : "▼"
                  : ""}
              </button>
            </TableHead>
            <TableHead>
              <button
                className="flex items-center gap-1"
                onClick={() => {
                  const next =
                    sortField === "name" && sortDirection === "asc"
                      ? "desc"
                      : "asc";
                  setSortField("name");
                  setSortDirection(next);
                }}
              >
                Name
                {sortField === "name"
                  ? sortDirection === "asc"
                    ? "▲"
                    : "▼"
                  : ""}
              </button>
            </TableHead>
            <TableHead className="w-24 text-right">
              <button
                className="flex items-center gap-1 justify-end"
                onClick={() => {
                  const next =
                    sortField === "price" && sortDirection === "asc"
                      ? "desc"
                      : "asc";
                  setSortField("price");
                  setSortDirection(next);
                }}
              >
                Price
                {sortField === "price"
                  ? sortDirection === "asc"
                    ? "▲"
                    : "▼"
                  : ""}
              </button>
            </TableHead>
            {showSources && (
              <TableHead className="w-28 text-center">
                <button
                  className="flex items-center gap-1 justify-center"
                  onClick={() => {
                    const next =
                      sortField === "sources" && sortDirection === "asc"
                        ? "desc"
                        : "asc";
                    setSortField("sources");
                    setSortDirection(next);
                  }}
                >
                  Sources
                  {sortField === "sources"
                    ? sortDirection === "asc"
                      ? "▲"
                      : "▼"
                    : ""}
                </button>
              </TableHead>
            )}
            {showConfidence && (
              <TableHead className="w-28 text-center">
                <button
                  className="flex items-center gap-1 justify-center"
                  onClick={() => {
                    const next =
                      sortField === "confidence" && sortDirection === "asc"
                        ? "desc"
                        : "asc";
                    setSortField("confidence");
                    setSortDirection(next);
                  }}
                >
                  Confidence
                  {sortField === "confidence"
                    ? sortDirection === "asc"
                      ? "▲"
                      : "▼"
                    : ""}
                </button>
              </TableHead>
            )}
            <TableHead className="w-36">
              <button
                className="flex items-center gap-1"
                onClick={() => {
                  const next =
                    sortField === "updated" && sortDirection === "asc"
                      ? "desc"
                      : "asc";
                  setSortField("updated");
                  setSortDirection(next);
                }}
              >
                Updated
                {sortField === "updated"
                  ? sortDirection === "asc"
                    ? "▲"
                    : "▼"
                  : ""}
              </button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedProducts.map((product, index) => {
            const isSelected = selectedSkus.has(product.sku);
            const displayName =
              product.consolidated?.name || product.input?.name || "—";
            const displayPrice =
              product.consolidated?.price ?? product.input?.price;
            const sourceCount = getSourceCount(product.sources);
            const confidence = product.confidence_score;

            return (
              <TableRow
                key={product.sku}
                className={`cursor-pointer transition-colors ${isSelected ? "bg-[#008850]/5" : "hover:bg-muted/30"}`}
                onClick={(e) =>
                  onSelectSku(
                    product.sku,
                    !isSelected,
                    index,
                    e.shiftKey,
                    sortedProducts,
                  )
                }
              >
                <TableCell
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSku(
                      product.sku,
                      !isSelected,
                      index,
                      e.shiftKey,
                      sortedProducts,
                    );
                  }}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) =>
                      onSelectSku(
                        product.sku,
                        !!checked,
                        index,
                        false,
                        sortedProducts,
                      )
                    }
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${product.sku}`}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {product.sku}
                </TableCell>
                <TableCell
                  className="max-w-xs truncate font-medium text-sm"
                  title={displayName}
                >
                  {displayName}
                  {product.error_message && (
                    <span
                      className="ml-2 text-xs text-red-500"
                      title={product.error_message}
                    >
                      ⚠
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {displayPrice !== undefined
                    ? `$${displayPrice.toFixed(2)}`
                    : "—"}
                </TableCell>
                {showSources && (
                  <TableCell className="text-center">
                    {sourceCount > 0 ? (
                      <Badge variant="secondary" className="text-xs">
                        {sourceCount} source{sourceCount !== 1 ? "s" : ""}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                {showConfidence && (
                  <TableCell className="text-center">
                    {confidence !== undefined ? (
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          confidence >= 0.8
                            ? "border-green-300 text-green-700"
                            : confidence >= 0.5
                              ? "border-yellow-300 text-yellow-700"
                              : "border-red-300 text-red-700"
                        }`}
                      >
                        {Math.round(confidence * 100)}%
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(product.updated_at)}
                </TableCell>
              </TableRow>
            );
          })}
          {products.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={5 + (showSources ? 1 : 0) + (showConfidence ? 1 : 0)}
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
