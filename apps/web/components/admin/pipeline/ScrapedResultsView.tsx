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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { PipelineFilters } from "./PipelineFilters";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import { PipelineSearchField } from "./PipelineSearchField";
import { PipelineSidebarTable } from "./PipelineSidebarTable";

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
  isSearching?: boolean;
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
  isSearching = false,
  groupedProducts,
  cohortBrands = {},
  onEditCohort,
}: ScrapedResultsViewProps) {
  // 1. Data Transformation & Memoized State
  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => a.sku.localeCompare(b.sku));
  }, [products]);

  // 2. Primary Selection State
  const [preferredSku, setPreferredSku] = useState<string | null>(
    sortedProducts.length > 0 ? sortedProducts[0].sku : null,
  );

  const selectedProduct = useMemo(() => {
    return sortedProducts.find((p) => p.sku === preferredSku) || null;
  }, [sortedProducts, preferredSku]);

  const sources = selectedProduct?.sources || EMPTY_SOURCES;
  const sourceKeys = Object.keys(sources).filter((k) => !k.startsWith("_"));

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

  // 4. Callbacks
  const handleImageError = useCallback(
    (imageUrl: string | undefined) => {
      const productId = selectedProduct?.sku;
      const normalizedImageUrl = imageUrl?.trim();

      if (!productId || !normalizedImageUrl) return;

      const retryKey = `${productId}:${normalizedImageUrl}`;
      const now = Date.now();
      const lastAttemptAt = imageRetryAttemptTimestamps.get(retryKey);

      if (typeof lastAttemptAt === "number" && now - lastAttemptAt < IMAGE_RETRY_DEBOUNCE_MS) return;

      imageRetryAttemptTimestamps.set(retryKey, now);

      void fetch("/api/admin/scraping/retry-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: productId,
          image_url: normalizedImageUrl,
        }),
      }).catch(err => console.warn("[ScrapedResultsView] Image retry error:", err));
    },
    [selectedProduct?.sku],
  );

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
      const nextStatus = Object.keys(cleanedSources).length === 0 ? "imported" : undefined;
      const res = await fetch(`/api/admin/pipeline/${encodeURIComponent(selectedProduct.sku)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: newSources,
          ...(nextStatus ? { pipeline_status: nextStatus } : {}),
        }),
      });
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

  // 5. Effects
  return (
    <div className="flex h-full min-h-0 border-4 border-zinc-950 rounded-none overflow-hidden bg-white shadow-[8px_8px_0px_rgba(0,0,0,1)] max-w-full">
      {/* Left Column: Product List */}
      <div className="w-80 min-w-[320px] max-w-[320px] border-r-4 border-zinc-950 flex flex-col shrink-0 bg-zinc-50 overflow-hidden">
        <div className="flex items-center gap-2 border-b-4 border-zinc-950 bg-white p-3">
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
              className="h-9 w-9 shrink-0 p-0 border-2 border-zinc-950 shadow-[2px_2px_0px_rgba(0,0,0,1)]"
            />
          ) : null}
        </div>
        
        <PipelineSidebarTable
          products={sortedProducts}
          groupedProducts={groupedProducts}
          cohortBrands={cohortBrands}
          selectedSkus={selectedSkus}
          preferredSku={preferredSku}
          onSelectSku={onSelectSku}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
          onPreferredSkuChange={setPreferredSku}
          variant="scraped"
          onEditCohort={onEditCohort}
        />
      </div>

      {/* Right Column: Scraped Details */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {selectedProduct ? (
          <>
            {/* Header & Source Switcher */}
            <div className="bg-white border-b-4 border-zinc-950 flex-shrink-0 z-10">
              <div className="p-4 flex justify-between items-center">
                <div className="flex items-center gap-3 min-w-0">
                  <Package className="h-5 w-5 text-zinc-500 shrink-0" />
                  <div className="min-w-0">
                    <h2 className="text-xl font-black uppercase tracking-tighter text-zinc-950 line-clamp-1" title={selectedProduct.consolidated?.name || selectedProduct.input?.name || ""}>
                      {selectedProduct.consolidated?.name ||
                        selectedProduct.input?.name}
                    </h2>
                    <div className="text-[10px] font-black uppercase tracking-tighter text-zinc-500 flex items-center gap-2">
                      <span className="bg-zinc-100 border border-zinc-950 px-1.5 py-0.5 rounded-none">{selectedProduct.sku}</span>
                      <span>•</span>
                      <span className="font-black text-zinc-950">
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
                    className="h-8 w-8 p-0 rounded-none border-2 border-zinc-950 shadow-[2px_2px_0px_rgba(0,0,0,1)] flex items-center justify-center"
                    title="Refresh Data"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {sourceKeys.length > 0 ? (
                <div className="px-4 pb-4 flex items-center justify-between gap-4">
                  <Tabs
                    value={activeSource}
                    onValueChange={setPreferredSource}
                    className="flex-1"
                  >
                    <TabsList className="h-9 justify-start bg-zinc-100 rounded-none border-2 border-zinc-950 p-1 w-fit">
                      {sourceKeys.map((key) => (
                        <TabsTrigger
                          key={key}
                          value={key}
                          className="text-[10px] px-4 h-7 uppercase font-black tracking-tighter rounded-none data-[state=active]:bg-zinc-950 data-[state=active]:text-white data-[state=active]:shadow-none"
                        >
                          {key}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 h-8 px-3 hover:bg-red-50 font-black uppercase tracking-tighter text-[10px] rounded-none border-2 border-transparent hover:border-red-600"
                    onClick={() => handleDeleteSourceClick(activeSource)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove source
                  </Button>
                </div>
              ) : (
                <div className="px-4 pb-4">
                  <div className="flex items-center gap-2 text-amber-950 bg-amber-50 p-3 rounded-none border-2 border-amber-950 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-[10px] font-black uppercase tracking-tighter">
                      No results for this SKU yet.
                    </span>
                  </div>
                </div>              )}
            </div>

            {/* Product Result Display */}
            <div
              key={`${preferredSku}-${activeSource}`}
              className="flex-1 overflow-y-auto p-6"
            >
              {currentSourceData ? (
                <div className="max-w-4xl mx-auto space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left side: Image Carousel */}
                    <div className="space-y-4">
                      <div className="aspect-square rounded-none border-4 border-zinc-950 bg-zinc-50 flex items-center justify-center overflow-hidden relative group shadow-[4px_4px_0px_rgba(0,0,0,1)]">
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
                                  aria-label="Previous image"
                                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-white hover:bg-zinc-100 p-1.5 rounded-none shadow-[2px_2px_0px_rgba(0,0,0,1)] opacity-0 group-hover:opacity-100 transition-opacity border-2 border-zinc-950"
                                >
                                  <ChevronLeft className="h-5 w-5 text-zinc-950" aria-hidden="true" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentImageIndex((prev) => 
                                      prev === currentSourceData.images!.length - 1 ? 0 : prev + 1
                                    );
                                  }}
                                  aria-label="Next image"
                                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white hover:bg-zinc-100 p-1.5 rounded-none shadow-[2px_2px_0px_rgba(0,0,0,1)] opacity-0 group-hover:opacity-100 transition-opacity border-2 border-zinc-950"
                                >
                                  <ChevronRight className="h-5 w-5 text-zinc-950" aria-hidden="true" />
                                </button>
                                
                                {/* Image Counter Overlay */}
                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-white px-2 py-0.5 rounded-none text-[10px] font-black uppercase tracking-tighter text-zinc-950 border-2 border-zinc-950 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
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
                          <div className="flex flex-col items-center text-zinc-400">
                            <ImageIcon className="h-12 w-12 mb-2 opacity-20" />
                            <span className="text-xs font-black uppercase tracking-tighter">No image available</span>
                          </div>
                        )}
                        
                        {currentSourceData.url && (
                          <a
                            href={currentSourceData.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute top-2 right-2 bg-white p-2 rounded-none opacity-0 group-hover:opacity-100 transition-opacity shadow-[2px_2px_0px_rgba(0,0,0,1)] border-2 border-zinc-950"
                          >
                            <ExternalLink className="h-4 w-4 text-zinc-950" />
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
                              className={`aspect-square w-14 rounded-none border-2 overflow-hidden bg-zinc-50 cursor-pointer transition-all flex-shrink-0 ${
                                currentImageIndex === i ? "border-zinc-950 ring-2 ring-zinc-950/10" : "border-zinc-200 opacity-60 hover:opacity-100 hover:border-zinc-950"
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
                            className="bg-zinc-950 text-white border-2 border-zinc-950 rounded-none font-black uppercase tracking-tighter text-[9px]"
                          >
                            {activeSource.toUpperCase()} RESULT
                          </Badge>
                          {currentSourceData.price && (
                            <span className="text-3xl font-black text-zinc-950">
                              $
                              {typeof currentSourceData.price === "number"
                                ? currentSourceData.price.toFixed(2)
                                : currentSourceData.price}
                            </span>
                          )}
                        </div>
                        <h1 className="text-2xl font-black uppercase tracking-tighter text-zinc-950 leading-tight">
                          {currentSourceData.title ||
                            currentSourceData.name ||
                            "Untitled Product"}
                        </h1>
                        <div className="flex flex-wrap items-center gap-y-2 gap-x-4">
                          {currentSourceData.brand && (
                            <p className="text-xs font-black uppercase tracking-tighter text-zinc-500">
                              Brand:{" "}
                              <span className="text-zinc-950">
                                {currentSourceData.brand}
                              </span>
                            </p>
                          )}
                          {currentSourceData.url && (
                            <a
                              href={currentSourceData.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-none text-[11px] font-black bg-zinc-100 text-zinc-950 border-2 border-zinc-950 hover:bg-zinc-200 transition-colors uppercase tracking-tighter shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              View Source
                            </a>
                          )}
                        </div>
                      </div>

                      <Separator className="h-1 bg-zinc-950" />

                      {/* Technical Specs Grid */}
                      <div className="grid grid-cols-2 gap-4 text-sm bg-white p-4 rounded-none border-4 border-zinc-950 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                        <div className="space-y-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-black text-zinc-500 tracking-tighter">
                              Manufacturer Product #
                            </span>
                            <span className="font-bold text-zinc-950 truncate uppercase tracking-tighter text-xs">
                              {currentSourceData.manufacturer_part_number ||
                                currentSourceData.item_number ||
                                "N/A"}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-black text-zinc-500 tracking-tighter">
                              Weight / Size
                            </span>
                            <span className="text-zinc-950 font-bold uppercase tracking-tighter text-xs">
                              {currentSourceData.weight ||
                                currentSourceData.size ||
                                currentSourceData.unit_of_measure ||
                                "N/A"}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-black text-zinc-500 tracking-tighter">
                              UPC / Barcode
                            </span>
                            <span className="text-zinc-950 font-bold uppercase tracking-tighter text-xs">
                              {currentSourceData.upc || "N/A"}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-black text-zinc-500 tracking-tighter">
                              Status
                            </span>
                            <span className="text-zinc-950 truncate uppercase font-black text-[10px] tracking-tighter">
                              {currentSourceData.availability || "Unknown"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-xs font-black uppercase tracking-tighter text-zinc-950">
                          Description
                        </h3>
                        <div className="relative">
                          <div
                            className={`text-sm leading-relaxed text-zinc-700 prose prose-sm max-w-none transition-all duration-300 ${
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
                              <p className="italic text-xs font-black uppercase tracking-tighter text-zinc-500">
                                No description provided by source.
                              </p>
                            )}
                          </div>
                          {currentSourceData.description && currentSourceData.description.length > 300 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-2 text-[10px] h-7 text-zinc-950 hover:bg-zinc-100 font-black uppercase tracking-tighter rounded-none border-2 border-zinc-950"
                              onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                            >
                              {isDescriptionExpanded ? "Show Less" : "Show More"}
                            </Button>
                          )}
                        </div>
                      </div>

                      {currentSourceData.url && (
                        <Button
                          className="w-full bg-zinc-950 hover:bg-zinc-800 text-white rounded-none border-b-4 border-r-4 border-zinc-700 active:border-0 transition-all font-black uppercase tracking-tighter"
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
                      <h3 className="text-xs font-black uppercase tracking-tighter text-zinc-500 flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Technical Details (Raw Data)
                      </h3>
                      <div className="bg-zinc-50 rounded-none p-4 font-mono text-[10px] overflow-x-auto border-4 border-zinc-950 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
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
                <div className="flex flex-col items-center justify-center py-24 text-center text-zinc-500">
                  <Package className="h-16 w-16 mb-4 opacity-20" />
                  <h3 className="text-xl font-black uppercase tracking-tighter text-zinc-950">
                    No results for {activeSource}
                  </h3>
                  <p className="text-sm font-black uppercase tracking-tighter mt-2">
                    Try selecting a different source or re-scraping this
                    product.
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-zinc-500">
            <Package className="h-16 w-16 mb-4 opacity-20" />
            <h3 className="text-xl font-black uppercase tracking-tighter text-zinc-950">Select a product</h3>
            <p className="text-sm font-black uppercase tracking-tighter mt-2">Choose a product from the list to view its scraped results.</p>
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
