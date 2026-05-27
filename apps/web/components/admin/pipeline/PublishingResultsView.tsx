"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Globe,
  AlertTriangle,
  CheckCircle,
  Database,
  Image as ImageIcon,
  Tag,
  Info,
  ChevronRight,
  FileSpreadsheet,
  FileCode,
  Archive,
  RefreshCw,
  AlertCircle,
  Search
} from "lucide-react";
import type { PipelineProduct } from "@/lib/pipeline/types";
import type { PreparedShopSiteExportProduct } from "@/lib/shopsite/mapping";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { adminFetch } from "@/lib/admin/api-client";
import { PipelineSearchField } from "./PipelineSearchField";
import { SHOPSITE_PAGES } from "@/lib/shopsite/constants";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface PublishingResultsViewProps {
  products: PipelineProduct[];
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
  selectedUpcs: Set<string>;
  onSelectUpc: (upc: string, selected: boolean) => void;
  onSelectAll: (upcs: string[]) => void;
  onClearSelection: () => void;
  isLoading?: boolean;
}

interface ValidationIssue {
  type: "error" | "warning";
  field: string;
  message: string;
}

export function PublishingResultsView({
  products,
  onRefresh,
  search,
  onSearchChange,
  filters,
  onFilterChange,
  availableSources = [],
  selectedUpcs,
  onSelectUpc,
  onSelectAll,
  onClearSelection,
  isLoading = false,
}: PublishingResultsViewProps) {
  const [mappings, setMappings] = useState<Record<string, PreparedShopSiteExportProduct>>({});
  const [isMappingLoading, setIsMappingLoading] = useState(false);
  const [selectedUpc, setSelectedUpc] = useState<string | null>(null);
  const [exportActionState, setExportActionState] = useState<"idle" | "upload" | "zip" | "xml" | "excel">("idle");
  const [filterType, setFilterType] = useState<"all" | "ready" | "warnings" | "errors">("all");

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => a.upc.localeCompare(b.upc));
  }, [products]);

  const [isPagesDialogOpen, setIsPagesDialogOpen] = useState(false);
  const [pagesSearch, setPagesSearch] = useState("");
  const [editingPages, setEditingPages] = useState<string[]>([]);
  const [isSavingPages, setIsSavingPages] = useState(false);

  const handleOpenPagesDialog = () => {
    if (!selectedProductMapping) return;
    setEditingPages(selectedProductMapping.shopsite_pages || []);
    setPagesSearch("");
    setIsPagesDialogOpen(true);
  };

  const handleSavePages = async () => {
    if (!selectedProduct) return;
    setIsSavingPages(true);
    try {
      const updatedConsolidated = {
        ...(selectedProduct.consolidated && typeof selectedProduct.consolidated === 'object'
          ? (selectedProduct.consolidated as Record<string, any>)
          : {}),
        shopsite_pages: editingPages,
      };

      const res = await adminFetch(`/api/admin/pipeline/${selectedProduct.upc}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consolidated: updatedConsolidated }),
      });

      if (res.ok) {
        toast.success("ShopSite pages updated successfully");
        setMappings(prev => {
          const sku = selectedProduct.upc;
          const currentMapping = prev[sku];
          if (!currentMapping) return prev;
          return {
            ...prev,
            [sku]: {
              ...currentMapping,
              shopsite_pages: editingPages,
            }
          };
        });
        setIsPagesDialogOpen(false);
        onRefresh(true);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to update ShopSite pages");
      }
    } catch (err) {
      console.error("[SavePages] Error:", err);
      toast.error("Error updating ShopSite pages");
    } finally {
      setIsSavingPages(false);
    }
  };

  // Set default selected product on mount or products change
  useEffect(() => {
    if (sortedProducts.length > 0 && !selectedUpc) {
      setSelectedUpc(sortedProducts[0].upc);
    }
  }, [sortedProducts, selectedUpc]);

  // Fetch mapped previews from /api/admin/pipeline/export-preview
  const fetchMappings = useCallback(async (upcsList?: string[]) => {
    setIsMappingLoading(true);
    try {
      const res = await adminFetch("/api/admin/pipeline/export-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(upcsList ? { upcs: upcsList } : {}),
      });

      if (res.ok) {
        const data = await res.json();
        const newMappings: Record<string, PreparedShopSiteExportProduct> = {};
        if (data.products && Array.isArray(data.products)) {
          data.products.forEach((p: PreparedShopSiteExportProduct) => {
            newMappings[p.sku] = p;
          });
        }
        setMappings(newMappings);
      } else {
        toast.error("Failed to load ShopSite mapping preview");
      }
    } catch (err) {
      console.error("[FetchMappings] Error:", err);
      toast.error("Error loading ShopSite mapping preview");
    } finally {
      setIsMappingLoading(false);
    }
  }, []);

  // Fetch mappings when products list changes
  useEffect(() => {
    if (products.length > 0) {
      const upcsList = products.map(p => p.upc);
      void fetchMappings(upcsList);
    } else {
      setMappings({});
    }
  }, [products, fetchMappings]);

  // Helper to validate product mapping
  const getProductValidation = useCallback((
    product: PipelineProduct,
    mapping?: PreparedShopSiteExportProduct
  ): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];

    // Price validation
    const price = mapping?.price ?? product.consolidated?.price ?? product.input?.price;
    if (price === null || price === undefined || Number(price) <= 0) {
      issues.push({
        type: "error",
        field: "Price",
        message: "Price is missing or <= 0. Product cannot be sold.",
      });
    }

    // ShopSite Pages validation
    const pages = mapping?.shopsite_pages ?? [];
    if (pages.length === 0) {
      issues.push({
        type: "warning",
        field: "ShopSite Pages",
        message: "No ShopSite pages mapped. The product will be orphaned (hidden).",
      });
    }

    // Brand validation
    const brand = mapping?.brand_name ?? product.consolidated?.brand ?? product.input?.brand;
    if (!brand || brand.trim().toLowerCase() === "unbranded") {
      issues.push({
        type: "warning",
        field: "Brand",
        message: "No brand name detected; mapped to default 'unbranded' folder.",
      });
    }

    // Description validation
    const desc = mapping?.description ?? product.consolidated?.description ?? product.input?.description;
    if (!desc || desc.trim().length === 0) {
      issues.push({
        type: "warning",
        field: "Description",
        message: "Description is empty.",
      });
    }

    // Images validation
    const images = mapping?.images ?? [];
    if (images.length === 0) {
      issues.push({
        type: "error",
        field: "Images",
        message: "No product images are selected.",
      });
    }

    return issues;
  }, []);

  // Filter products based on health type
  const filteredProducts = useMemo(() => {
    return sortedProducts.filter(p => {
      const mapping = mappings[p.upc];
      const issues = getProductValidation(p, mapping);
      const hasError = issues.some(i => i.type === "error");
      const hasWarning = issues.some(i => i.type === "warning");

      if (filterType === "ready") return !hasError && !hasWarning;
      if (filterType === "warnings") return !hasError && hasWarning;
      if (filterType === "errors") return hasError;
      return true;
    });
  }, [sortedProducts, mappings, filterType, getProductValidation]);

  // Selected product details
  const selectedProduct = useMemo(() => {
    return sortedProducts.find(p => p.upc === selectedUpc) || null;
  }, [sortedProducts, selectedUpc]);

  const selectedProductMapping = useMemo(() => {
    if (!selectedUpc) return null;
    return mappings[selectedUpc] || null;
  }, [mappings, selectedUpc]);

  const selectedProductIssues = useMemo(() => {
    if (!selectedProduct) return [];
    return getProductValidation(selectedProduct, selectedProductMapping || undefined);
  }, [selectedProduct, selectedProductMapping, getProductValidation]);

  // Download logic helper
  const triggerDownload = useCallback((url: string, filename: string, body?: string) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.responseType = "blob";
    xhr.setRequestHeader("Content-Type", "application/json");
    
    xhr.onload = function () {
      if (xhr.status === 200) {
        const blob = xhr.response as Blob;
        const link = document.createElement("a");
        link.href = window.URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        toast.error(`Download failed with status ${xhr.status}`);
      }
    };
    
    xhr.onerror = function () {
      toast.error("Network error during download");
    };

    xhr.send(body || JSON.stringify({}));
  }, []);

  // Action: Upload to ShopSite
  const handleShopSiteUpload = async () => {
    const upcs = selectedUpcs.size > 0 ? Array.from(selectedUpcs) : sortedProducts.map(p => p.upc);
    if (upcs.length === 0) {
      toast.error("No products selected to upload");
      return;
    }

    setExportActionState("upload");
    try {
      const res = await adminFetch("/api/admin/pipeline/upload-shopsite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upcs }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || "Failed to sync products to ShopSite");
      }

      toast.success("ShopSite direct upload complete", {
        description: `Successfully synced ${payload.uploadedCount || upcs.length} products to ShopSite!`,
      });

      // Automatically trigger image ZIP download
      toast.info("Downloading image ZIP manifest...");
      triggerDownload(
        "/api/admin/pipeline/export-zip",
        "shopsite-images.zip",
        JSON.stringify({ upcs, includeExportedSelection: true })
      );

      onClearSelection();
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to upload to ShopSite");
    } finally {
      setExportActionState("idle");
    }
  };

  // Action: ZIP Export (Images + XML)
  const handleZipExport = () => {
    const upcs = selectedUpcs.size > 0 ? Array.from(selectedUpcs) : sortedProducts.map(p => p.upc);
    if (upcs.length === 0) {
      toast.error("No products selected to export");
      return;
    }

    setExportActionState("zip");
    try {
      triggerDownload(
        "/api/admin/pipeline/export-zip",
        "shopsite-export.zip",
        JSON.stringify({ upcs, includeExportedSelection: true })
      );
      toast.success("ShopSite ZIP export started", {
        description: "Your download containing the XML feed and resized images will begin shortly.",
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate ShopSite ZIP");
    } finally {
      setExportActionState("idle");
    }
  };

  // Action: XML Export
  const handleXmlExport = () => {
    const upcs = selectedUpcs.size > 0 ? Array.from(selectedUpcs) : sortedProducts.map(p => p.upc);
    if (upcs.length === 0) {
      toast.error("No products selected to export");
      return;
    }

    setExportActionState("xml");
    try {
      triggerDownload(
        "/api/admin/pipeline/export-xml",
        "shopsite-products.xml",
        JSON.stringify({ upcs })
      );
      toast.success("XML feed generated", {
        description: "Downloaded shopsite-products.xml file.",
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate XML feed");
    } finally {
      setExportActionState("idle");
    }
  };

  // Action: Excel Export
  const handleExcelExport = () => {
    const upcs = selectedUpcs.size > 0 ? Array.from(selectedUpcs) : sortedProducts.map(p => p.upc);
    if (upcs.length === 0) {
      toast.error("No products selected to export");
      return;
    }

    setExportActionState("excel");
    try {
      triggerDownload(
        "/api/admin/pipeline/export",
        "products-export.xlsx",
        JSON.stringify({ upcs })
      );
      toast.success("Excel sheet generated", {
        description: "Downloaded products-export.xlsx file.",
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate Excel sheet");
    } finally {
      setExportActionState("idle");
    }
  };

  // Toggle selection for all filtered products
  const handleToggleSelectAll = () => {
    const allFilteredUpcs = filteredProducts.map(p => p.upc);
    const allSelected = allFilteredUpcs.every(upc => selectedUpcs.has(upc));

    if (allSelected) {
      // Deselect all filtered
      allFilteredUpcs.forEach(upc => onSelectUpc(upc, false));
    } else {
      // Select all filtered
      allFilteredUpcs.forEach(upc => onSelectUpc(upc, true));
    }
  };

  const isAllFilteredSelected = filteredProducts.length > 0 && 
    filteredProducts.every(p => selectedUpcs.has(p.upc));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {/* Control Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">
            {selectedUpcs.size > 0 
              ? `${selectedUpcs.size} selected for export` 
              : "Export entire queue"}
          </span>
          {selectedUpcs.size > 0 && (
            <Button variant="ghost" size="sm" onClick={onClearSelection} className="h-7 text-xs px-2">
              Clear Selection
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* ShopSite Direct Upload */}
          <Button 
            onClick={handleShopSiteUpload}
            disabled={exportActionState !== "idle" || isLoading}
            className="bg-emerald-600 text-white hover:bg-emerald-700 h-9 px-3 shadow-sm"
          >
            {exportActionState === "upload" ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Database className="mr-2 h-4 w-4" />
            )}
            Push to ShopSite
          </Button>

          {/* ZIP Export */}
          <Button 
            variant="outline"
            onClick={handleZipExport}
            disabled={exportActionState !== "idle" || isLoading}
            className="border-border hover:bg-muted h-9 px-3"
          >
            {exportActionState === "zip" ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Archive className="mr-2 h-4 w-4" />
            )}
            Download ZIP
          </Button>

          {/* XML Export */}
          <Button 
            variant="outline"
            onClick={handleXmlExport}
            disabled={exportActionState !== "idle" || isLoading}
            className="border-border hover:bg-muted h-9 px-3"
          >
            {exportActionState === "xml" ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileCode className="mr-2 h-4 w-4" />
            )}
            Download XML
          </Button>

          {/* Excel Export */}
          <Button 
            variant="outline"
            onClick={handleExcelExport}
            disabled={exportActionState !== "idle" || isLoading}
            className="border-border hover:bg-muted h-9 px-3"
          >
            {exportActionState === "excel" ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-2 h-4 w-4" />
            )}
            Excel Report
          </Button>
        </div>
      </div>

      {/* Main Workspace Grid */}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden lg:flex-row">
        {/* Left Column: Product List & Sidebar */}
        <div className="flex w-full shrink-0 flex-col border-b border-border bg-card/30 lg:w-96 lg:border-b-0 lg:border-r h-full min-h-0">
          {/* Filters and search inside sidebar */}
          <div className="flex flex-col gap-2 border-b border-border bg-card p-3">
            <PipelineSearchField
              value={search || ""}
              onChange={(value) => onSearchChange?.(value)}
              className="w-full"
              isLoading={isLoading}
            />

            {/* Verification status toggle filters */}
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1 text-xs font-medium">
              <button
                onClick={() => setFilterType("all")}
                className={cn(
                  "rounded-md py-1.5 text-center transition-all",
                  filterType === "all" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                All
              </button>
              <button
                onClick={() => setFilterType("ready")}
                className={cn(
                  "rounded-md py-1.5 text-center transition-all",
                  filterType === "ready" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Ready
              </button>
              <button
                onClick={() => setFilterType("warnings")}
                className={cn(
                  "rounded-md py-1.5 text-center transition-all",
                  filterType === "warnings" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Warn
              </button>
              <button
                onClick={() => setFilterType("errors")}
                className={cn(
                  "rounded-md py-1.5 text-center transition-all",
                  filterType === "errors" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Error
              </button>
            </div>
          </div>

          {/* Product list listview */}
          <div className="flex-1 overflow-y-auto divide-y divide-border min-h-0">
            {/* Header select-all row */}
            {filteredProducts.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2 bg-muted/40 text-xs font-semibold text-muted-foreground">
                <Checkbox
                  checked={isAllFilteredSelected}
                  onCheckedChange={handleToggleSelectAll}
                  aria-label="Select all products"
                />
                <span>Select All Visible ({filteredProducts.length})</span>
              </div>
            )}

            {isMappingLoading && products.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <RefreshCw className="h-6 w-6 animate-spin mb-2" />
                <span className="text-sm">Mapping fields...</span>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No products match this filter.
              </div>
            ) : (
              filteredProducts.map((p) => {
                const mapping = mappings[p.upc];
                const issues = getProductValidation(p, mapping);
                const hasError = issues.some(i => i.type === "error");
                const hasWarning = issues.some(i => i.type === "warning");
                const isSelected = selectedUpcs.has(p.upc);

                const brandName = mapping?.brand_name || p.consolidated?.brand || p.input?.brand || "Unbranded";
                const title = mapping?.name || p.consolidated?.name || p.input?.name || p.upc;
                const images = mapping?.image_sources || p.consolidated?.images || p.selected_images || [];
                const primaryImage = Array.isArray(images) && images.length > 0 
                  ? (typeof images[0] === 'string' ? images[0] : (images[0] as { url?: string })?.url || '')
                  : '';

                return (
                  <div
                    key={p.upc}
                    onClick={() => setSelectedUpc(p.upc)}
                    className={cn(
                      "flex items-start gap-3 p-3 cursor-pointer transition-colors hover:bg-muted/50",
                      selectedUpc === p.upc ? "bg-muted/80" : ""
                    )}
                  >
                    <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => onSelectUpc(p.upc, !!checked)}
                        aria-label={`Select ${title}`}
                      />
                    </div>

                    {/* Thumbnail Image */}
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-border bg-muted flex items-center justify-center">
                      {primaryImage ? (
                        <img
                          src={primaryImage}
                          alt={title}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span className="text-[10px] font-semibold text-muted-foreground truncate uppercase">{brandName}</span>
                      <h4 className="text-xs font-semibold text-foreground truncate">{title}</h4>
                      <span className="text-[10px] font-medium text-muted-foreground">UPC: {p.upc}</span>
                    </div>

                    {/* Status Indicator */}
                    <div className="shrink-0 pt-1">
                      {hasError ? (
                        <Badge variant="destructive" className="h-4 px-1 text-[9px] font-bold">
                          Error
                        </Badge>
                      ) : hasWarning ? (
                        <Badge className="bg-amber-500 hover:bg-amber-600 text-white h-4 px-1 text-[9px] font-bold">
                          Warn
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white h-4 px-1 text-[9px] font-bold">
                          Ready
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: ShopSite Mapping Verification Panel */}
        <div className="flex-1 flex flex-col overflow-y-auto bg-background h-full min-h-0">
          {!selectedProduct ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
              <Globe className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-base font-semibold text-foreground mb-1">ShopSite Product Verification</h3>
              <p className="text-sm max-w-md">
                Select a product from the list to verify how its fields and assets will be mapped for the live ShopSite storefront.
              </p>
            </div>
          ) : (
            <div className="p-6 flex flex-col gap-6">
              {/* Product Header */}
              <div className="flex flex-col md:flex-row gap-4 justify-between items-start border-b border-border pb-6 shrink-0">
                <div className="flex items-start gap-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted flex items-center justify-center">
                    {(() => {
                      const images = selectedProductMapping?.image_sources || selectedProduct.consolidated?.images || selectedProduct.selected_images || [];
                      const primaryImage = Array.isArray(images) && images.length > 0 
                        ? (typeof images[0] === 'string' ? images[0] : (images[0] as { url?: string })?.url || '')
                        : '';
                      return primaryImage ? (
                        <img
                          src={primaryImage}
                          alt="Primary Product"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      );
                    })()}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                      {selectedProductMapping?.brand_name || selectedProduct.consolidated?.brand || selectedProduct.input?.brand || "Unbranded"}
                    </span>
                    <h2 className="text-lg font-bold text-foreground leading-tight">
                      {selectedProductMapping?.name || selectedProduct.consolidated?.name || selectedProduct.input?.name || "Product Name"}
                    </h2>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span>UPC: <strong className="font-semibold text-foreground">{selectedProduct.upc}</strong></span>
                      <span>•</span>
                      <span>Slug: <strong className="font-mono text-[10px] text-foreground bg-muted px-1.5 py-0.5 rounded">{selectedProductMapping?.file_name || "pending.html"}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1 items-end shrink-0">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">Mapping Status</span>
                  {selectedProductIssues.length === 0 ? (
                    <Badge className="bg-emerald-600 text-white px-2.5 py-1 text-xs font-bold gap-1 shadow-sm">
                      <CheckCircle className="h-3 w-3" /> Fully Verified
                    </Badge>
                  ) : selectedProductIssues.some(i => i.type === "error") ? (
                    <Badge variant="destructive" className="px-2.5 py-1 text-xs font-bold gap-1 shadow-sm">
                      <AlertCircle className="h-3 w-3" /> Fix Critical Errors
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 text-xs font-bold gap-1 shadow-sm">
                      <AlertTriangle className="h-3 w-3" /> Needs Review
                    </Badge>
                  )}
                </div>
              </div>

              {/* Validation Issues Block */}
              {selectedProductIssues.length > 0 && (
                <div className="flex flex-col gap-2 shrink-0">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Verification Reports</h4>
                  <div className="flex flex-col gap-2">
                    {selectedProductIssues.map((issue, idx) => (
                      <Alert 
                        key={idx} 
                        variant={issue.type === "error" ? "destructive" : "default"}
                        className={cn(
                          "py-2.5 px-3.5 border text-xs",
                          issue.type === "warning" ? "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300" : ""
                        )}
                      >
                        {issue.type === "error" ? (
                          <AlertCircle className="h-4 w-4" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        )}
                        <div className="ml-2">
                          <AlertTitle className="text-xs font-bold mb-0.5 leading-none">{issue.field} Issue</AlertTitle>
                          <AlertDescription className="text-[11px] opacity-90 leading-tight">{issue.message}</AlertDescription>
                        </div>
                      </Alert>
                    ))}
                  </div>
                </div>
              )}

              {/* Mapping Details Panels */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Panel 1: Field Mappings */}
                <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-4 shadow-sm">
                  <h3 className="text-sm font-bold flex items-center gap-1.5 border-b border-border pb-2 text-foreground">
                    <Tag className="h-4 w-4 text-primary" /> ShopSite Field Assignments
                  </h3>

                  <div className="flex flex-col gap-3.5 text-xs">
                    {/* Name Mapping */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                        <span>Original Field Name</span>
                        <ChevronRight className="h-3 w-3" />
                        <span className="font-mono text-[9px] bg-muted px-1 rounded text-primary">ShopSite field: Name</span>
                      </div>
                      <span className="font-semibold text-foreground bg-background border border-border rounded p-2 text-xs truncate">
                        {selectedProductMapping?.name || "—"}
                      </span>
                    </div>

                    {/* Price & SKU Mapping */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                          <span>Price</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                          <span className="font-mono text-[9px] text-primary">Price</span>
                        </div>
                        <span className="font-semibold text-foreground bg-background border border-border rounded p-2 text-xs">
                          {selectedProductMapping?.price !== undefined && selectedProductMapping?.price !== null
                            ? `$${Number(selectedProductMapping.price).toFixed(2)}`
                            : "—"}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                          <span>UPC</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                          <span className="font-mono text-[9px] text-primary">SKU</span>
                        </div>
                        <span className="font-semibold text-foreground bg-background border border-border rounded p-2 text-xs">
                          {selectedProductMapping?.sku || "—"}
                        </span>
                      </div>
                    </div>

                    {/* Weight & Taxable Mapping */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                          <span>Weight</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                          <span className="font-mono text-[9px] text-primary">Weight</span>
                        </div>
                        <span className="font-semibold text-foreground bg-background border border-border rounded p-2 text-xs">
                          {selectedProductMapping?.weight || "—"}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                          <span>Taxable</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                          <span className="font-mono text-[9px] text-primary">Taxable</span>
                        </div>
                        <span className="font-semibold text-foreground bg-background border border-border rounded p-2 text-xs flex items-center gap-1.5">
                          {selectedProductMapping?.is_taxable ? (
                            <>
                              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Yes
                            </>
                          ) : (
                            <>
                              <span className="h-2 w-2 rounded-full bg-muted-foreground" /> No
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Brand Mapped */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                        <span>Brand Name</span>
                        <ChevronRight className="h-3 w-3" />
                        <span className="font-mono text-[9px] bg-muted px-1 rounded text-primary">ProductField16</span>
                      </div>
                      <span className="font-semibold text-foreground bg-background border border-border rounded p-2 text-xs">
                        {selectedProductMapping?.brand_name || "—"}
                      </span>
                    </div>

                    {/* Special Order Mapped */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                        <span>Special Order (Backorder)</span>
                        <ChevronRight className="h-3 w-3" />
                        <span className="font-mono text-[9px] bg-muted px-1 rounded text-primary">ProductField11</span>
                      </div>
                      <span className="font-semibold text-foreground bg-background border border-border rounded p-2 text-xs">
                        {selectedProductMapping?.is_special_order ? "Yes (Special Order)" : "No"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Panel 2: Storefront / Catalog Layout Placement */}
                <div className="flex flex-col gap-4">
                  {/* ShopSite Pages Mapping Card */}
                  <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-4 shadow-sm">
                    <h3 className="text-sm font-bold flex items-center gap-1.5 border-b border-border pb-2 text-foreground">
                      <Globe className="h-4 w-4 text-emerald-500" /> Catalog Placement (ShopSite Pages)
                    </h3>

                    <div className="flex flex-col gap-2.5 text-xs">
                      <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                        <span>Mapped ShopSite Pages</span>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleOpenPagesDialog}
                            className="h-5 px-1.5 text-[9px] text-primary hover:text-primary/80 font-bold border border-primary/20 hover:bg-primary/5 rounded"
                          >
                            Edit Pages
                          </Button>
                          <span className="font-mono text-[9px] bg-muted px-1 rounded text-primary">ProductOnPages</span>
                        </div>
                      </div>

                      {selectedProductMapping?.shopsite_pages && selectedProductMapping.shopsite_pages.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 bg-background border border-border rounded p-2 min-h-[50px]">
                          {selectedProductMapping.shopsite_pages.map((page, idx) => (
                            <Badge key={idx} variant="secondary" className="text-[10px] py-0.5 px-2 bg-emerald-50 text-emerald-800 border-emerald-100 hover:bg-emerald-100 font-medium">
                              {page}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center p-4 border border-dashed border-amber-300 rounded bg-amber-50/20 text-center text-amber-800 dark:text-amber-300 text-xs">
                          <AlertTriangle className="h-4 w-4 text-amber-500 mb-1" />
                          <span className="font-bold mb-0.5">No ShopSite Page Mapping Found</span>
                          <span className="text-[10px] opacity-80 leading-tight">This product won&apos;t be linked to any storefront pages on ShopSite.</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground bg-muted/50 p-2 rounded leading-normal">
                        <Info className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>Pages are inferred automatically from the category <strong className="text-foreground">&quot;{selectedProductMapping?.category || "Unknown"}&quot;</strong>.</span>
                      </div>
                    </div>
                  </div>

                  {/* Asset Map / Image Paths */}
                  <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-4 shadow-sm">
                    <h3 className="text-sm font-bold flex items-center gap-1.5 border-b border-border pb-2 text-foreground">
                      <ImageIcon className="h-4 w-4 text-amber-500" /> Export Asset Map (Images ZIP)
                    </h3>

                    <div className="flex flex-col gap-2.5 text-xs">
                      <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                        <span>ShopSite Target File Path</span>
                        <span className="font-mono text-[9px] bg-muted px-1 rounded text-primary">Graphic / MoreInfoGraphics</span>
                      </div>

                      {selectedProductMapping?.images && selectedProductMapping.images.length > 0 ? (
                        <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
                          {selectedProductMapping.images.map((img, idx) => (
                            <div key={idx} className="flex items-center gap-2 p-1.5 rounded border border-border bg-background">
                              <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-muted flex items-center justify-center">
                                <img
                                  src={selectedProductMapping.image_sources[idx]}
                                  alt="Mapped graphic"
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                <span className="font-semibold text-foreground text-[10px] truncate">{img}</span>
                                <span className="text-[9px] text-muted-foreground truncate">{idx === 0 ? "Primary Graphic" : `More Information Graphic ${idx}`}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 border border-dashed border-destructive/30 rounded text-center text-destructive text-xs">
                          No images mapped for export.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* Description & SEO Block */}
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-4 shadow-sm shrink-0">
                <h3 className="text-sm font-bold flex items-center gap-1.5 border-b border-border pb-2 text-foreground">
                  <FileCode className="h-4 w-4 text-blue-500" /> Product Description & Search Keywords
                </h3>

                <div className="flex flex-col gap-4 text-xs">
                  {/* Description Mapping */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                      <span>Description Content</span>
                      <span className="font-mono text-[9px] bg-muted px-1 rounded text-primary">ProductDescription (HTML CDATA)</span>
                    </div>
                    {selectedProductMapping?.description ? (
                      <div className="bg-background border border-border rounded p-3 text-xs leading-relaxed max-h-[120px] overflow-y-auto text-foreground whitespace-pre-wrap">
                        {selectedProductMapping.description}
                      </div>
                    ) : (
                      <div className="p-3 bg-background border border-border rounded text-center text-muted-foreground">
                        Description is empty.
                      </div>
                    )}
                  </div>

                  {/* Search Keywords Mapping */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                      <span>Search Keywords</span>
                      <span className="font-mono text-[9px] bg-muted px-1 rounded text-primary">SearchKeywords</span>
                    </div>
                    <span className="font-semibold text-foreground bg-background border border-border rounded p-2 text-xs truncate">
                      {selectedProductMapping?.search_keywords || "—"}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      <Dialog open={isPagesDialogOpen} onOpenChange={setIsPagesDialogOpen}>
        <DialogContent className="max-w-md p-6 bg-card border border-border rounded-lg shadow-lg flex flex-col max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Globe className="h-4 w-4 text-emerald-500" /> Edit ShopSite Pages
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center border border-border rounded px-3 py-1.5 shrink-0 my-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              className="flex h-8 w-full rounded-none bg-transparent text-sm outline-none placeholder:text-muted-foreground font-semibold"
              placeholder="Search ShopSite pages..."
              value={pagesSearch}
              onChange={(e) => setPagesSearch(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 border border-border rounded p-1 bg-background flex flex-col gap-0.5">
            {SHOPSITE_PAGES.filter(p => p.toLowerCase().includes(pagesSearch.toLowerCase())).map((page) => {
              const isChecked = editingPages.includes(page);
              return (
                <label
                  key={page}
                  className="flex items-center gap-3 px-3 py-2 text-xs font-semibold hover:bg-muted cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setEditingPages(prev => [...prev, page]);
                      } else {
                        setEditingPages(prev => prev.filter(p => p !== page));
                      }
                    }}
                  />
                  <span className="flex-1 select-none leading-tight">{page}</span>
                </label>
              );
            })}
            {SHOPSITE_PAGES.filter(p => p.toLowerCase().includes(pagesSearch.toLowerCase())).length === 0 && (
              <div className="p-4 text-center text-xs font-semibold text-muted-foreground italic">
                No pages match your search.
              </div>
            )}
          </div>

          <DialogFooter className="mt-4 gap-2 border-t border-border pt-4 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPagesDialogOpen(false)}
              disabled={isSavingPages}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSavePages}
              disabled={isSavingPages}
            >
              {isSavingPages ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
