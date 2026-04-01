"use client";

import { useState, useEffect, useCallback, useRef, useMemo, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Activity, Brain } from "lucide-react";
import { StageTabs } from "./StageTabs";
import { ProductTable } from "./ProductTable";
import { ScrapedResultsView } from "./ScrapedResultsView";
import { PipelineToolbar } from "./PipelineToolbar";
import { FloatingActionsBar } from "./FloatingActionsBar";
import { ActiveRunsTab } from "./ActiveRunsTab";
import { ActiveConsolidationsTab } from "./ActiveConsolidationsTab";
import { FinalizingResultsView } from "./FinalizingResultsView";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import dynamic from "next/dynamic";

const ScraperSelectDialog = dynamic(() => import("./ScraperSelectDialog").then(mod => mod.ScraperSelectDialog), { ssr: false });
const ManualAddProductDialog = dynamic(() => import("./ManualAddProductDialog").then(mod => mod.ManualAddProductDialog), { ssr: false });
const IntegraImportDialog = dynamic(() => import("./IntegraImportDialog").then(mod => mod.IntegraImportDialog), { ssr: false });
import type {
  PipelineProduct,
  PipelineStatus,
  PipelineStage,
  StatusCount,
} from "@/lib/pipeline/types";

interface PipelineClientProps {
  initialCounts: StatusCount[];
  initialProducts: PipelineProduct[];
  initialTotal: number;
  initialStage?: PipelineStage;
}

