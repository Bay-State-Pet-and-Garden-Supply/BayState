"use client";

import { useMemo, useCallback, useState } from "react";
import {
  Package,
  ExternalLink,
  Trash2,
  Image as ImageIcon,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { PipelineProduct } from "@/lib/pipeline/types";
import type { Brand } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { PipelineFilters } from "./PipelineFilters";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import { PipelineSearchField } from "./PipelineSearchField";
import { PipelineSidebarTable } from "./PipelineSidebarTable";
import { adminFetch } from '@/lib/admin/api-client';
import type { NormalizedEnrichedSourceV1 } from '@/lib/enrichment/contracts';

interface ProcessedResultsViewProps {
  products: PipelineProduct[];
  selectedSkus: Set<string>;
  onSelectSku: (
    sku: string,
    selected: boolean,
    index?: number,
    isShiftClick?: boolean,
    visibleProducts?: PipelineProduct[],
  ) => void;
  onSelectAll?: (skus: string[]) => void;
  onDeselectAll?: (skus: string[]) => void;
  onRefresh: (silent?: boolean) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  filters?: {
    source?: string;
    product_line?: string;
    cohort_id?: string;
  };
  onFilterChange?: (filters: {
    source?: string;
    product_line?: string;
    cohort_id?: string;
  }) => void;
  availableSources?: string[];
  isSearching?: boolean;
  groupedProducts?: {
    groups: Record<string, PipelineProduct[]>;
    cohortIds: string[];
    names?: Record<string, string>;
    brands?: Record<string, Brand>;
    productLines?: Record<string, string>;
  };
  onGroupSelect?: (cohortId: string, selected: boolean) => void;
  onGroupDeselectAll?: (cohortId: string) => void;
  /** Prop forwarded to PipelineSidebarTable for cohort editing */
  cohortBrands?: Record<string, string>;
  /** Prop forwarded to PipelineSidebarTable for cohort editing */
  cohortBrandObjects?: Record<string, Brand>;
  /** Prop forwarded to PipelineSidebarTable for cohort editing */
  onEditCohort?: (id: string, name: string | null, brandName: string | null) => void;
}

function getEnrichedSource(product: PipelineProduct): NormalizedEnrichedSourceV1 | null {
  const enriched = product.sources?.["enriched"];
  if (!enriched || typeof enriched !== "object") return null;
  return enriched as NormalizedEnrichedSourceV1;
}

function getEnrichedField<T>(
  product: PipelineProduct,
  field: string
): T | undefined {
  const source = getEnrichedSource(product);
  if (!source) return undefined;

  // Check backward-compatible aliases first, then nested extracted
  const direct = (source as unknown as Record<string, unknown>)[field];
  if (direct !== undefined && direct !== null) return direct as T;

  const extracted = source.extracted as Record<string, unknown> | undefined;
  if (extracted && extracted[field] !== undefined && extracted[field] !== null) {
    return extracted[field] as T;
  }

  return undefined;
}

export function ProcessedResultsView({
  products,
  selectedSkus,
  onSelectSku,
  onSelectAll,
  onDeselectAll,
  onRefresh,
  search,
  onSearchChange,
  filters,
  onFilterChange,
  availableSources = [],
  isSearching = false,
  groupedProducts,
  onGroupSelect,
  onGroupDeselectAll,
  cohortBrands = {},
  cohortBrandObjects = {},
  onEditCohort,
}: ProcessedResultsViewProps) {
  const [detailProduct, setDetailProduct] = useState<PipelineProduct | null>(null);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showConsolidationDialog, setShowConsolidationDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedProducts = useMemo(
    () => products.filter((p) => selectedSkus.has(p.sku)),
    [products, selectedSkus]
  );

  const canSubmit = selectedProducts.length > 0 && !submitting;

  // Determine view: list or detail
  const showListView = !detailProduct;
  const showDetailView = !!detailProduct;

  const handleSubmitForConsolidation = useCallback(async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const res = await adminFetch("/api/admin/consolidation/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skus: Array.from(selectedSkus) }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to submit for consolidation");
      }

      toast.success(
        `${selectedSkus.size} product${selectedSkus.size === 1 ? "" : "s"} submitted for consolidation`
      );
      onRefresh(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Consolidation submission failed");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, selectedSkus, onRefresh]);

  const handleClearResults = useCallback(async () => {
    const skus = Array.from(selectedSkus);
    setSubmitting(true);
    try {
      const res = await adminFetch("/api/admin/pipeline/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skus,
          toStatus: "imported",
          resetResults: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to reset products");
      }

      toast.success(`${skus.length} product${skus.length === 1 ? "" : "s"} returned to Imported`);
      onRefresh(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setSubmitting(false);
      setShowClearDialog(false);
    }
  }, [selectedSkus, onRefresh]);

  const renderProductDetail = (product: PipelineProduct) => {
    const enriched = getEnrichedSource(product);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{getEnrichedField<string>(product, "name") ?? product.sku}</h2>
            <p className="text-sm text-muted-foreground">SKU: {product.sku}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDetailProduct(null)}
          >
            <ChevronLeft className="size-4 mr-1" />
            Back to List
          </Button>
        </div>

        {enriched && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <span className="text-xs text-muted-foreground">Brand</span>
              <p className="font-medium">{enriched.brand ?? "--"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Category</span>
              <p className="font-medium">{enriched.category ?? "--"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Weight</span>
              <p className="font-medium">{enriched.weight ?? "--"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Confidence</span>
              <p className="font-medium">
                {enriched.confidence_score != null
                  ? `${Math.round(enriched.confidence_score * 100)}%`
                  : "--"}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Source URL</span>
              <p className="font-medium text-xs truncate max-w-[200px]">
                {enriched.url ?? "--"}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Extraction Mode</span>
              <p className="font-medium">{enriched.mode ?? "--"}</p>
            </div>
          </div>
        )}

        {enriched?.extracted && (
          <>
            <Separator />
            <div>
              <h3 className="text-sm font-medium mb-2">Extracted Product Facts</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {Object.entries(enriched.extracted)
                  .filter(([, v]) => v !== undefined && v !== null && v !== "")
                  .map(([key, value]) => (
                    <div key={key}>
                      <span className="text-xs text-muted-foreground capitalize">
                        {key.replace(/_/g, " ")}
                      </span>
                      <p className="font-medium truncate">
                        {Array.isArray(value) ? value.join(", ") : String(value)}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}

        <Separator />

        <div className="flex gap-2">
          <Button
            onClick={() => {
              onSelectSku(product.sku, true);
              setShowConsolidationDialog(true);
            }}
            disabled={selectedSkus.size > 0 && !selectedSkus.has(product.sku)}
          >
            <Sparkles className="size-4 mr-2" />
            Submit for Consolidation
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onSelectSku(product.sku, true);
              setShowClearDialog(true);
            }}
          >
            <RotateCcw className="size-4 mr-2" />
            Return to Imported
          </Button>
        </div>
      </div>
    );
  };

  // === LIST VIEW ===
  if (showListView) {
    return (
      <div className="space-y-4">
        {/* Action bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {products.length} processed product{products.length === 1 ? "" : "s"}
            </span>
            {selectedSkus.size > 0 && (
              <span className="text-sm font-medium">
                ({selectedSkus.size} selected)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedSkus.size > 0 && (
              <>
                <Button
                  size="sm"
                  onClick={() => setShowConsolidationDialog(true)}
                  disabled={submitting}
                >
                  <Sparkles className="size-4 mr-2" />
                  Consolidate Selected ({selectedSkus.size})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowClearDialog(true)}
                  disabled={submitting}
                >
                  <RotateCcw className="size-4 mr-2" />
                  Reset
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => onRefresh()}>
              <RotateCcw className="size-4" />
            </Button>
          </div>
        </div>

        {/* Product table */}
        {products.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="size-12 mx-auto mb-3 opacity-40" />
            <p>No processed products</p>
            <p className="text-sm">
              Products with completed enrichment results will appear here.
            </p>
          </div>
        ) : (
          <div className="border rounded-md">
            <PipelineSidebarTable
              variant="processed"
              products={products}
              selectedSkus={selectedSkus}
              onSelectSku={onSelectSku as any}
              onSelectAll={onSelectAll}
              onDeselectAll={onDeselectAll}
              groupedProducts={groupedProducts as any}
              preferredSku={selectedSkus.values().next().value ?? ""}
              onPreferredSkuChange={() => {}}
              cohortBrands={cohortBrands}
              cohortBrandObjects={cohortBrandObjects}
              onEditCohort={onEditCohort}
            />
          </div>
        )}

        {/* Clear results confirmation */}
        <ConfirmationDialog
          open={showClearDialog}
          onOpenChange={setShowClearDialog}
          title="Return to Imported"
          description={`${selectedSkus.size} product${selectedSkus.size === 1 ? "" : "s"} will be returned to Imported for re-extraction. All enrichment data will be cleared, but imported data will be preserved.`}
          onConfirm={handleClearResults}
          confirmLabel="Return to Imported"
          variant="destructive"
        />

        {/* Consolidation dialog */}
        <ConfirmationDialog
          open={showConsolidationDialog}
          onOpenChange={setShowConsolidationDialog}
          title="Submit for Consolidation"
          description={`${selectedSkus.size} product${selectedSkus.size === 1 ? "" : "s"} will be submitted for AI consolidation. Enrichment results will be merged with imported data.`}
          onConfirm={handleSubmitForConsolidation}
          confirmLabel="Submit for Consolidation"
          variant="default"
        />
      </div>
    );
  }

  // === DETAIL VIEW ===
  if (showDetailView && detailProduct) {
    return renderProductDetail(detailProduct);
  }

  return null;
}
