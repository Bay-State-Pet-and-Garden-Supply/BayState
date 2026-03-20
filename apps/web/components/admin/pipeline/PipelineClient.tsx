"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import { Activity, Brain } from "lucide-react";
import { StageTabs } from "./StageTabs";
import { ProductTable } from "./ProductTable";
import { ScrapedResultsView } from "./ScrapedResultsView";
import { BulkToolbar } from "./BulkToolbar";
import { ScraperSelectDialog } from "./ScraperSelectDialog";
import { ActiveRunsTab } from "./ActiveRunsTab";
import { ActiveConsolidationsTab } from "./ActiveConsolidationsTab";
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
}

export function PipelineClient({
  initialCounts,
  initialProducts,
  initialTotal,
}: PipelineClientProps) {
  const [currentStage, setCurrentStage] = useState<PipelineStage>("imported");
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [products, setProducts] = useState<PipelineProduct[]>(initialProducts);
  const [counts, setCounts] = useState<StatusCount[]>(initialCounts);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [isLoading, setIsLoading] = useState(false);
  const [isScrapeDialogOpen, setIsScrapeDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

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
    if (sourceFilter && availableSourceFilters.length > 0 && !availableSourceFilters.includes(sourceFilter)) {
      setSourceFilter("");
    }
  }, [availableSourceFilters, sourceFilter]);

  // Fetch products for a specific stage
  const fetchProducts = useCallback(
    async (stage: PipelineStage, searchTerm?: string) => {
      // Monitoring and consolidating are live views, not product index queries.
      if (stage === "monitoring" || stage === "consolidating") {
        setProducts([]);
        setTotalCount(0);
        setSelectedSkus(new Set());
        return;
      }

      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          status: stage,
          limit: "500",
        });
        if (searchTerm) params.set("search", searchTerm);

        const res = await fetch(`/api/admin/pipeline?${params}`);
        if (!res.ok) throw new Error("Failed to fetch products");
        const data = await res.json();
        setProducts(data.products || []);
        setTotalCount(data.count || 0);
      } catch {
        toast.error("Failed to fetch products");
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // Fetch counts for all stages
  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/pipeline/counts");
      if (res.ok) {
        const data = await res.json();
        setCounts(data.counts || []);
      }
    } catch {
      // Silently fail for counts
    }
  }, []);

  // Refresh everything
  const refreshAll = useCallback(async () => {
    await Promise.all([fetchProducts(currentStage, search), fetchCounts()]);
  }, [currentStage, search, fetchProducts, fetchCounts]);

  const isFirstMount = useRef(true);

  // Fetch products when stage or search changes
  useEffect(() => {
    // Skip initial fetch since we have initialProducts from props
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

      await fetchProducts(currentStage, search);
      if (isMounted) {
        setSelectedSkus(new Set());
      }
    };

    performFetch();

    return () => {
      isMounted = false;
    };
  }, [currentStage, search, fetchProducts]);

  // Handle stage tab change
  const handleStageChange = (stage: PipelineStage) => {
    setCurrentStage(stage);
    setSearch("");
    setSourceFilter("");
  };

  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(
    null,
  );

  // Toggle product selection with optional Shift+Click range support
  const handleSelectSku = (
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
        rangeSkus.forEach((skuItem) => next.add(skuItem));
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
  };

  // Select all visible products
  const handleSelectAllVisible = () => {
    setSelectedSkus(new Set(filteredProducts.map((p) => p.sku)));
  };

  // Select ALL matching (including beyond visible page) via API
  const handleSelectAll = async () => {
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
  const handleConsolidate = useCallback(async (skus: string[]) => {
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
        setCurrentStage("consolidating");
        setSearch("");
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
  }, [fetchCounts]);

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
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [selectedSkus, currentStage, handleClearSelection, refreshAll, handleConsolidate]);

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
          setCurrentStage("monitoring");
          setSearch("");
          await Promise.all([fetchCounts(), fetchProducts("monitoring")]);
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

      {/* Bulk Toolbar + Search bar — hidden for monitoring/consolidating */}
      {currentStage !== "monitoring" && currentStage !== "consolidating" && (
        <BulkToolbar
          selectedCount={selectedSkus.size}
          totalCount={sourceFilter ? filteredProducts.length : totalCount}
          currentStage={currentStage}
          isLoading={isLoading}
          search={search}
          onSearchChange={(value) => setSearch(value)}
          onClearSelection={handleClearSelection}
          onSelectAll={handleSelectAll}
          onBulkAction={handleBulkAction}
          onResetStage={handleResetStage}
          onOpenScrapeDialog={() => setIsScrapeDialogOpen(true)}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          availableSourceFilters={availableSourceFilters}
        />
      )}

      {/* Content Area */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        ) : currentStage === "monitoring" ? (
          <div className="grid gap-6 xl:grid-cols-1">
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="rounded-lg bg-[#008850]/10 p-2">
                  <Activity className="h-5 w-5 text-[#008850]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Active Runs
                  </h2>
                  <p className="text-sm text-gray-600">
                    Live scraper jobs currently running or queued.
                  </p>
                </div>
              </div>
              <ActiveRunsTab />
            </section>
          </div>
        ) : currentStage === "consolidating" ? (
          <div className="grid gap-6 xl:grid-cols-1">
            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="rounded-lg bg-purple-100 p-2">
                  <Brain className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    AI Consolidations
                  </h2>
                  <p className="text-sm text-gray-600">
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
    </div>
  );
}
