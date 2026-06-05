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

interface ScrapedResultsViewProps {
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
  // Filter props
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
  // Cohort grouping props
  groupedProducts?: {
    groups: Record<string, PipelineProduct[]>;
    cohortIds: string[];
    names?: Record<string, string>;
  };
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
  image_urls?: string[];
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
    return { label: "Static scraper", className: "bg-blue-100 text-blue-700 border-blue-200" };
  }
  if (provenance.source_kind === "fallback_serper_ai") {
    return { label: "Fallback SERPER/AI", className: "bg-purple-100 text-purple-700 border-purple-200" };
  }
  return null;
}

function isSourceDetails(value: unknown): value is SourceDetails {
  return typeof value === "object" && value !== null;
}

export function ScrapedResultsView({
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
  groupedProducts,
  cohortBrands = {},
  cohortBrandObjects = {},
  onEditCohort,
}: ScrapedResultsViewProps) {
  // 1. Data Transformation & Memoized State
  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => a.upc.localeCompare(b.upc));
  }, [products]);

  // 2. Primary Selection State
  const [preferredUpc, setPreferredUpc] = useState<string | null>(
    sortedProducts.length > 0 ? sortedProducts[0].upc : null,
  );

  const selectedProduct = useMemo(() => {
    return sortedProducts.find((p) => p.upc === preferredUpc) || null;
  }, [sortedProducts, preferredUpc]);

  const sources = selectedProduct?.sources || EMPTY_SOURCES;
  const sourceKeys = useMemo(
    () => Object.keys(sources).filter((k) => !k.startsWith("_")),
    [sources],
  );

  const [preferredSource, setPreferredSource] = useState<string>("");

  const activeSource = useMemo(() => {
    if (preferredSource && sourceKeys.includes(preferredSource)) {
      return preferredSource;
    }
    return sourceKeys.length > 0 ? sourceKeys[0] : "";
  }, [preferredSource, sourceKeys]);

  const currentSourceData = useMemo(() => {
    if (!activeSource) return null;
    const sourceValue = sources[activeSource];
    return isSourceDetails(sourceValue) ? sourceValue : null;
  }, [activeSource, sources]);

  // 3. UI State & Refs
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteSource, setPendingDeleteSource] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  const imageUrls = useMemo(() => {
    if (!currentSourceData) return [];
    const urls = currentSourceData.image_urls || (currentSourceData as any).images;
    if (Array.isArray(urls)) return urls;
    if (currentSourceData.image_url) return [currentSourceData.image_url];
    return [];
  }, [currentSourceData]);

  const retryTimestamps = useRef<Map<string, number>>(new Map());

  const handleImageError = useCallback(async (imageUrl: string) => {
    if (!selectedProduct || !imageUrl) return;

    const now = Date.now();
    const lastAttempt = retryTimestamps.current.get(imageUrl) || 0;
    if (now - lastAttempt < 5 * 60 * 1000) {
      console.log(`[ImageRetry] Skipping duplicate retry request for ${imageUrl} (debounced)`);
      return;
    }

    retryTimestamps.current.set(imageUrl, now);

    try {
      const res = await fetch("/api/admin/scraping/retry-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upc: selectedProduct.upc,
          image_url: imageUrl,
        }),
      });

      if (res.ok) {
        toast.success("Image retry queued successfully");
      } else {
        console.error("Failed to queue image retry:", res.statusText);
      }
    } catch (err) {
      console.error("Error queueing image retry:", err);
    }
  }, [selectedProduct]);

  // track previous products to detect when a product is removed (e.g. moved to imported when last source is deleted)
  const prevProductsRef = useRef<PipelineProduct[]>(sortedProducts);

  // 4. Effects
  // Intelligent selection: When products change, if the current selection is gone,
  // select the next product that was after it.
  useEffect(() => {
    const prevProducts = prevProductsRef.current;
    if (prevProducts !== sortedProducts) {
      const currentExists = sortedProducts.some((p) => p.upc === preferredUpc);
      if (!currentExists && preferredUpc) {
        // Current UPC was removed.
        // Find where it was in the PREVIOUS list.
        const prevIndex = prevProducts.findIndex((p) => p.upc === preferredUpc);
        if (prevIndex !== -1) {
          // Select the product that is now at that same index (or the one before if it was last)
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

  // 5. Callbacks

  const handleDeleteSourceClick = useCallback((sourceKey: string) => {
    if (!selectedProduct) return;
    setPendingDeleteSource(sourceKey);
    setConfirmOpen(true);
  }, [selectedProduct]);

  const handleConfirmDeleteSource = async () => {
    if (!selectedProduct || !pendingDeleteSource) return;
    setConfirmOpen(false);
    const sourceKey = pendingDeleteSource;

    // Calculate next source to select before we delete the current one
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
        Object.entries(newSources).filter(([key]) => !key.startsWith("_")),
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
        
        // Update preferred source locally to avoid tab jump/loss
        if (nextSource) {
            setPreferredSource(nextSource);
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

      if (confirmOpen) {
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

      if (event.key === "Backspace" && activeSource && !confirmOpen) {
        event.preventDefault();
        handleDeleteSourceClick(activeSource);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSource, confirmOpen, handleDeleteSourceClick, sourceKeys]);

  // 5. Effects
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
        
        <PipelineSidebarTable
          products={sortedProducts}
          groupedProducts={groupedProducts}
          cohortBrands={cohortBrands}
          cohortBrandObjects={cohortBrandObjects}
          selectedUpcs={selectedUpcs}
          preferredUpc={preferredUpc}
          onSelectUpc={onSelectUpc}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
          onPreferredUpcChange={setPreferredUpc}
          variant="processed"
          onEditCohort={onEditCohort}
        />
      </div>

      {/* Right Column: Scraped Details */}
      <div className="flex-1 flex flex-col bg-card overflow-hidden">
        {selectedProduct ? (
          <>
            {/* Header & Source Switcher */}
            <div className="bg-card border-b border-border flex-shrink-0 z-10">
              <div className="p-2 sm:p-3 flex justify-between items-center">
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold text-foreground line-clamp-1" title={selectedProduct.consolidated?.name || selectedProduct.input?.name || ""}>
                      {selectedProduct.consolidated?.name ||
                        selectedProduct.input?.name}
                    </h2>
                    <div className="text-[10px] font-semibold text-muted-foreground flex items-center gap-2">
                      <span className="bg-muted border border-border px-1.5 py-0.5 rounded-none">{selectedProduct.upc}</span>
                      <span>•</span>
                      <span className="font-bold text-foreground">
                        ${Number(currentSourceData?.price || selectedProduct.input?.price || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => onRefresh(true)} 
                    className="h-8 w-8 p-0 rounded-none border border-border flex items-center justify-center"
                    title="Refresh Data"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {sourceKeys.length > 0 ? (
                <div className="px-2 sm:px-3 pb-2 sm:pb-3 flex items-center justify-between gap-4">
                  <Tabs
                    value={activeSource}
                    activationMode="manual"
                    onValueChange={setPreferredSource}
                    className="flex-1"
                  >
                    <TabsList className="h-8 justify-start bg-muted rounded-none border border-border p-0.5 w-fit">
                      {sourceKeys.map((key) => {
                        const srcData = isSourceDetails(sources[key]) ? sources[key] as Record<string, unknown> : null;
                        const prov = getProvenance(srcData);
                        const provBadge = getProvenanceBadge(prov);
                        return (
                          <TabsTrigger
                            key={key}
                            value={key}
                            className="text-[10px] px-2 h-6 font-semibold rounded-none data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none flex items-center gap-1"
                          >
                            {key}
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive h-8 px-3 hover:bg-destructive/10 font-semibold text-[10px] rounded-none border border-transparent hover:border-destructive"
                    onClick={() => handleDeleteSourceClick(activeSource)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove source
                  </Button>
                </div>
              ) : (
                <div className="px-2 sm:px-3 pb-2 sm:pb-3">
                  <div className="flex items-center gap-2 text-warning-foreground bg-warning/20 p-2 rounded-none border border-warning">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-[10px] font-semibold">
                      No results for this UPC yet.
                    </span>
                  </div>
                </div>              )}
            </div>

            {/* Product Result Display */}
            <div
              key={`${preferredUpc}-${activeSource}`}
              className="flex-1 overflow-y-auto p-2 sm:p-3"
            >
              {currentSourceData ? (
                <div className="max-w-4xl mx-auto space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {/* Left side: Image Carousel */}
                    <div className="space-y-2">
                      <div className="aspect-square rounded-none border border-border bg-muted flex items-center justify-center overflow-hidden relative group">
                        {imageUrls.length > 0 ? (
                          <>
                            <img
                              src={imageUrls[currentImageIndex]}
                              alt={currentSourceData.title || currentSourceData.name}
                              className="w-full h-full object-contain transition-all duration-300"
                              data-testid="scraped-primary-image"
                              onError={() => handleImageError(imageUrls[currentImageIndex])}
                            />
                            
                            {/* Navigation Arrows */}
                            {imageUrls.length > 1 && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentImageIndex((prev) => 
                                      prev === 0 ? imageUrls.length - 1 : prev - 1
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
                                      prev === imageUrls.length - 1 ? 0 : prev + 1
                                    );
                                  }}
                                  aria-label="Next image"
                                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-card hover:bg-muted p-1 rounded-none opacity-0 group-hover:opacity-100 transition-opacity border border-border"
                                >
                                  <ChevronRight className="h-4 w-4 text-foreground" aria-hidden="true" />
                                </button>
                                
                                {/* Image Counter Overlay */}
                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-card px-1.5 py-0.5 rounded-none text-[9px] font-semibold text-foreground border border-border">
                                  {currentImageIndex + 1} / {imageUrls.length}
                                </div>
                              </>
                            )}
                          </>
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

                      {/* Thumbnails */}
                      {imageUrls.length > 1 && (
                        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                          {imageUrls.map((img, i) => (
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
                                data-testid={i > 0 ? `scraped-secondary-image-${i - 1}` : undefined}
                                onError={() => handleImageError(img)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right side: Core Info */}
                    <div className="space-y-2">
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-baseline">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge
                              variant="outline"
                              className="bg-foreground text-background border border-foreground rounded-none font-semibold text-[9px]"
                            >
                              {activeSource.toUpperCase()}
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
                            <span className="text-2xl font-bold text-foreground">
                              $
                              {typeof currentSourceData.price === "number"
                                ? currentSourceData.price.toFixed(2)
                                : currentSourceData.price}
                            </span>
                          )}
                        </div>
                        <h2 className="text-xl font-semibold leading-tight text-foreground">
                          {currentSourceData.title ||
                            currentSourceData.name ||
                            'Untitled Product'}
                        </h2>
                        <div className="flex flex-wrap items-center gap-y-1.5 gap-x-3">
                          {currentSourceData.brand && (
                            <p className="text-[10px] font-semibold text-muted-foreground">
                              Brand:{" "}
                              <span className="text-foreground">
                                {currentSourceData.brand}
                              </span>
                            </p>
                          )}
                          {currentSourceData.url && (
                            <a
                              href={currentSourceData.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-none text-[10px] font-bold bg-muted text-foreground border border-border hover:bg-accent transition-colors uppercase tracking-widest"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View Source
                            </a>
                          )}
                        </div>
                      </div>

                      <Separator className="h-0.5 bg-foreground" />

                      {/* Technical Specs Grid */}
                      <div className="grid grid-cols-2 gap-2 text-sm bg-card p-2 rounded-none border border-border">
                        <div className="space-y-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-semibold text-muted-foreground tracking-widest">
                              Manufacturer Product #
                            </span>
                            <span className="font-bold text-foreground truncate uppercase tracking-widest text-[11px]">
                              {currentSourceData.manufacturer_part_number ||
                                currentSourceData.item_number ||
                                "N/A"}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-semibold text-muted-foreground tracking-widest">
                              Weight / Size
                            </span>
                            <span className="text-foreground font-bold uppercase tracking-widest text-[11px]">
                              {currentSourceData.weight ||
                                currentSourceData.size ||
                                currentSourceData.unit_of_measure ||
                                "N/A"}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-semibold text-muted-foreground tracking-widest">
                              UPC / Barcode
                            </span>
                            <span className="text-foreground font-bold uppercase tracking-widest text-[11px]">
                              {currentSourceData.upc || "N/A"}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-semibold text-muted-foreground tracking-widest">
                              Status
                            </span>
                            <span className="text-foreground truncate font-semibold text-[9px] tracking-widest">
                              {currentSourceData.availability || "Unknown"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <h3 className="text-[10px] font-semibold text-foreground">
                          Description
                        </h3>
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
                              className="mt-1.5 text-[9px] h-6 text-foreground hover:bg-muted font-semibold rounded-none border border-border"
                              onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                            >
                              {isDescriptionExpanded ? "Show Less" : "Show More"}
                            </Button>
                          )}
                        </div>
                      </div>

                      {currentSourceData.url && (
                        <Button
                          className="w-full h-9 bg-foreground hover:bg-foreground/90 text-background rounded-none border-b border-r border-muted-foreground/30 active:border-0 transition-all font-semibold text-xs"
                          asChild
                        >
                          <a
                            href={currentSourceData.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-2" />
                            Visit Source Website
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Extra Data / Raw View */}
                  <div className="pt-2">
                    <Separator className="mb-2" />
                    <div className="space-y-2">
                      <h3 className="text-[10px] font-semibold text-muted-foreground flex items-center gap-2">
                        <Package className="h-3.5 w-3.5" />
                        Technical Details (Raw Data)
                      </h3>
                      <div className="bg-muted rounded-none p-2 font-mono text-[9px] overflow-x-auto border border-border">
                        <pre className="font-bold">
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
                  <h3 className="text-lg font-semibold text-foreground">
                    No results for {activeSource}
                  </h3>
                  <p className="text-[10px] font-semibold mt-1">
                    Try selecting a different source or re-scraping this
                    product.
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <Package className="h-12 w-12 mb-2 opacity-20" />
            <h3 className="text-lg font-semibold text-foreground">Select a product</h3>
            <p className="text-[10px] font-semibold mt-1">Choose a product from the list to view its scraped results.</p>
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setPendingDeleteSource(null);
        }}
        onConfirm={handleConfirmDeleteSource}
        title="Delete Source"
        description={`Are you sure you want to delete the source "${pendingDeleteSource}"?`}
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  );
}
