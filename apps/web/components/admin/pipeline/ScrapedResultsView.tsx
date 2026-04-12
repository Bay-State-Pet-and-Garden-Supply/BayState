"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import {
  Package,
  ExternalLink,
  Trash2,
  Image as ImageIcon,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Edit2,
} from "lucide-react";
import { toast } from "sonner";
import type { PipelineProduct } from "@/lib/pipeline/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { PipelineFilters } from "./PipelineFilters";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PipelineSearchField } from "./PipelineSearchField";
import { formatPipelineBatchLabel } from "./view-utils";

interface ScrapedResultsViewProps {
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
  // Cohort grouping props
  groupedProducts?: {
    groups: Record<string, PipelineProduct[]>;
    cohortIds: string[];
    names?: Record<string, string>;
  };
  cohortBrands?: Record<string, string>;
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
const IMAGE_RETRY_DEBOUNCE_MS = 5 * 60 * 1000;
const imageRetryAttemptTimestamps = new Map<string, number>();

function isSourceDetails(value: unknown): value is SourceDetails {
  return typeof value === "object" && value !== null;
}

export function ScrapedResultsView({
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
  groupedProducts,
  cohortBrands = {},
  onEditCohort,
}: ScrapedResultsViewProps) {
  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => a.sku.localeCompare(b.sku));
  }, [products]);

  const [preferredSku, setPreferredSku] = useState<string | null>(
    sortedProducts.length > 0 ? sortedProducts[0].sku : null,
  );

  // track previous products to detect when a product is removed
  const prevProductsRef = useRef<PipelineProduct[]>(sortedProducts);

  const [preferredSource, setPreferredSource] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteSource, setPendingDeleteSource] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  const selectedProduct =
    sortedProducts.find((product) => product.sku === preferredSku) ??
    sortedProducts[0] ??
    null;
  const selectedSku = selectedProduct?.sku ?? null;
  const sources = selectedProduct?.sources ?? EMPTY_SOURCES;
  const sourceKeys = useMemo(
    () => Object.keys(sources).filter((key) => !key.startsWith("_")),
    [sources],
  );

  const activeSource = useMemo(() => {
    if (preferredSource && sourceKeys.includes(preferredSource)) {
      return preferredSource;
    }

    return sourceKeys[0] ?? "";
  }, [preferredSource, sourceKeys]);

  // Intelligent selection: When products change, if the current selection is gone,
  // select the next product that was after it.
  useEffect(() => {
    const prevProducts = prevProductsRef.current;
    if (prevProducts !== sortedProducts) {
      const currentExists = sortedProducts.some((p) => p.sku === preferredSku);
      if (!currentExists && preferredSku) {
        // Current SKU was removed.
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

      if (sortedProducts.length === 0) return;

      const currentIndex = sortedProducts.findIndex((p) => p.sku === preferredSku);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = Math.min(currentIndex + 1, sortedProducts.length - 1);
        const nextSku = sortedProducts[nextIndex].sku;
        setPreferredSku(nextSku);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const nextIndex = Math.max(currentIndex - 1, 0);
        const nextSku = sortedProducts[nextIndex].sku;
        setPreferredSku(nextSku);
      } else if (e.key === " ") {
        if (preferredSku) {
          e.preventDefault();
          const isChecked = selectedSkus.has(preferredSku);
          onSelectSku(
            preferredSku,
            !isChecked,
            currentIndex,
            e.shiftKey,
            sortedProducts
          );
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [preferredSku, sortedProducts, selectedSkus, onSelectSku]);

  // Scroll active item into view
  useEffect(() => {
    if (preferredSku && scrollContainerRef.current) {
      const activeElement = scrollContainerRef.current.querySelector(`[data-sku="${preferredSku}"]`);
      if (activeElement) {
        activeElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [preferredSku]);

  const handleDeleteSourceClick = (sourceKey: string) => {
    if (!selectedProduct) return;
    setPendingDeleteSource(sourceKey);
    setConfirmOpen(true);
  };

  const handleConfirmDeleteSource = async () => {
    if (!selectedProduct || !pendingDeleteSource) return;
    setConfirmOpen(false);

    const sourceKey = pendingDeleteSource;

    try {
      const newSources = { ...selectedProduct.sources };
      delete newSources[sourceKey];

      const cleanedSources = Object.fromEntries(
        Object.entries(newSources).filter(([key]) => !key.startsWith("_")),
      );

      const nextStatus =
        Object.keys(cleanedSources).length === 0 ? "imported" : undefined;

      const res = await fetch(
        `/api/admin/pipeline/${encodeURIComponent(selectedProduct.sku)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sources: newSources,
            ...(nextStatus ? { pipeline_status: nextStatus } : {}),
          }),
        },
      );

      if (res.ok) {
        toast.success(`Source "${sourceKey}" deleted`);
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

  const currentSourceData = useMemo(() => {
    if (!activeSource) {
      return null;
    }

    const sourceValue = sources[activeSource];
    return isSourceDetails(sourceValue) ? sourceValue : null;
  }, [activeSource, sources]);

  const handleImageError = useCallback(
    (imageUrl: string | undefined) => {
      const productId = selectedProduct?.sku;
      const normalizedImageUrl = imageUrl?.trim();

      if (!productId || !normalizedImageUrl) {
        return;
      }

      const retryKey = `${productId}:${normalizedImageUrl}`;
      const now = Date.now();
      const lastAttemptAt = imageRetryAttemptTimestamps.get(retryKey);

      if (
        typeof lastAttemptAt === "number" &&
        now - lastAttemptAt < IMAGE_RETRY_DEBOUNCE_MS
      ) {
        console.info(
          `[ScrapedResultsView] Debounced retry trigger for ${normalizedImageUrl}`,
        );
        return;
      }

      imageRetryAttemptTimestamps.set(retryKey, now);

      void fetch("/api/admin/scraping/retry-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: productId,
          image_url: normalizedImageUrl,
        }),
      })
        .then(async (response) => {
          if (response.ok || response.status === 202) {
            return;
          }

          const payload = await response.json().catch(() => null);
          console.warn(
            `[ScrapedResultsView] Failed to enqueue retry for ${normalizedImageUrl}`,
            payload,
          );
        })
        .catch((error) => {
          console.warn(
            `[ScrapedResultsView] Error enqueuing retry for ${normalizedImageUrl}`,
            error,
          );
        });
    },
    [selectedProduct?.sku],
  );

  const renderProductItem = (product: PipelineProduct, index: number, visibleProducts: PipelineProduct[]) => {
    const name = product.consolidated?.name || product.input?.name || "Unknown";
    const price = product.consolidated?.price ?? product.input?.price;
    const sourceCount = Object.keys(product.sources || {}).filter(
      (key) => !key.startsWith("_"),
    ).length;
    const isSelected = selectedSku === product.sku;
    const isChecked = selectedSkus.has(product.sku);

    return (
      <div
        key={product.sku}
        data-sku={product.sku}
        className={`group p-3 cursor-pointer hover:bg-muted/50 transition-colors relative ${
          isSelected ? "bg-primary/5 shadow-[inset_3px_0_0_0_hsl(var(--primary))]" : ""
        }`}
        onClick={() => setPreferredSku(product.sku)}
      >
        <div className="flex items-start gap-3">
          <div
            className="pt-1"
            onClick={(e) => {
              e.stopPropagation();
              onSelectSku(
                product.sku,
                !isChecked,
                index,
                e.shiftKey,
                visibleProducts,
              );
            }}
          >
            <Checkbox
              checked={isChecked}
              onCheckedChange={() => {
                // Handle keyboard selection
                if (typeof window !== 'undefined' && !(window.event instanceof MouseEvent)) {
                  onSelectSku(
                    product.sku,
                    !isChecked,
                    index,
                    false,
                    visibleProducts,
                  )
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectSku(
                  product.sku,
                  !isChecked,
                  index,
                  e.shiftKey,
                  visibleProducts,
                );
              }}
              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <div className="font-mono text-[10px] text-muted-foreground truncate flex-1 uppercase tracking-tight">
                {product.sku}
              </div>
              {price !== undefined && (
                <div className="text-sm font-bold text-primary">
                  ${price.toFixed(2)}
                </div>
              )}
            </div>
            <div
              className={`text-sm font-medium line-clamp-2 mt-0.5 ${isSelected ? "text-primary" : ""}`}
            >
              {name}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {Object.keys(product.sources || {})
                .filter((key) => !key.startsWith("_"))
                .map((key) => (
                  <Badge
                    key={key}
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 font-normal bg-muted text-muted-foreground border-none"
                  >
                    {key}
                  </Badge>
                ))}
              {sourceCount === 0 && (
                <span className="text-[10px] text-muted-foreground">
                  —
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 border rounded-lg overflow-hidden bg-background shadow-sm">
      {/* Left Column: Product List */}
      <div className="w-56 border-r flex flex-col shrink-0 bg-muted/5 overflow-hidden">
        <div className="p-3 border-b bg-card flex items-center gap-2">
          <PipelineSearchField
            value={search || ""}
            onChange={(value) => onSearchChange?.(value)}
            className="flex-1"
          />
          {filters && onFilterChange && (
            <PipelineFilters
              filters={filters}
              onFilterChange={onFilterChange}
              availableSources={availableSources}
              showSourceFilter
              className="h-9 w-9 shrink-0 p-0 flex items-center justify-center"
            />
          )}
        </div>
        <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
          {groupedProducts && groupedProducts.cohortIds.length > 1 ? (
            <Accordion type="multiple" className="divide-y divide-border/50">
              {groupedProducts.cohortIds.map((cohortId) => {
                const groupProducts = groupedProducts.groups[cohortId] || [];
                if (groupProducts.length === 0) return null;
                
                const allSelected = groupProducts.every(p => selectedSkus.has(p.sku));
                const someSelected = groupProducts.some(p => selectedSkus.has(p.sku)) && !allSelected;

                return (
                  <AccordionItem 
                    key={cohortId} 
                    value={cohortId}
                    className="border-b border-border/80"
                  >
                    <div className="flex items-center hover:bg-muted/40 bg-muted/20 pr-1 group">
                      <div className="pl-3 py-1.5 flex items-center">
                        <Checkbox
                          checked={allSelected ? true : someSelected ? "indeterminate" : false}
                          onCheckedChange={(checked) => {
                            const cohortSkus = groupProducts.map(p => p.sku);
                            if (checked) {
                              onSelectAll?.(cohortSkus);
                            } else {
                              onDeselectAll?.(cohortSkus);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="data-[state=checked]:bg-brand-forest-green data-[state=checked]:border-brand-forest-green"
                        />
                      </div>
                      <AccordionTrigger className="flex-1 px-3 py-1.5 hover:no-underline [&[data-state=open]>div>svg]:rotate-90">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 text-muted-foreground" />
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className="font-bold text-xs uppercase tracking-wider text-foreground/80 truncate">
                              {formatPipelineBatchLabel(
                                cohortId,
                                groupedProducts?.names?.[cohortId] || null,
                              )}
                            </span>
                          </div>
                        </div>
                      </AccordionTrigger>

                      <div className="flex items-center gap-1.5 shrink-0 ml-auto pr-2">
                        {cohortBrands[cohortId] && (
                          <Badge variant="outline" className="h-4 text-[9px] px-1 font-bold border-brand-forest-green/30 text-brand-forest-green bg-brand-forest-green/5">
                            {cohortBrands[cohortId]}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="h-4 text-[9px] px-1 bg-muted text-muted-foreground font-normal">
                          {groupProducts.length}
                        </Badge>
                        {cohortId !== "ungrouped" && onEditCohort && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 text-muted-foreground hover:text-brand-forest-green"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onEditCohort(
                                cohortId,
                                groupedProducts?.names?.[cohortId] || null,
                                cohortBrands[cohortId] || null
                              );
                            }}
                          >
                            <Edit2 className="h-2.5 w-2.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <AccordionContent className="pb-0">
                      <div className="divide-y divide-border/30 bg-muted/5">
                        {groupProducts.map((product, index) => renderProductItem(product, index, groupProducts))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          ) : (
            <div className="divide-y">
              {sortedProducts.map((product, index) => renderProductItem(product, index, sortedProducts))}
              {sortedProducts.length === 0 && (
                <div className="p-12 text-center text-muted-foreground text-sm">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  No products found matching your search.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Scraped Details */}
      <div className="flex-1 flex flex-col bg-background overflow-hidden">
        {selectedProduct ? (
          <>
            {/* Header & Source Switcher */}
            <div className="bg-card border-b flex-shrink-0 z-10">
              <div className="p-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <h2 className="text-lg font-bold tracking-tight line-clamp-1">
                      {selectedProduct.consolidated?.name ||
                        selectedProduct.input?.name}
                    </h2>
                    <div className="text-xs text-muted-foreground font-mono flex items-center gap-2">
                      <span className="bg-muted px-1 rounded">{selectedProduct.sku}</span>
                      <span>•</span>
                      <span className="font-bold text-primary">
                        ${Number(currentSourceData?.price || selectedProduct.input?.price || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => onRefresh(true)}>
                    Refresh Data
                  </Button>
                </div>
              </div>

              {sourceKeys.length > 0 ? (
                <div className="px-4 pb-2 flex items-center justify-between gap-4">
                  <Tabs
                    value={activeSource}
                    onValueChange={setPreferredSource}
                    className="flex-1"
                  >
                    <TabsList className="h-8 justify-start bg-muted/50 p-1 w-fit">
                      {sourceKeys.map((key) => (
                        <TabsTrigger
                          key={key}
                          value={key}
                          className="text-[10px] px-3 h-6 uppercase font-bold tracking-wider"
                        >
                          {key}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive h-8 px-3 hover:bg-destructive/10"
                    onClick={() => handleDeleteSourceClick(activeSource)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove source
                  </Button>
                </div>
              ) : (
                <div className="px-4 pb-3">
                  <div className="flex items-center gap-2 text-amber-600 bg-amber-50/50 p-2 rounded-lg border border-amber-100/50">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-xs font-medium">
                      No results for this SKU yet.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Product Result Display */}
            <div
              key={`${selectedSku}-${activeSource}`}
              className="flex-1 overflow-y-auto p-6"
            >
              {currentSourceData ? (
                <div className="max-w-4xl mx-auto space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left side: Image Carousel */}
                    <div className="space-y-4">
                      <div className="aspect-square rounded-xl border bg-muted/30 flex items-center justify-center overflow-hidden relative group">
                        {currentSourceData.images && currentSourceData.images.length > 0 ? (
                          <>
                            <img
                              src={currentSourceData.images[currentImageIndex]}
                              alt={currentSourceData.title || currentSourceData.name}
                              className="w-full h-full object-contain transition-all duration-300"
                              data-testid="scraped-primary-image"
                              onError={() => handleImageError(currentSourceData.images?.[currentImageIndex])}
                            />
                            
                            {/* Navigation Arrows */}
                            {currentSourceData.images.length > 1 && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentImageIndex((prev) => 
                                      prev === 0 ? currentSourceData.images!.length - 1 : prev - 1
                                    );
                                  }}
                                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-card/80 hover:bg-card p-1.5 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity border"
                                >
                                  <ChevronLeft className="h-5 w-5 text-primary" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentImageIndex((prev) => 
                                      prev === currentSourceData.images!.length - 1 ? 0 : prev + 1
                                    );
                                  }}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-card/80 hover:bg-card p-1.5 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity border"
                                >
                                  <ChevronRight className="h-5 w-5 text-primary" />
                                </button>
                                
                                {/* Image Counter Overlay */}
                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-card/60 backdrop-blur-sm px-2 py-0.5 rounded-full text-[10px] font-bold text-primary border shadow-sm">
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
                            onError={() => handleImageError(currentSourceData.image_url)}
                          />
                        ) : (
                          <div className="flex flex-col items-center text-muted-foreground">
                            <ImageIcon className="h-12 w-12 mb-2 opacity-20" />
                            <span className="text-xs">No image available</span>
                          </div>
                        )}
                        
                        {currentSourceData.url && (
                          <a
                            href={currentSourceData.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute top-2 right-2 bg-card/80 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border"
                          >
                            <ExternalLink className="h-4 w-4 text-primary" />
                          </a>
                        )}
                      </div>

                      {/* Thumbnails */}
                      {currentSourceData.images && currentSourceData.images.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                          {currentSourceData.images.map((img, i) => (
                            <div
                              key={i}
                              onClick={() => setCurrentImageIndex(i)}
                              className={`aspect-square w-14 rounded-md border-2 overflow-hidden bg-muted/20 cursor-pointer transition-all flex-shrink-0 ${
                                currentImageIndex === i ? "border-primary ring-2 ring-primary/10" : "border-transparent opacity-60 hover:opacity-100"
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
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <div className="flex justify-between items-baseline">
                          <Badge
                            variant="outline"
                            className="text-primary border-primary/20 bg-primary/5"
                          >
                            {activeSource.toUpperCase()} RESULT
                          </Badge>
                          {currentSourceData.price && (
                            <span className="text-3xl font-black text-primary">
                              $
                              {typeof currentSourceData.price === "number"
                                ? currentSourceData.price.toFixed(2)
                                : currentSourceData.price}
                            </span>
                          )}
                        </div>
                        <h1 className="text-2xl font-bold leading-tight">
                          {currentSourceData.title ||
                            currentSourceData.name ||
                            "Untitled Product"}
                        </h1>
                        <div className="flex flex-wrap items-center gap-y-2 gap-x-4">
                          {currentSourceData.brand && (
                            <p className="text-sm font-medium text-muted-foreground">
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
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-100 hover:bg-sky-100 transition-colors uppercase tracking-widest"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              View Source
                            </a>
                          )}
                        </div>
                      </div>

                      <Separator />

                      {/* Technical Specs Grid */}
                      <div className="grid grid-cols-2 gap-4 text-sm bg-muted/20 p-4 rounded-xl border">
                        <div className="space-y-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                              Manufacturer Product #
                            </span>
                            <span className="font-mono text-foreground truncate">
                              {currentSourceData.manufacturer_part_number ||
                                currentSourceData.item_number ||
                                "N/A"}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                              Weight / Size
                            </span>
                            <span className="text-foreground">
                              {currentSourceData.weight ||
                                currentSourceData.size ||
                                currentSourceData.unit_of_measure ||
                                "N/A"}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                              UPC / Barcode
                            </span>
                            <span className="font-mono text-foreground">
                              {currentSourceData.upc || "N/A"}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                              Status
                            </span>
                            <span className="text-foreground truncate uppercase font-bold text-[10px] tracking-tighter">
                              {currentSourceData.availability || "Unknown"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                          Description
                        </h3>
                        <div className="relative">
                          <div
                            className={`text-sm leading-relaxed text-muted-foreground prose prose-sm max-w-none transition-all duration-300 ${
                              isDescriptionExpanded ? "" : "line-clamp-6"
                            }`}
                          >
                            {currentSourceData.description ? (
                              <div
                                dangerouslySetInnerHTML={{
                                  __html: currentSourceData.description,
                                }}
                              />
                            ) : (
                              <p className="italic">
                                No description provided by source.
                              </p>
                            )}
                          </div>
                          {currentSourceData.description && currentSourceData.description.length > 300 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-2 text-xs h-7 text-primary hover:text-primary hover:bg-primary/5"
                              onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                            >
                              {isDescriptionExpanded ? "Show Less" : "Show More"}
                            </Button>
                          )}
                        </div>
                      </div>

                      {currentSourceData.url && (
                        <Button
                          className="w-full bg-primary hover:bg-primary/90"
                          asChild
                        >
                          <a
                            href={currentSourceData.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Visit Source Website
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Extra Data / Raw View */}
                  <div className="pt-8">
                    <Separator className="mb-8" />
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Technical Details (Raw Data)
                      </h3>
                      <div className="bg-muted/30 rounded-lg p-4 font-mono text-xs overflow-x-auto border">
                        <pre>
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
                <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
                  <Package className="h-16 w-16 mb-4 opacity-10" />
                  <h3 className="text-xl font-medium">
                    No results for {activeSource}
                  </h3>
                  <p>
                    Try selecting a different source or re-scraping this
                    product.
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <Package className="h-16 w-16 mb-4 opacity-10" />
            <h3 className="text-xl font-medium">Select a product</h3>
            <p>Choose a product from the list to view its scraped results.</p>
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
