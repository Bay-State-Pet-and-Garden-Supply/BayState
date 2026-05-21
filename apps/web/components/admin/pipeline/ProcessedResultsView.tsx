"use client";

import { useMemo, useCallback, useState, useEffect, useRef } from "react";
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
  CheckCircle2,
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
import {
  buildProcessedSourceItems,
  formatPipelineSourceSlug,
  type ProcessedSourceViewItem,
} from './enriched-source-view-model';

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
  cohortBrands?: Record<string, string>;
  cohortBrandObjects?: Record<string, Brand>;
  onEditCohort?: (id: string, name: string | null, brandName: string | null) => void;
}

interface SourceDetails extends Record<string, unknown> {
  title?: string;
  name?: string;
  description?: string;
  brand?: string;
  category?: string;
  manufacturer_part_number?: string;
  item_number?: string;
  weight?: string;
  size?: string;
  unit_of_measure?: string;
  upc?: string;
  image_url?: string;
  url?: string;
  price?: number | string;
  images?: string[];
  categories?: string[];
  availability?: string;
}

const EMPTY_SOURCES: Record<string, unknown> = {};

interface ProvenanceInfo {
  source_kind?: "static_scraper" | "fallback_serper_ai";
  scraper_slug?: string;
  scrape_job_id?: string;
  source_url?: string;
  quality_score?: number;
  serper_query?: string;
  llm_model?: string;
}

function getProvenance(sourceData: Record<string, unknown> | null): ProvenanceInfo | null {
  const p = (sourceData as Record<string, unknown>)?.["_provenance"];
  if (p && typeof p === "object") return p as ProvenanceInfo;
  return null;
}