export function PipelineClient({
  initialCounts,
  initialProducts,
  initialTotal,
  initialStage = "imported",
}: PipelineClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, startNavigation] = useTransition();

  const stageFromUrl = searchParams.get("stage");
  const currentStage: PipelineStage =
    stageFromUrl && ["imported", "monitoring", "scraped", "consolidating", "finalized", "published"].includes(stageFromUrl)
      ? (stageFromUrl as PipelineStage)
      : initialStage;
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [products, setProducts] = useState<PipelineProduct[]>(initialProducts);
  const [counts, setCounts] = useState<StatusCount[]>(initialCounts);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [isLoading, setIsLoading] = useState(false);
  const [isScrapeDialogOpen, setIsScrapeDialogOpen] = useState(false);
  const [isManualAddOpen, setIsManualAddOpen] = useState(false);
  const [isIntegraImportOpen, setIsIntegraImportOpen] = useState(false);
  const [publishedActionState, setPublishedActionState] = useState<
    "upload" | "zip" | null
  >(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [sourceFilter, setSourceFilter] = useState(searchParams.get("source") || "");

  const availableSourceFilters = useMemo(() => {
    const all = new Set<string>();
    products.forEach((product) => {
      const productSources = product.sources ?? {};
      Object.keys(productSources)
        .filter((key) => !key.startsWith("_"))
        .forEach((key) => all.add(key));
    });
    return Array.from(all).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!sourceFilter || currentStage !== "scraped") return products;
    return products.filter((product) => {
      const productSources = product.sources ?? {};
      return Object.keys(productSources)
        .filter((key) => !key.startsWith("_"))
        .includes(sourceFilter);
    });
  }, [products, sourceFilter, currentStage]);

  // Reset source filter if the selected source is no longer available in the product set
  useEffect(() => {
    if (
      sourceFilter &&
      availableSourceFilters.length > 0 &&
      !availableSourceFilters.includes(sourceFilter)
    ) {
      setSourceFilter("");
    }
  }, [availableSourceFilters, sourceFilter]);

  // Fetch products for a specific stage
  const fetchProducts = useCallback(
    async (stage: PipelineStage, searchTerm?: string, silent = false) => {
      // Monitoring and consolidating are live views, not product index queries.
      if (stage === "monitoring" || stage === "consolidating") {
        setProducts([]);
        setTotalCount(0);
        setSelectedSkus(new Set());
        return;
      }

      if (!silent) setIsLoading(true);
      try {
        const params = new URLSearchParams({
          status: stage,
          limit: "500",
        });
        if (searchTerm) params.set("search", searchTerm);

        const res = await fetch(`/api/admin/pipeline?${params}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch products");
        const data = await res.json();
        setProducts(data.products || []);
        setTotalCount(data.count || 0);
      } catch {
        toast.error("Failed to fetch products");
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [],
  );

  // Fetch counts for all stages
  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/pipeline/counts", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setCounts(data.counts || []);
      }
    } catch {
      // Silently fail for counts
    }
  }, []);

  // Refresh everything
  const refreshAll = useCallback(async (silent = false) => {
    await Promise.all([fetchProducts(currentStage, search, silent), fetchCounts()]);
  }, [currentStage, search, fetchProducts, fetchCounts]);

  const isFirstMount = useRef(true);

  // Sync state with props from Server Component
  useEffect(() => {
    setProducts(initialProducts);
    setCounts(initialCounts);
    setTotalCount(initialTotal);
    setSelectedSkus(new Set());
    setIsLoading(false);
  }, [initialProducts, initialCounts, initialTotal, initialStage]);

  // Fetch products when search changes
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    let isMounted = true;

    const performFetch = async () => {
      if (!isMounted) return;

      if (currentStage === "monitoring" || currentStage === "consolidating") {
        setProducts([]);
        setTotalCount(0);
        setSelectedSkus(new Set());
        return;
      }

      // Only fetch if there is a search filter. 
      // Base stage data comes from server props!
      if (search) {
        await fetchProducts(currentStage, search);
        if (isMounted) setSelectedSkus(new Set());
      }
    };

    performFetch();

    return () => {
      isMounted = false;
    };
  }, [search, fetchProducts, currentStage]);

  // Sync search and source filters with URL (if they exist in URL on load)
  useEffect(() => {
    const searchParam = searchParams.get("search") || "";
    if (searchParam !== search) {
      setSearch(searchParam);
    }
    
    const sourceParam = searchParams.get("source") || "";
    if (sourceParam !== sourceFilter) {
      setSourceFilter(sourceParam);
    }
  }, [searchParams]);

  // Handle stage tab change
  const handleStageChange = (stage: PipelineStage) => {
    // Clear local filters before navigating
    // This allows the server to fetch clean data for the new stage
    setSearch("");
    setSourceFilter("");
    setLastSelectedIndex(null);

    const params = new URLSearchParams(searchParams.toString());
    params.set("stage", stage);
    params.delete("search"); // clear search on stage change
    params.delete("source"); // clear source on stage change

    startNavigation(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(
    null,
  );

  // Toggle product selection with optional Shift+Click range support
  const handleSelectSku = useCallback(
    (
      sku: string,
      selected: boolean,
      index?: number,
      isShiftClick?: boolean,
      visibleProducts?: PipelineProduct[],
    ) => {
      const sourceProducts = visibleProducts ?? filteredProducts;

      setSelectedSkus((prev) => {
        const next = new Set(prev);

        if (isShiftClick && index !== undefined && lastSelectedIndex !== null) {
          const [start, end] = [lastSelectedIndex, index].sort((a, b) => a - b);
          const rangeSkus = sourceProducts
            .slice(start, end + 1)
            .map((p) => p.sku);

          if (selected) {
            rangeSkus.forEach((skuItem) => next.add(skuItem));
          } else {
            rangeSkus.forEach((skuItem) => next.delete(skuItem));
          }
        } else {
          if (selected) {
            next.add(sku);
          } else {
            next.delete(sku);
          }
        }

        return next;
      });

      if (index !== undefined) {
        setLastSelectedIndex(index);
      }
    },
    [filteredProducts, lastSelectedIndex],
  );

  // Select all visible products
  const handleSelectAllVisible = () => {
    setSelectedSkus(new Set(filteredProducts.map((p) => p.sku)));
  };

  // Select ALL matching (including beyond visible page) via API
  const handleSelectAll = async () => {
    if (currentStage === "finalized") {
      // Finalizing should not support select-all behavior; enforce one-by-one in UI.
      return;
    }

    // If we have a source filter, we only select what's visible since API doesn't support complex local filters easily
    // or if visible products cover the total, just select visible
    if (sourceFilter || products.length >= totalCount) {
      handleSelectAllVisible();
      return;
    }

    try {
      const params = new URLSearchParams({
        status: currentStage,
        selectAll: "true",
      });
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/pipeline?${params}`);
      if (res.ok) {
        const data = await res.json();
        const allSkus: string[] = data.skus || [];
        setSelectedSkus(new Set(allSkus));
        toast.success(`Selected all ${allSkus.length} products`);
      } else {
        handleSelectAllVisible();
      }
    } catch {
      handleSelectAllVisible();
    }
  };

  // Clear selection
  const handleClearSelection = useCallback(() => {
    setSelectedSkus(new Set());
  }, []);

  // Handle consolidation submission for scraped products
  const handleConsolidate = useCallback(
    async (skus: string[]) => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/admin/consolidation/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skus,
            description: `Consolidation batch for ${skus.length} products`,
            auto_apply: false,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          toast.success(
            `Submitted ${data.product_count} product${data.product_count !== 1 ? "s" : ""} for AI consolidation`,
            {
              description: `Batch ID: ${data.batch_id?.slice(0, 12) ?? "unknown"}...`,
            },
          );
          setSelectedSkus(new Set());
          handleStageChange("consolidating");
          await fetchCounts();
        } else {
          const error = await res.json();
          toast.error(error.error || "Failed to submit consolidation");
        }
      } catch {
        toast.error("Failed to submit consolidation");
      } finally {
        setIsLoading(false);
      }
    },
    [fetchCounts],
  );

  // Handle product deletion
  const handleDelete = useCallback(async () => {
    const skus = Array.from(selectedSkus);
    if (skus.length === 0) return;
    setConfirmDeleteOpen(true);
  }, [selectedSkus]);

  const handleConfirmDelete = useCallback(async () => {
    setConfirmDeleteOpen(false);
    const skus = Array.from(selectedSkus);
    if (skus.length === 0) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/pipeline/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skus }),
      });

      if (res.ok) {
        toast.success(
          `Deleted ${skus.length} product${skus.length > 1 ? "s" : ""}`,
        );
        setSelectedSkus(new Set());
        await refreshAll();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to delete products");
      }
    } catch {
      toast.error("Failed to delete products");
    } finally {
      setIsLoading(false);
    }
  }, [selectedSkus, refreshAll]);

  const uploadPublishedProducts = useCallback(
    async (skus?: string[]) => {
      const uploadCount = skus?.length ?? totalCount;
      if (uploadCount === 0) {
        return;
      }

      setPublishedActionState("upload");
      try {
        const response = await fetch("/api/admin/pipeline/upload-shopsite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(skus && skus.length > 0 ? { skus } : {}),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || "Failed to upload products to ShopSite");
        }

        const marker =
          typeof payload.marker === "string" && payload.marker.length > 0
            ? payload.marker
            : null;
        const uploadedCount =
          typeof payload.uploadedCount === "number" ? payload.uploadedCount : uploadCount;

        toast.success("Uploaded to ShopSite", {
          description: `${uploadedCount} published product${uploadedCount === 1 ? "" : "s"}${marker ? ` tagged ${marker}` : ""}`,
        });
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to upload products to ShopSite",
        );
      } finally {
        setPublishedActionState(null);
      }
    },
    [totalCount],
  );

  const downloadPublishedImageZip = useCallback(
    async (skus?: string[]) => {
      const exportCount = skus?.length ?? totalCount;
      if (exportCount === 0) {
        return;
      }

      setPublishedActionState("zip");
      try {
        const response =
          skus && skus.length > 0
            ? await fetch("/api/admin/pipeline/export-zip", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ skus }),
              })
            : await fetch("/api/admin/pipeline/export-zip");

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to download image ZIP");
        }

        const blob = await response.blob();
        const contentDisposition = response.headers.get("Content-Disposition");
        const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/i);
        const filename = filenameMatch?.[1] ?? "shopsite-images.zip";

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        toast.success("Image ZIP downloaded", {
          description: `${exportCount} published product${exportCount === 1 ? "" : "s"}`,
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to download image ZIP",
        );
      } finally {
        setPublishedActionState(null);
      }
    },
    [totalCount],
  );

  const handleUploadAllShopSite = useCallback(() => {
    void uploadPublishedProducts();
  }, [uploadPublishedProducts]);

  const handleDownloadAllZip = useCallback(() => {
    void downloadPublishedImageZip();
  }, [downloadPublishedImageZip]);

  const handleUploadSelectedShopSite = useCallback(() => {
    void uploadPublishedProducts(Array.from(selectedSkus));
  }, [uploadPublishedProducts, selectedSkus]);

  const handleDownloadSelectedZip = useCallback(() => {
    void downloadPublishedImageZip(Array.from(selectedSkus));
  }, [downloadPublishedImageZip, selectedSkus]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA" ||
        activeElement?.getAttribute("contenteditable") === "true"
      ) {
        return;
      }

      if (e.key === "Escape") {
        handleClearSelection();
      } else if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        refreshAll();
      } else if (selectedSkus.size > 0) {
        if (e.key.toLowerCase() === "s") {
          if (currentStage === "imported" || currentStage === "scraped") {
            e.preventDefault();
            setIsScrapeDialogOpen(true);
          }
        } else if (e.key.toLowerCase() === "c") {
          if (currentStage === "scraped") {
            e.preventDefault();
            handleConsolidate(Array.from(selectedSkus));
          }
        } else if (
          e.key === "Delete" ||
          (e.key === "Backspace" && (e.metaKey || e.ctrlKey))
        ) {
          e.preventDefault();
          handleDelete();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [
    selectedSkus,
    currentStage,
    handleClearSelection,
    refreshAll,
    handleConsolidate,
    handleDelete,
  ]);

  // Handle bulk status transition (non-scrape stages)
  const handleBulkAction = async (nextStage: PipelineStatus) => {
    const skus = Array.from(selectedSkus);
    if (skus.length === 0) return;

    // Intercept scraped → consolidated to call consolidation API
    if (currentStage === "scraped" && nextStage === "consolidated") {
      await handleConsolidate(skus);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/pipeline/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skus, toStatus: nextStage }),
      });

      if (res.ok) {
        toast.success(
          `Moved ${skus.length} product${skus.length > 1 ? "s" : ""} to ${nextStage}`,
        );
        setSelectedSkus(new Set());
        await refreshAll();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to move products");
      }
    } catch {
      toast.error("Failed to move products");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle stage reset (moving back and clearing results)
  const handleResetStage = async (previousStage: PipelineStatus) => {
    const skus = Array.from(selectedSkus);
    if (skus.length === 0) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/pipeline/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skus,
          toStatus: previousStage,
          resetResults: true,
        }),
      });

      if (res.ok) {
        toast.success(
          `Reset ${skus.length} product${skus.length > 1 ? "s" : ""} to ${previousStage}`,
        );
        setSelectedSkus(new Set());
        await refreshAll();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to reset stage");
      }
    } catch {
      toast.error("Failed to reset stage");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle scrape dialog confirm — creates actual scraper jobs
  const handleScrapeConfirm = async (
    scrapers: string[],
    enrichmentMethod: "scrapers" | "ai_search",
  ) => {
    const skus = Array.from(selectedSkus);
    if (skus.length === 0) return;

    const isAdditionalScrape = currentStage === "scraped";

    try {
      const res = await fetch("/api/admin/pipeline/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skus,
          scrapers,
          enrichment_method: enrichmentMethod,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(
          isAdditionalScrape
            ? `Started additional scrape for ${skus.length} product${skus.length > 1 ? "s" : ""}`
            : `Created scrape job for ${skus.length} product${skus.length > 1 ? "s" : ""} with ${scrapers.length} scraper${scrapers.length !== 1 ? "s" : ""}`,
          {
            description: `Job ID: ${data.jobIds?.[0]?.slice(0, 8) ?? "unknown"}...`,
          },
        );

        setIsScrapeDialogOpen(false);
        setSelectedSkus(new Set());

        if (isAdditionalScrape) {
          // Stay on scraped tab, refresh to show updated results when callback delivers
          setSearch("");
          await refreshAll();
        } else {
          // Navigate to monitoring tab for initial scrapes
          handleStageChange("monitoring");
        }
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to create scrape jobs");
      }
    } catch {
      toast.error("Failed to create scrape jobs");
    }
  };

  return (
    <div className="flex h-full flex-col space-y-2 -mt-4">
      {/* Stage Tabs */}
      <StageTabs
        currentStage={currentStage}
        counts={counts}
        onStageChange={handleStageChange}
      />

      {/* Pipeline Toolbar — hidden for monitoring/consolidating */}
      {currentStage !== "monitoring" && currentStage !== "consolidating" && (
        <PipelineToolbar
          totalCount={totalCount}
          currentStage={currentStage}
          isLoading={isLoading}
          search={search}
          onSearchChange={(value) => setSearch(value)}
          onSelectAll={handleSelectAll}
          onManualAdd={() => setIsManualAddOpen(true)}
          onIntegraImport={() => setIsIntegraImportOpen(true)}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          availableSourceFilters={availableSourceFilters}
          selectedCount={selectedSkus.size}
          actionState={
            currentStage === "published" ? publishedActionState : null
          }
          onUploadShopSite={
            currentStage === "published" ? handleUploadAllShopSite : undefined
          }
          onDownloadZip={
            currentStage === "published" ? handleDownloadAllZip : undefined
          }
        />
      )}

      {/* Content Area */}
      <div className="flex-1 min-h-0">
        {isLoading || isNavigating ? (
          <div className="flex h-48 items-center justify-center">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        ) : currentStage === "monitoring" ? (
          <div className="grid gap-6 xl:grid-cols-1">
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="rounded-lg bg-brand-forest-green/10 p-2">
                  <Activity className="h-5 w-5 text-brand-forest-green" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Active Runs
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Live scraper jobs currently running or queued.
                  </p>
                </div>
              </div>
              <ActiveRunsTab />
            </section>
          </div>
        ) : currentStage === "consolidating" ? (
          <div className="grid gap-6 xl:grid-cols-1">
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="rounded-lg bg-brand-burgundy/10 p-2">
                  <Brain className="h-5 w-5 text-brand-burgundy" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    AI Consolidations
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Active consolidation batches and history.
                  </p>
                </div>
              </div>
              <ActiveConsolidationsTab />
            </section>
          </div>
        ) : currentStage === "scraped" ? (
          <ScrapedResultsView
            products={filteredProducts}
            selectedSkus={selectedSkus}
            onSelectSku={handleSelectSku}
            onRefresh={refreshAll}
          />
        ) : currentStage === "finalized" || currentStage === "published" ? (
          <FinalizingResultsView
            products={filteredProducts}
            onRefresh={refreshAll}
          />
        ) : (
          <ProductTable
            products={filteredProducts}
            selectedSkus={selectedSkus}
            onSelectSku={handleSelectSku}
            onSelectAll={handleSelectAllVisible}
            onDeselectAll={handleClearSelection}
            currentStage={currentStage}
          />
        )}
      </div>

      {/* Scraper Selection Dialog */}
      <ScraperSelectDialog
        open={isScrapeDialogOpen}
        onOpenChange={setIsScrapeDialogOpen}
        selectedSkuCount={selectedSkus.size}
        onConfirm={handleScrapeConfirm}
      />
      {/* Manual Add Product Dialog */}
      {isManualAddOpen && (
        <ManualAddProductDialog
          onSuccess={() => {
            setIsManualAddOpen(false);
            refreshAll();
          }}
          onCancel={() => setIsManualAddOpen(false)}
        />
      )}
      {/* Integra Import Dialog */}
      {isIntegraImportOpen && (
        <IntegraImportDialog
          onSuccess={() => {
            setIsIntegraImportOpen(false);
            refreshAll();
          }}
          onCancel={() => setIsIntegraImportOpen(false)}
        />
      )}

      {/* Floating Bulk Actions Bar */}
      <FloatingActionsBar
        selectedCount={selectedSkus.size}
        totalCount={totalCount}
        currentStage={currentStage}
        isLoading={isLoading}
        onClearSelection={handleClearSelection}
        onSelectAll={handleSelectAll}
        onBulkAction={handleBulkAction}
        onResetStage={handleResetStage}
        onOpenScrapeDialog={() => setIsScrapeDialogOpen(true)}
        onDelete={handleDelete}
        actionState={
          currentStage === "published" ? publishedActionState : null
        }
        onUploadShopSite={
          currentStage === "published"
            ? handleUploadSelectedShopSite
            : undefined
        }
        onDownloadZip={
          currentStage === "published" ? handleDownloadSelectedZip : undefined
        }
      />

      <ConfirmationDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        onConfirm={handleConfirmDelete}
        title="Delete Products"
        description={`Are you sure you want to permanently delete ${selectedSkus.size} product${selectedSkus.size > 1 ? "s" : ""}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        isLoading={isLoading}
      />
    </div>
  );
}
