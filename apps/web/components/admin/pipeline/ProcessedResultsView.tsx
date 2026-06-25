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
  Maximize2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import type { PipelineProduct } from "@/lib/pipeline/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { PipelineFilters } from "./PipelineFilters";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import { PipelineSearchField } from "./PipelineSearchField";
import { PipelineSidebarTable } from "./PipelineSidebarTable";
import { adminFetch } from '@/lib/admin/api-client';
import {
  buildProcessedSourceItems,
  formatPipelineSourceSlug,
  type ProcessedSourceViewItem,
} from './source-view-model';

interface ProcessedResultsViewProps {
  products: PipelineProduct[];
  selectedUpcs: Set<string>;
  onSelectUpc: (
    upc: string,
    selected: boolean,
    index?: number,
    isShiftClick?: boolean,
    visibleProducts?: PipelineProduct[],
  ) => void;
  onSelectAll?: (upcs: string[]) => void;
  onDeselectAll?: (upcs: string[]) => void;
  onRefresh: (silent?: boolean) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  filters?: {
    source?: string;
    product_line?: string;
  };
  onFilterChange?: (filters: {
    source?: string;
    product_line?: string;
  }) => void;
  availableSources?: string[];
  isSearching?: boolean;
  // Classification progress (from Grouping flow)
  classificationRun?: {
    isActive: boolean;
    progress: number;
    classifyingCount: number;
    totalCount: number;
    summary: {
      assignedCount?: number;
      ungroupedCount?: number;
      productLinesCount?: number;
    } | null;
  } | null;
  classifyingUpcs?: Set<string>;
  onViewGroups?: () => void;
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
  image_urls?: string[];
  categories?: string[];
  availability?: string;
}