function getProvenanceBadge(provenance: ProvenanceInfo | null): { label: string; className: string } | null {
  if (!provenance?.source_kind) return null;
  if (provenance.source_kind === "static_scraper") {
    return { label: "Static scraper", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" };
  }
  if (provenance.source_kind === "fallback_serper_ai") {
    return { label: "Fallback SERPER/AI", className: "bg-purple-500/10 text-purple-500 border-purple-500/20" };
  }
  return null;
}

function isSourceDetails(value: unknown): value is SourceDetails {
  return typeof value === "object" && value !== null;
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
  cohortBrands = {},
  cohortBrandObjects = {},
  onEditCohort,
}: ProcessedResultsViewProps) {
  // 1. Data Sorting
  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => a.sku.localeCompare(b.sku));
  }, [products]);

  // 2. Selection states
  const [preferredSku, setPreferredSku] = useState<string | null>(
    sortedProducts.length > 0 ? sortedProducts[0].sku : null,
  );

  const selectedProduct = useMemo(() => {
    return sortedProducts.find((p) => p.sku === preferredSku) || null;
  }, [sortedProducts, preferredSku]);

  const sources = selectedProduct?.sources || EMPTY_SOURCES;
  const sourceItems = useMemo(
    () => buildProcessedSourceItems(sources as Record<string, unknown>),
    [sources],
  );
  const sourceKeys = useMemo(
    () => sourceItems.map((item) => item.key),
    [sourceItems],
  );

  const [preferredSource, setPreferredSource] = useState<string>("");

  const activeSource = useMemo(() => {
    if (preferredSource && sourceKeys.includes(preferredSource)) {
      return preferredSource;
    }
    return sourceItems.find((item) => item.isDefault)?.key ?? sourceItems[0]?.key ?? "";
  }, [preferredSource, sourceItems, sourceKeys]);

  const activeSourceItem = useMemo<ProcessedSourceViewItem | null>(() => {
    if (!activeSource) return null;
    return sourceItems.find((item) => item.key === activeSource) ?? null;
  }, [activeSource, sourceItems]);

  const currentSourceData = useMemo(() => {
    if (!activeSourceItem?.data) return null;
    return isSourceDetails(activeSourceItem.data) ? activeSourceItem.data : null;
  }, [activeSourceItem]);

  // 3. UI control states
  const [submitting, setSubmitting] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showConsolidationDialog, setShowConsolidationDialog] = useState(false);
  
  const [confirmConsolidateProduct, setConfirmConsolidateProduct] = useState<PipelineProduct | null>(null);
  const [confirmClearProduct, setConfirmClearProduct] = useState<PipelineProduct | null>(null);

  const [confirmDeleteSourceOpen, setConfirmDeleteSourceOpen] = useState(false);
  const [pendingDeleteSource, setPendingDeleteSource] = useState<string | null>(null);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  // Track previous products to handle list reductions smoothly
  const prevProductsRef = useRef<PipelineProduct[]>(sortedProducts);

  useEffect(() => {
    const prevProducts = prevProductsRef.current;
    if (prevProducts !== sortedProducts) {
      const currentExists = sortedProducts.some((p) => p.sku === preferredSku);
      if (!currentExists && preferredSku) {
        const prevIndex = prevProducts.findIndex((p) => p.sku === preferredSku);
        if (prevIndex !== -1) {
          const nextIndex = Math.min(prevIndex, sortedProducts.length - 1);
          if (nextIndex >= 0) {
            setPreferredSku(sortedProducts[nextIndex].sku);
          } else {
            setPreferredSku(null);
          }
        }
      } else if (!preferredSku && sortedProducts.length > 0) {
        setPreferredSku(sortedProducts[0].sku);
      }
      prevProductsRef.current = sortedProducts;
    }
  }, [sortedProducts, preferredSku]);

  // Reset image carousel index and description expand state when product/source switches
  useEffect(() => {
    setCurrentImageIndex(0);
    setIsDescriptionExpanded(false);
  }, [preferredSku, activeSource]);

  // 4. Bulk operations callbacks
  const canBulkSubmit = selectedSkus.size > 0 && !submitting;

  const handleSubmitForConsolidation = useCallback(async () => {
    if (!canBulkSubmit) return;

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
      setShowConsolidationDialog(false);
    }
  }, [canBulkSubmit, selectedSkus, onRefresh]);

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

  // 5. Single product action callbacks
  const handleSingleConsolidate = async (product: PipelineProduct) => {
    setSubmitting(true);
    try {
      const res = await adminFetch("/api/admin/consolidation/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skus: [product.sku] }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to submit for consolidation");
      }

      toast.success(`Product ${product.sku} submitted for consolidation`);
      onRefresh(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Consolidation submission failed");
    } finally {
      setSubmitting(false);
      setConfirmConsolidateProduct(null);
    }
  };

  const handleSingleClearResults = async (product: PipelineProduct) => {
    setSubmitting(true);
    try {
      const res = await adminFetch("/api/admin/pipeline/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skus: [product.sku],
          toStatus: "imported",
          resetResults: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to reset product");
      }

      toast.success(`Product ${product.sku} returned to Imported`);
      onRefresh(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setSubmitting(false);
      setConfirmClearProduct(null);
    }
  };

  // 6. Delete single source handlers
  const handleDeleteSourceClick = useCallback((sourceKey: string) => {
    if (!selectedProduct) return;
    setPendingDeleteSource(sourceKey);
    setConfirmDeleteSourceOpen(true);
  }, [selectedProduct]);

  const handleConfirmDeleteSource = async () => {
    if (!selectedProduct || !pendingDeleteSource) return;
    setConfirmDeleteSourceOpen(false);
    const sourceKey = pendingDeleteSource;

    const currentIndex = sourceKeys.indexOf(sourceKey);
    let nextSource = "";
    if (currentIndex !== -1 && sourceKeys.length > 1) {
      const tempKeys = sourceKeys.filter(k => k !== sourceKey);
      const targetIndex = Math.min(currentIndex, tempKeys.length - 1);
      if (targetIndex >= 0) {
        nextSource = tempKeys[targetIndex];
      }
    }

    try {
      const newSources = { ...selectedProduct.sources };
      delete newSources[sourceKey];
      
      const cleanedSources = Object.fromEntries(
        Object.entries(newSources).filter(([key]) => !key.startsWith("_") && key !== "enriched"),
      );
      const nextStatus = Object.keys(cleanedSources).length === 0 ? "imported" : undefined;

      const res = await adminFetch(`/api/admin/pipeline/${encodeURIComponent(selectedProduct.sku)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: newSources,
          ...(nextStatus ? { pipeline_status: nextStatus } : {}),
        }),
      });

      if (res.ok) {
        toast.success(`Source "${sourceKey}" deleted`);
        if (nextSource) {
          setPreferredSource(nextSource);
        } else {
          setPreferredSource("");
        }
        onRefresh(true);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete source");
      }
    } catch {
      toast.error("An error occurred while deleting the source");
    }
    setPendingDeleteSource(null);
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement?.getAttribute("contenteditable") === "true"
      ) {
        return;
      }

      if (confirmDeleteSourceOpen || showClearDialog || showConsolidationDialog || confirmConsolidateProduct || confirmClearProduct) {
        return;
      }

      if (sourceKeys.length === 0) {
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();

        const currentIndex = sourceKeys.indexOf(activeSource);
        const fallbackIndex = currentIndex === -1 ? 0 : currentIndex;
        const nextIndex =
          event.key === "ArrowRight"
            ? (fallbackIndex + 1) % sourceKeys.length
            : (fallbackIndex - 1 + sourceKeys.length) % sourceKeys.length;

        setPreferredSource(sourceKeys[nextIndex] ?? "");
        return;
      }

      if (event.key === "Backspace" && activeSourceItem?.deleteSourceKey && !confirmDeleteSourceOpen) {
        event.preventDefault();
        handleDeleteSourceClick(activeSourceItem.deleteSourceKey);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSourceItem, confirmDeleteSourceOpen, showClearDialog, showConsolidationDialog, confirmConsolidateProduct, confirmClearProduct, handleDeleteSourceClick, sourceKeys]);

  return (
    <div className="flex flex-1 min-h-0 border border-border rounded-none overflow-hidden bg-background max-w-full">
      {/* Left Column: Product List */}
      <div className="w-96 min-w-[384px] max-w-[384px] border-r border-border flex flex-col shrink-0 bg-background overflow-x-hidden">
        <div className="flex items-center gap-2 border-b border-border bg-card p-2">
          <label className="flex shrink-0 items-center justify-center h-9 w-9 border border-border bg-card hover:bg-muted cursor-pointer transition-colors">
            <Checkbox
              checked={
                sortedProducts.length > 0 &&
                sortedProducts.every((p) => selectedSkus.has(p.sku))
                  ? true
                  : sortedProducts.some((p) => selectedSkus.has(p.sku))
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(checked) => {
                if (checked) {
                  onSelectAll?.(sortedProducts.map((p) => p.sku));
                } else {
                  onDeselectAll?.(sortedProducts.map((p) => p.sku));
                }
              }}
              className="h-4 w-4 rounded-none border border-border accent-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground"
            />
          </label>
          <PipelineSearchField
            value={search || ""}
            onChange={(value) => onSearchChange?.(value)}
            className="flex-1"
            isLoading={isSearching}
          />
          {filters && onFilterChange ? (
            <PipelineFilters
              filters={filters}
              onFilterChange={onFilterChange}
              availableSources={availableSources}
              showSourceFilter={true}
              className="h-9 w-9 shrink-0 p-0 border border-border"
            />
          ) : null}
        </div>

        {/* Bulk Action Header bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border text-xs">
          <div className="flex items-center gap-1 text-muted-foreground font-medium">
            <span>{products.length} processed</span>
            {selectedSkus.size > 0 && (
              <span className="text-foreground font-bold">({selectedSkus.size} selected)</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {selectedSkus.size > 0 && (
              <>
                <Button
                  size="sm"
                  onClick={() => setShowConsolidationDialog(true)}
                  disabled={submitting}
                  className="h-7 text-[10px] font-bold px-2"
                >
                  <Sparkles className="size-3 mr-1" />
                  Consolidate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowClearDialog(true)}
                  disabled={submitting}
                  className="h-7 text-[10px] font-bold px-2 hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
                >
                  <RotateCcw className="size-3 mr-1" />
                  Reset
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onRefresh(true)}
              className="h-7 w-7 p-0 rounded-none border border-border flex items-center justify-center bg-card hover:bg-muted"
            >
              <RotateCcw className="size-3" />
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {products.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="size-12 mx-auto mb-3 opacity-40" />
              <p className="font-semibold text-sm">No processed products</p>
              <p className="text-xs">Products with completed extraction results appear here.</p>
            </div>
          ) : (
            <PipelineSidebarTable
              variant="processed"
              products={products}
              selectedSkus={selectedSkus}
              onSelectSku={onSelectSku as any}
              onSelectAll={onSelectAll}
              onDeselectAll={onDeselectAll}
              groupedProducts={groupedProducts as any}
              preferredSku={preferredSku}
              onPreferredSkuChange={setPreferredSku}
              cohortBrands={cohortBrands}
              cohortBrandObjects={cohortBrandObjects}
              onEditCohort={onEditCohort}
            />
          )}
        </div>
      </div>

      {/* Right Column: Active Workspace Details */}
      <div className="flex-1 flex flex-col bg-card overflow-hidden">
        {selectedProduct ? (
          <>
            {/* Master Details Header */}
            <div className="bg-card border-b border-border flex-shrink-0 z-10">
              <div className="p-3 flex justify-between items-center gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-foreground line-clamp-1" title={selectedProduct.consolidated?.name || selectedProduct.input?.name || ""}>
                      {selectedProduct.consolidated?.name || selectedProduct.input?.name}
                    </h2>
                    <div className="text-[10px] font-semibold text-muted-foreground flex items-center gap-2 mt-0.5">
                      <span className="bg-muted border border-border px-1.5 py-0.5 rounded-none">{selectedProduct.sku}</span>
                      <span>•</span>
                      <span className="font-bold text-foreground">
                        ${Number(currentSourceData?.price || selectedProduct.input?.price || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Single Product Workflow Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    className="h-8 text-[11px] font-bold bg-primary text-primary-foreground hover:bg-primary/95"
                    onClick={() => setConfirmConsolidateProduct(selectedProduct)}
                    disabled={submitting}
                  >
                    <Sparkles className="size-3.5 mr-1.5" />
                    Consolidate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-[11px] font-bold border border-border hover:bg-muted"
                    onClick={() => setConfirmClearProduct(selectedProduct)}
                    disabled={submitting}
                  >
                    <RotateCcw className="size-3.5 mr-1.5" />
                    Reset
                  </Button>
                </div>
              </div>

              {/* Source Tab bar */}
              {sourceKeys.length > 0 ? (
                <div className="px-3 pb-3 flex items-center justify-between gap-4">
                  <Tabs
                    value={activeSource}
                    onValueChange={setPreferredSource}
                    className="flex-1"
                  >
                    <TabsList className="h-8 justify-start bg-muted rounded-none border border-border p-0.5 w-fit">
                      {sourceItems.map((item) => {
                        const srcData = item.data && isSourceDetails(item.data) ? item.data as Record<string, unknown> : null;
                        const prov = getProvenance(srcData);
                        const provBadge = getProvenanceBadge(prov);
                        return (
                          <TabsTrigger
                            key={item.key}
                            value={item.key}
                            className="text-[10px] px-2.5 h-6 font-semibold rounded-none data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none flex items-center gap-1.5"
                          >
                            {item.isEnriched ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : null}
                            {item.label}
                            {provBadge ? (
                              <span className={`text-[7px] px-1 py-0.5 font-bold uppercase tracking-wider ${provBadge.className} rounded-none`}>
                                {provBadge.label}
                              </span>
                            ) : null}
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>
                  </Tabs>
                  {activeSourceItem?.deleteSourceKey ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive h-8 px-3 hover:bg-destructive/10 font-semibold text-[10px] rounded-none border border-transparent hover:border-destructive shrink-0"
                      onClick={() => handleDeleteSourceClick(activeSourceItem.deleteSourceKey as string)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove source
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="px-3 pb-3">
                  <div className="flex items-center gap-2 text-amber-600 bg-amber-500/10 p-2 rounded-none border border-amber-500/20">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="text-[10px] font-semibold">
                      No scraped sources available for this product yet.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Source Content Preview */}
            <div
              key={`${preferredSku}-${activeSource}`}
              className="flex-1 overflow-y-auto p-4"
            >
              {currentSourceData ? (
                <div className="max-w-4xl mx-auto space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left: Image Carousel */}
                    <div className="space-y-3">
                      <div className="aspect-square rounded-none border border-border bg-muted flex items-center justify-center overflow-hidden relative group">
                        {currentSourceData.images && currentSourceData.images.length > 0 ? (
                          <>
                            <img
                              src={currentSourceData.images[currentImageIndex]}
                              alt={currentSourceData.title || currentSourceData.name}
                              className="w-full h-full object-contain transition-all duration-300"
                              data-testid="scraped-primary-image"
                            />
                            
                            {/* Left/Right controls */}
                            {currentSourceData.images.length > 1 && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentImageIndex((prev) => 
                                      prev === 0 ? currentSourceData.images!.length - 1 : prev - 1
                                    );
                                  }}
                                  aria-label="Previous image"
                                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-card hover:bg-muted p-1 rounded-none opacity-0 group-hover:opacity-100 transition-opacity border border-border"
                                >
                                  <ChevronLeft className="h-4 w-4 text-foreground" aria-hidden="true" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentImageIndex((prev) => 
                                      prev === currentSourceData.images!.length - 1 ? 0 : prev + 1
                                    );
                                  }}
                                  aria-label="Next image"
                                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-card hover:bg-muted p-1 rounded-none opacity-0 group-hover:opacity-100 transition-opacity border border-border"
                                >
                                  <ChevronRight className="h-4 w-4 text-foreground" aria-hidden="true" />
                                </button>
                                
                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-card px-1.5 py-0.5 rounded-none text-[9px] font-semibold text-foreground border border-border">
                                  {currentImageIndex + 1} / {currentSourceData.images.length}
                                </div>
                              </>
                            )}
                          </>
                        ) : currentSourceData.image_url ? (
                          <img
                            src={currentSourceData.image_url}
                            alt={currentSourceData.title || currentSourceData.name}
                            className="w-full h-full object-contain"
                            data-testid="scraped-primary-image"
                          />
                        ) : (
                          <div className="flex flex-col items-center text-muted-foreground">
                            <ImageIcon className="h-10 w-10 mb-1 opacity-20" />
                            <span className="text-[10px] font-semibold">No image available</span>
                          </div>
                        )}
                        
                        {currentSourceData.url && (
                          <a
                            href={currentSourceData.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute top-2 right-2 bg-card p-1.5 rounded-none opacity-0 group-hover:opacity-100 transition-opacity border border-border"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-foreground" />
                          </a>
                        )}
                      </div>

                      {/* Thumbnails strip */}
                      {currentSourceData.images && currentSourceData.images.length > 1 && (
                        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                          {currentSourceData.images.map((img, i) => (
                            <div
                              key={i}
                              onClick={() => setCurrentImageIndex(i)}
                              className={`aspect-square w-12 rounded-none border overflow-hidden bg-muted cursor-pointer transition-all flex-shrink-0 ${
                                currentImageIndex === i ? "border-primary ring-2 ring-primary/10" : "border-border opacity-60 hover:opacity-100 hover:border-primary"
                              }`}
                            >
                              <img
                                src={img}
                                alt=""
                                className="w-full h-full object-contain"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right: Spec details panel */}
                    <div className="space-y-3.5">
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-baseline">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge
                              variant="outline"
                              className="bg-foreground text-background border border-foreground rounded-none font-semibold text-[9px]"
                            >
                              {(activeSourceItem?.label ?? formatPipelineSourceSlug(activeSource)).toUpperCase()}
                            </Badge>
                            {(() => {
                              const prov = getProvenance(currentSourceData as unknown as Record<string, unknown>);
                              const provBadge = getProvenanceBadge(prov);
                              return provBadge ? (
                                <Badge variant="outline" className={`text-[8px] font-bold uppercase tracking-wider rounded-none ${provBadge.className}`}>
                                  {provBadge.label}
                                </Badge>
                              ) : null;
                            })()}
                          </div>
                          {currentSourceData.price && (
                            <span className="text-xl font-bold text-foreground">
                              $
                              {typeof currentSourceData.price === "number"
                                ? currentSourceData.price.toFixed(2)
                                : currentSourceData.price}
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-semibold leading-tight text-foreground">
                          {currentSourceData.title || currentSourceData.name || 'Untitled Product'}
                        </h3>
                        <div className="flex flex-wrap items-center gap-y-1.5 gap-x-3 text-xs">
                          {currentSourceData.brand && (
                            <p className="text-[10px] font-semibold text-muted-foreground">
                              Brand: <span className="text-foreground">{currentSourceData.brand}</span>
                            </p>
                          )}
                          {currentSourceData.url && (
                            <a
                              href={currentSourceData.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-none text-[9px] font-bold bg-muted text-foreground border border-border hover:bg-accent transition-colors uppercase tracking-wider"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View Source Page
                            </a>
                          )}
                        </div>
                      </div>

                      <Separator />

                      {/* Technical specifications */}
                      <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 p-2.5 rounded-none border border-border">
                        <div className="space-y-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-semibold text-muted-foreground tracking-wider uppercase">
                              Mfg Part Number
                            </span>
                            <span className="font-bold text-foreground truncate">
                              {currentSourceData.manufacturer_part_number || currentSourceData.item_number || "N/A"}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-semibold text-muted-foreground tracking-wider uppercase">
                              Weight / Size
                            </span>
                            <span className="text-foreground font-bold">
                              {currentSourceData.weight || currentSourceData.size || currentSourceData.unit_of_measure || "N/A"}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-semibold text-muted-foreground tracking-wider uppercase">
                              UPC / Barcode
                            </span>
                            <span className="text-foreground font-bold">
                              {currentSourceData.upc || "N/A"}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-semibold text-muted-foreground tracking-wider uppercase">
                              Availability
                            </span>
                            <span className="text-foreground font-medium truncate">
                              {currentSourceData.availability || "Unknown"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <h4 className="text-[10px] font-semibold text-foreground tracking-wider uppercase">
                          Description
                        </h4>
                        <div className="relative">
                          <div
                            className={`text-xs leading-relaxed text-muted-foreground prose prose-sm max-w-none transition-all duration-300 ${
                              isDescriptionExpanded ? "" : "line-clamp-4"
                            }`}
                          >
                            {currentSourceData.description ? (
                              <div
                                dangerouslySetInnerHTML={{
                                  __html: currentSourceData.description,
                                }}
                              />
                            ) : (
                              <p className="italic text-[10px] font-semibold text-muted-foreground">
                                No description provided by source.
                              </p>
                            )}
                          </div>
                          {currentSourceData.description && currentSourceData.description.length > 200 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-1.5 text-[9px] h-6 text-foreground hover:bg-muted font-bold rounded-none border border-border"
                              onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                            >
                              {isDescriptionExpanded ? "Show Less" : "Show More"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Raw details preview block */}
                  <div className="pt-2">
                    <Separator className="mb-2.5" />
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-semibold text-muted-foreground flex items-center gap-2 tracking-wider uppercase">
                        <Package className="h-3.5 w-3.5" />
                        Scraped JSON Output (Technical Specs)
                      </h4>
                      <div className="bg-muted rounded-none p-3 font-mono text-[9px] overflow-x-auto border border-border max-h-[300px]">
                        <pre className="font-semibold text-foreground">
                          {JSON.stringify(
                            currentSourceData,
                            (_, value) => {
                              if (value === null || value === undefined) return undefined;
                              if (typeof value === 'string' && value.trim().length === 0) return undefined;
                              if (Array.isArray(value) && value.length === 0) return undefined;
                              return value;
                            },
                            2
                          )}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Package className="h-12 w-12 mb-2 opacity-20" />
                  <h3 className="text-lg font-semibold text-foreground">No source content loaded</h3>
                  <p className="text-xs mt-1">Select a different tab above to inspect raw scraped content.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <Package className="h-12 w-12 mb-2 opacity-20" />
            <h3 className="text-lg font-semibold text-foreground">Select a product</h3>
            <p className="text-xs mt-1">Choose a product from the list on the left to review and manage its extraction details.</p>
          </div>
        )}
      </div>

      {/* Confirmation Dialogs */}
      
      {/* 1. Bulk Reset Dialog */}
      <ConfirmationDialog
        open={showClearDialog}
        onOpenChange={setShowClearDialog}
        title="Return to Imported"
        description={`${selectedSkus.size} product${selectedSkus.size === 1 ? "" : "s"} will be returned to Imported for re-extraction. All enrichment data will be cleared, but imported data will be preserved.`}
        onConfirm={handleClearResults}
        confirmLabel="Return to Imported"
        variant="destructive"
      />

      {/* 2. Bulk Consolidation Dialog */}
      <ConfirmationDialog
        open={showConsolidationDialog}
        onOpenChange={setShowConsolidationDialog}
        title="Submit for Consolidation"
        description={`${selectedSkus.size} product${selectedSkus.size === 1 ? "" : "s"} will be submitted for AI consolidation. Enrichment results will be merged with imported data.`}
        onConfirm={handleSubmitForConsolidation}
        confirmLabel="Submit for Consolidation"
        variant="default"
      />

      {/* 3. Single Product Consolidation Dialog */}
      <ConfirmationDialog
        open={!!confirmConsolidateProduct}
        onOpenChange={(open) => !open && setConfirmConsolidateProduct(null)}
        title="Submit for Consolidation"
        description={`Product ${confirmConsolidateProduct?.sku} will be submitted for AI consolidation. Enrichment results will be merged with imported data.`}
        onConfirm={async () => {
          if (confirmConsolidateProduct) {
            await handleSingleConsolidate(confirmConsolidateProduct);
          }
        }}
        confirmLabel="Submit for Consolidation"
        variant="default"
      />

      {/* 4. Single Product Reset Dialog */}
      <ConfirmationDialog
        open={!!confirmClearProduct}
        onOpenChange={(open) => !open && setConfirmClearProduct(null)}
        title="Return to Imported"
        description={`Product ${confirmClearProduct?.sku} will be returned to Imported for re-extraction. All enrichment data will be cleared, but imported data will be preserved.`}
        onConfirm={async () => {
          if (confirmClearProduct) {
            await handleSingleClearResults(confirmClearProduct);
          }
        }}
        confirmLabel="Return to Imported"
        variant="destructive"
      />

      {/* 5. Delete Raw Source Dialog */}
      <ConfirmationDialog
        open={confirmDeleteSourceOpen}
        onOpenChange={(open) => {
          setConfirmDeleteSourceOpen(open);
          if (!open) setPendingDeleteSource(null);
        }}
        onConfirm={handleConfirmDeleteSource}
        title="Delete Extraction Source"
        description={`Are you sure you want to delete the raw source "${pendingDeleteSource}"? This will remove its scraped facts from the product permanently.`}
        confirmLabel="Delete Source"
        variant="destructive"
      />
    </div>
  );
}