interface DisplayFields {
  title: string;
  brand: string;
  price: string | number | null;
  url: string | null;
  imageUrls: string[];
  description: string | null;
  manufacturerPartNumber: string | null;
  weightSizeUom: string | null;
  upc: string | null;
  availability: string | null;
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
  selectedUpcs,
  onSelectUpc,
  onSelectAll,
  onDeselectAll,
  onRefresh,
  search,
  onSearchChange,
  filters,
  onFilterChange,
  availableSources = [],
  isSearching = false,
  classificationRun,
  classifyingUpcs = new Set(),
  onViewGroups,
}: ProcessedResultsViewProps) {
  // 1. Data Sorting
  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => a.upc.localeCompare(b.upc));
  }, [products]);

  // 2. Selection states
  const [preferredUpc, setPreferredUpc] = useState<string | null>(
    sortedProducts.length > 0 ? sortedProducts[0].upc : null,
  );

  const selectedProduct = useMemo(() => {
    return sortedProducts.find((p) => p.upc === preferredUpc) || null;
  }, [sortedProducts, preferredUpc]);

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

  const displayFields = useMemo<DisplayFields | null>(() => {
    if (!currentSourceData) return null;

    const core = (currentSourceData.core || (currentSourceData.extracted as any)?.core) as any;
    const media = (currentSourceData.media || (currentSourceData.extracted as any)?.media) as any[];
    const facets = (currentSourceData.facets || (currentSourceData.extracted as any)?.facets) as any[];

    const getFacetValue = (slugs: string[]) =>
      facets?.find((f) =>
        f?.definition_slug &&
        (slugs.includes(f.definition_slug.toLowerCase().replace(/_/g, "-")) ||
          slugs.includes(f.definition_slug.toLowerCase()))
      )?.value;

    const title = core?.name || "Untitled Product";

    const brand = core?.brand_name || "";

    const price = core?.price !== undefined && core?.price !== null ? core.price : null;

    const url =
      currentSourceData._url ||
      currentSourceData.url ||
      (currentSourceData.extracted as any)?._url ||
      (currentSourceData.extracted as any)?.url ||
      null;

    let imageUrls: string[] = [];
    if (Array.isArray(media)) {
      imageUrls = media.map((m: any) => typeof m === "string" ? m : m?.url).filter(Boolean);
    }

    const description = core?.description || null;

    const mfgPartNumber =
      getFacetValue([
        "manufacturer-part-number",
        "manufacturer-part-no",
        "manufacturer-part-num",
        "manufacturer_part_number",
        "mfg-part-number",
        "mfg-part-no",
        "mfg-part-num",
        "mfg_part_number",
        "item-number",
        "item-no",
        "item_number",
        "mfg_no",
        "mfg-no",
      ]) || null;

    const weightStr =
      core?.weight_lbs !== undefined && core?.weight_lbs !== null
        ? `${core.weight_lbs} lbs`
        : getFacetValue(["weight", "shipping-weight"]) || null;

    const sizeStr = getFacetValue(["size"]) || null;

    const uomStr = getFacetValue(["unit-of-measure", "uom", "unit_of_measure"]) || null;

    const weightSizeUom = [weightStr, sizeStr, uomStr].filter(Boolean).join(" / ") || null;

    const upc =
      currentSourceData._upc ||
      (currentSourceData.extracted as any)?._upc ||
      selectedProduct?.upc ||
      null;

    const availability =
      core?.availability ||
      core?.stock_status ||
      getFacetValue(["availability", "stock-status", "stock_status"]) ||
      null;

    return {
      title,
      brand,
      price,
      url,
      imageUrls,
      description,
      manufacturerPartNumber: mfgPartNumber,
      weightSizeUom,
      upc,
      availability,
    };
  }, [currentSourceData, selectedProduct?.upc]);

  // 3. UI control states
  const [submitting, setSubmitting] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  
  const [confirmClearProduct, setConfirmClearProduct] = useState<PipelineProduct | null>(null);

  const [confirmDeleteSourceOpen, setConfirmDeleteSourceOpen] = useState(false);
  const [pendingDeleteSource, setPendingDeleteSource] = useState<string | null>(null);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Track previous products to handle list reductions smoothly
  const prevProductsRef = useRef<PipelineProduct[]>(sortedProducts);

  useEffect(() => {
    const prevProducts = prevProductsRef.current;
    if (prevProducts !== sortedProducts) {
      const currentExists = sortedProducts.some((p) => p.upc === preferredUpc);
      if (!currentExists && preferredUpc) {
        const prevIndex = prevProducts.findIndex((p) => p.upc === preferredUpc);
        if (prevIndex !== -1) {
          const nextIndex = Math.min(prevIndex, sortedProducts.length - 1);
          if (nextIndex >= 0) {
            setPreferredUpc(sortedProducts[nextIndex].upc);
          } else {
            setPreferredUpc(null);
          }
        }
      } else if (!preferredUpc && sortedProducts.length > 0) {
        setPreferredUpc(sortedProducts[0].upc);
      }
      prevProductsRef.current = sortedProducts;
    }
  }, [sortedProducts, preferredUpc]);

  // Reset image carousel index and description expand state when product/source switches
  useEffect(() => {
    setCurrentImageIndex(0);
    setIsDescriptionExpanded(false);
  }, [preferredUpc, activeSource]);

  // 4. Bulk operations callbacks
  const canBulkSubmit = selectedUpcs.size > 0 && !submitting;

  const handleClearResults = useCallback(async () => {
    const upcs = Array.from(selectedUpcs);
    setSubmitting(true);
    try {
      const res = await adminFetch("/api/admin/pipeline/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upcs,
          toStatus: "imported",
          resetResults: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to reset products");
      }

      toast.success(`${upcs.length} product${upcs.length === 1 ? "" : "s"} returned to Imported`);
      onRefresh(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setSubmitting(false);
      setShowClearDialog(false);
    }
  }, [selectedUpcs, onRefresh]);

  // 5. Single product action callbacks
  const handleSingleClearResults = async (product: PipelineProduct) => {
    setSubmitting(true);
    try {
      const res = await adminFetch("/api/admin/pipeline/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upcs: [product.upc],
          toStatus: "imported",
          resetResults: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Failed to reset product");
      }

      toast.success(`Product ${product.upc} returned to Imported`);
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

      const res = await adminFetch(`/api/admin/pipeline/${encodeURIComponent(selectedProduct.upc)}`, {
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

      if (confirmDeleteSourceOpen || showClearDialog || confirmClearProduct) {
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
  }, [activeSourceItem, confirmDeleteSourceOpen, showClearDialog, confirmClearProduct, handleDeleteSourceClick, sourceKeys]);

  return (
    <div className="flex flex-1 min-h-0 border border-border rounded-none overflow-hidden bg-background max-w-full">
      {/* Left Column: Product List */}
      <div className="w-96 min-w-[384px] max-w-[384px] border-r border-border flex flex-col shrink-0 bg-background overflow-x-hidden">
        <div className="flex items-center gap-2 border-b border-border bg-card p-2">
          <label className="flex shrink-0 items-center justify-center h-9 w-9 border border-border bg-card hover:bg-muted cursor-pointer transition-colors">
            <Checkbox
              checked={
                sortedProducts.length > 0 &&
                sortedProducts.every((p) => selectedUpcs.has(p.upc))
                  ? true
                  : sortedProducts.some((p) => selectedUpcs.has(p.upc))
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(checked) => {
                if (checked) {
                  onSelectAll?.(sortedProducts.map((p) => p.upc));
                } else {
                  onDeselectAll?.(sortedProducts.map((p) => p.upc));
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

        {/* Classification Progress Banner */}
        {classificationRun ? (
          <div className="px-3 py-2 border-b border-border bg-blue-50 dark:bg-blue-950/20">
            {classificationRun.isActive ? (
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                    <span>Classifying {classificationRun.classifyingCount} of {classificationRun.totalCount} products...</span>
                    <span>{classificationRun.progress}%</span>
                  </div>
                  <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-1.5">
                    <div
                      className="bg-blue-600 dark:bg-blue-400 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${classificationRun.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : classificationRun.summary ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
                  <span className="text-xs font-medium text-green-700 dark:text-green-300">
                    {classificationRun.summary.assignedCount ?? 0} products → {classificationRun.summary.productLinesCount ?? 0} groups
                    {classificationRun.summary.ungroupedCount && classificationRun.summary.ungroupedCount > 0
                      ? `, ${classificationRun.summary.ungroupedCount} ungrouped`
                      : ''}
                  </span>
                </div>
                {onViewGroups ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onViewGroups}
                    className="h-7 text-[10px] font-bold"
                  >
                    View Groups →
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Bulk Action Header bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border text-xs">
          <div className="flex items-center gap-1 text-muted-foreground font-medium">
            <span>{products.length} processed</span>
            {classificationRun?.isActive && (
              <span className="ml-2 text-blue-600 dark:text-blue-400 animate-pulse text-[10px]">
                ({classificationRun.classifyingCount}/{classificationRun.totalCount} classifying...)
              </span>
            )}
            {selectedUpcs.size > 0 && (
              <span className="text-foreground font-bold">({selectedUpcs.size} selected)</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {selectedUpcs.size > 0 && (
              <>
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
              selectedUpcs={selectedUpcs}
              onSelectUpc={onSelectUpc as any}
              onSelectAll={onSelectAll}
              onDeselectAll={onDeselectAll}
              preferredUpc={preferredUpc}
              onPreferredUpcChange={setPreferredUpc}
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
                    <h2 className="text-base font-semibold text-foreground line-clamp-1" title={selectedProduct.consolidated?.core?.name || selectedProduct.consolidated?.name || selectedProduct.input?.name || ""}>
                      {selectedProduct.consolidated?.core?.name || selectedProduct.consolidated?.name || selectedProduct.input?.name}
                    </h2>
                    <div className="text-[10px] font-semibold text-muted-foreground flex items-center gap-2 mt-0.5">
                      <span className="bg-muted border border-border px-1.5 py-0.5 rounded-none">{selectedProduct.upc}</span>
                      <span>•</span>
                      <span className="font-bold text-foreground">
                        ${Number(displayFields?.price || selectedProduct.input?.price || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Single Product Workflow Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-[11px] font-bold border border-border hover:bg-muted text-foreground"
                    onClick={async () => {
                      if (!selectedProduct) return;
                      setSubmitting(true);
                      try {
                        const res = await fetch('/api/admin/pipeline/bulk', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ upcs: [selectedProduct.upc], toStatus: 'extracting', resetResults: true }),
                        });
                        if (res.status === 404) {
                          toast.error("The enrichment pipeline has been replaced by the source cascade. Use 'Re-extract' from the Processed tab instead.");
                          setSubmitting(false);
                          return;
                        }
                        const payload = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(payload.error || 'Failed to re-scrape');
                        toast.success(`Re-scraping ${selectedProduct.upc}`, {
                          description: 'Only failed/untried sources will be retried.',
                        });
                        onRefresh(true);
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Failed to re-scrape');
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    disabled={submitting}
                  >
                    <RefreshCw className="size-3.5 mr-1.5" />
                    Re-scrape
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
                    activationMode="manual"
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
                  <div className="flex items-center gap-2 shrink-0">
                     {displayFields?.url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-3 hover:bg-muted font-semibold text-[10px] rounded-none border border-border flex items-center gap-2"
                        asChild
                      >
                        <a href={displayFields.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                          View Source
                        </a>
                      </Button>
                    )}
                    {activeSourceItem?.deleteSourceKey ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive h-8 px-3 hover:bg-destructive/10 font-semibold text-[10px] rounded-none border border-transparent hover:border-destructive"
                        onClick={() => handleDeleteSourceClick(activeSourceItem.deleteSourceKey as string)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove source
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="px-3 pb-3">
                  <div className="flex items-center gap-2 text-amber-600 bg-amber-500/10 p-2 rounded-none border border-amber-500/20">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="text-[10px] font-semibold">
                      No source data available for this product yet.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Source Content Preview */}
            <div
              key={`${preferredUpc}-${activeSource}`}
              className="flex-1 overflow-y-auto p-4"
            >
              {currentSourceData && displayFields ? (
                <div className="max-w-4xl mx-auto space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left: Premium Image Carousel */}
                    <div className="space-y-3">
                      <div 
                        className="aspect-square rounded-md border border-[#E8E6D9] bg-[#FAF9F2] flex items-center justify-center overflow-hidden relative shadow-sm hover:shadow-md transition-all duration-300"
                      >
                        {displayFields.imageUrls && displayFields.imageUrls.length > 0 ? (
                          <>
                            {/* Inner image container for hover and click to zoom */}
                            <div
                              onClick={() => setIsLightboxOpen(true)}
                              className="w-full h-full cursor-pointer relative group/image"
                            >
                              <img
                                src={displayFields.imageUrls[currentImageIndex]}
                                alt={displayFields.title}
                                className="w-full h-full object-contain p-2 transition-transform duration-300 group-hover/image:scale-[1.02]"
                                data-testid="scraped-primary-image"
                                referrerPolicy="no-referrer"
                              />
                              
                              {/* Hover overlay zooming indicator */}
                              <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] opacity-0 group-hover/image:opacity-100 transition-all duration-200 flex items-center justify-center text-white text-xs font-semibold gap-1.5">
                                <Maximize2 className="h-4 w-4" />
                                <span>Click to enlarge</span>
                              </div>
                            </div>

                            {/* Left/Right controls (outside hover/click target) */}
                            {displayFields.imageUrls.length > 1 && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentImageIndex((prev) => 
                                      prev === 0 ? displayFields.imageUrls.length - 1 : prev - 1
                                    );
                                  }}
                                  aria-label="Previous image"
                                  className="absolute left-2.5 top-1/2 -translate-y-1/2 bg-white/95 text-foreground hover:bg-[#14532D] hover:text-white p-1.5 rounded-full shadow-md transition-all duration-200 border border-border/50 z-10 hover:scale-105 active:scale-95"
                                >
                                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentImageIndex((prev) => 
                                      prev === displayFields.imageUrls.length - 1 ? 0 : prev + 1
                                    );
                                  }}
                                  aria-label="Next image"
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-white/95 text-foreground hover:bg-[#14532D] hover:text-white p-1.5 rounded-full shadow-md transition-all duration-200 border border-border/50 z-10 hover:scale-105 active:scale-95"
                                >
                                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                </button>
                                
                                <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 bg-white/95 px-2 py-0.5 rounded-full text-[9px] font-bold text-foreground border border-border shadow-sm z-10">
                                  {currentImageIndex + 1} / {displayFields.imageUrls.length}
                                </div>
                              </>
                            )}
                          </>
                        ) : (
                          <div className="flex flex-col items-center text-muted-foreground p-4">
                            <ImageIcon className="h-10 w-10 mb-1 opacity-25 text-brand-forest-green" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">No image available</span>
                          </div>
                        )}
                      </div>

                      {/* Premium Thumbnails strip */}
                      {displayFields.imageUrls && displayFields.imageUrls.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide justify-center">
                          {displayFields.imageUrls.map((img, i) => (
                            <div
                              key={i}
                              onClick={() => setCurrentImageIndex(i)}
                              className={`aspect-square w-12 rounded-md border overflow-hidden bg-white cursor-pointer transition-all flex-shrink-0 hover:scale-105 ${
                                currentImageIndex === i 
                                  ? "border-brand-forest-green ring-2 ring-brand-forest-green/20 scale-105 opacity-100 shadow-sm" 
                                  : "border-border opacity-60 hover:opacity-100 hover:border-brand-forest-green/50"
                              }`}
                            >
                              <img
                                src={img}
                                alt=""
                                className="w-full h-full object-contain p-0.5"
                                referrerPolicy="no-referrer"
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
                          {displayFields.price && (
                            <span className="text-xl font-bold text-foreground">
                              $
                              {typeof displayFields.price === "number"
                                ? displayFields.price.toFixed(2)
                                : displayFields.price}
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-semibold leading-tight text-foreground">
                          {displayFields.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-y-1.5 gap-x-3 text-xs">
                          {displayFields.brand && (
                            <p className="text-[10px] font-semibold text-muted-foreground">
                              Brand: <span className="text-foreground">{displayFields.brand}</span>
                            </p>
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
                              {displayFields.manufacturerPartNumber || "N/A"}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-semibold text-muted-foreground tracking-wider uppercase">
                              Weight / Size
                            </span>
                            <span className="text-foreground font-bold">
                              {displayFields.weightSizeUom || "N/A"}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-semibold text-muted-foreground tracking-wider uppercase">
                              UPC / Barcode
                            </span>
                            <span className="text-foreground font-bold">
                              {displayFields.upc || "N/A"}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-semibold text-muted-foreground tracking-wider uppercase">
                              Availability
                            </span>
                            <span className="text-foreground font-medium truncate">
                              {displayFields.availability || "Unknown"}
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
                            {displayFields.description ? (
                              <div
                                dangerouslySetInnerHTML={{
                                  __html: displayFields.description,
                                }}
                              />
                            ) : (
                              <p className="italic text-[10px] font-semibold text-muted-foreground">
                                No description provided by source.
                              </p>
                            )}
                          </div>
                          {displayFields.description && displayFields.description.length > 200 && (
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
                        Raw Source JSON (Technical Specs)
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
                  <p className="text-xs mt-1">Select a different source tab above to inspect raw source content.</p>
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
        description={`${selectedUpcs.size} product${selectedUpcs.size === 1 ? "" : "s"} will be returned to Imported for re-extraction. All enrichment data will be cleared, but imported data will be preserved.`}
        onConfirm={handleClearResults}
        confirmLabel="Return to Imported"
        variant="destructive"
      />

      {/* 4. Single Product Reset Dialog */}
      <ConfirmationDialog
        open={!!confirmClearProduct}
        onOpenChange={(open) => !open && setConfirmClearProduct(null)}
        title="Return to Imported"
        description={`Product ${confirmClearProduct?.upc} will be returned to Imported for re-extraction. All enrichment data will be cleared, but imported data will be preserved.`}
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
        description={`Are you sure you want to delete the raw source "${pendingDeleteSource}"? This will remove its extracted facts from the product permanently.`}
        confirmLabel="Delete Source"
        variant="destructive"
      />

      {/* Lightbox Zoom Dialog */}
      <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
        <DialogContent className="max-w-4xl p-6 bg-card border border-border rounded-lg shadow-lg flex flex-col gap-4">
          <DialogTitle className="text-sm font-semibold truncate text-foreground pr-8">
            {displayFields?.title || "Product Image"}
          </DialogTitle>
          <div className="h-[60vh] w-full flex items-center justify-center bg-[#FAF9F2] rounded-lg overflow-hidden relative border border-[#E8E6D9]">
            {displayFields?.imageUrls && displayFields.imageUrls.length > 0 ? (
              <>
                <img
                  src={displayFields.imageUrls[currentImageIndex]}
                  alt={displayFields.title}
                  className="max-w-full max-h-full object-contain p-4"
                  referrerPolicy="no-referrer"
                />

                {displayFields.imageUrls.length > 1 && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentImageIndex((prev) =>
                          prev === 0 ? displayFields.imageUrls.length - 1 : prev - 1
                        );
                      }}
                      aria-label="Previous image"
                      className="absolute left-4 top-1/2 -translate-y-1/2 size-10 flex items-center justify-center rounded-full bg-white/95 text-foreground shadow-md hover:bg-[#14532D] hover:text-white border border-border/50 transition-all duration-200 hover:scale-105 active:scale-95"
                    >
                      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentImageIndex((prev) =>
                          prev === displayFields.imageUrls.length - 1 ? 0 : prev + 1
                        );
                      }}
                      aria-label="Next image"
                      className="absolute right-4 top-1/2 -translate-y-1/2 size-10 flex items-center justify-center rounded-full bg-white/95 text-foreground shadow-md hover:bg-[#14532D] hover:text-white border border-border/50 transition-all duration-200 hover:scale-105 active:scale-95"
                    >
                      <ChevronRight className="h-5 w-5" aria-hidden="true" />
                    </button>
                    
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/95 px-3 py-1 rounded-full text-xs font-bold text-foreground border border-border shadow-sm">
                      {currentImageIndex + 1} / {displayFields.imageUrls.length}
                    </div>
                  </>
                )}
              </>
            ) : null}
          </div>

          {/* Lightbox Thumbnails */}
          {displayFields?.imageUrls && displayFields.imageUrls.length > 1 && (
            <div className="flex gap-2 overflow-x-auto justify-center pb-1 scrollbar-hide">
              {displayFields.imageUrls.map((img, i) => (
                <div
                  key={i}
                  onClick={() => setCurrentImageIndex(i)}
                  className={`aspect-square w-16 rounded-md border overflow-hidden bg-white cursor-pointer transition-all flex-shrink-0 hover:scale-105 ${
                    currentImageIndex === i 
                      ? "border-brand-forest-green ring-2 ring-brand-forest-green/20 scale-105 opacity-100 shadow-sm" 
                      : "border-border opacity-60 hover:opacity-100 hover:border-brand-forest-green/50"
                  }`}
                >
                  <img
                    src={img}
                    alt=""
                    className="w-full h-full object-contain p-1"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
