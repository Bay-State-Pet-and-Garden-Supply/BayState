"use client";

import { useState, useEffect, useCallback, useRef, useMemo, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Activity, Brain, ChevronRight, Layers, Tag, Plus, Database, Upload, Archive, Loader2, Search, X } from "lucide-react";
import { StageTabs } from "./StageTabs";
import { ProductTable } from "./ProductTable";
import { ScrapedResultsView } from "./ScrapedResultsView";
import { FloatingActionsBar } from "./FloatingActionsBar";
import { ActiveRunsTab } from "./ActiveRunsTab";
import { ActiveConsolidationsTab } from "./ActiveConsolidationsTab";
import { FinalizingResultsView } from "./FinalizingResultsView";
import { PipelineFilters } from "./PipelineFilters";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import dynamic from "next/dynamic";
import type {
  PipelineProduct,
  PipelineStage,
  PersistedPipelineStatus,
  StatusCount,
} from "@/lib/pipeline/types";
import { getStageDataStatus, isPipelineStage } from "@/lib/pipeline/types";

const ScraperSelectDialog = dynamic(() => import("./ScraperSelectDialog").then(mod => mod.ScraperSelectDialog), { ssr: false });
const ManualAddProductDialog = dynamic(() => import("./ManualAddProductDialog").then(mod => mod.ManualAddProductDialog), { ssr: false });
const IntegraImportDialog = dynamic(() => import("./IntegraImportDialog").then(mod => mod.IntegraImportDialog), { ssr: false });

const LIVE_OPERATIONAL_TABS = new Set<PipelineStage>([
  'scraping',
  'consolidating',
]);

const SKU_TAG_PATTERN = /<SKU>([^<]+)<\/SKU>/g;

function parsePublishedSkus(xml: string): string[] {
  const skus = new Set<string>();

  for (const match of xml.matchAll(SKU_TAG_PATTERN)) {
    const sku = match[1]?.trim();
    if (sku) {
      skus.add(sku);
    }
  }

  return Array.from(skus);
}

function productMatchesSearch(product: PipelineProduct, searchTerm: string): boolean {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  const candidates = [
    product.sku,
    product.input?.name,
    product.consolidated?.name,
  ];

  return candidates.some((value) =>
    typeof value === "string" && value.toLowerCase().includes(normalizedSearch),
  );
}

function mergePublishedCount(nextCounts: StatusCount[], publishedCount: number): StatusCount[] {
  return [
    ...nextCounts.filter((count) => count.status !== "published"),
    { status: "published", count: publishedCount },
  ];
}

function isLiveOperationalTab(stage: PipelineStage): boolean {
  return LIVE_OPERATIONAL_TABS.has(stage);
}

interface PipelineClientProps {
  initialCounts: StatusCount[];
  initialProducts: PipelineProduct[];
  initialTotal: number;
  initialStage?: PipelineStage;
  initialSources?: string[];
}

export function PipelineClient({
  initialCounts,
  initialProducts,
  initialTotal,
  initialStage = "imported",
  initialSources = [],
}: PipelineClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, startNavigation] = useTransition();

  const stageFromUrl = searchParams.get("stage");
  const currentStage: PipelineStage =
    stageFromUrl && isPipelineStage(stageFromUrl)
      ? stageFromUrl
      : initialStage;
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [products, setProducts] = useState<PipelineProduct[]>(initialProducts);
  const [counts, setCounts] = useState<StatusCount[]>(initialCounts);
  const [sources, setSources] = useState<string[]>(initialSources);
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
  const [productLineFilter, setProductLineFilter] = useState(searchParams.get("product_line") || "");
  const [cohortIdFilter, setCohortIdFilter] = useState(searchParams.get("cohort_id") || "");
  const publishedSkuCacheRef = useRef<string[] | null>(null);
  const [cohortBrands, setCohortBrands] = useState<Record<string, string>>({});

  const filteredProducts = useMemo(() => {
    if (currentStage === "published") {
      return products.filter((product) => productMatchesSearch(product, search));
    }

    if (!sourceFilter || currentStage !== "scraped") return products;
    return products.filter((product) => {
      const productSources = product.sources ?? {};
      return Object.keys(productSources)
        .filter((key) => !key.startsWith("_"))
        .includes(sourceFilter);
    });
  }, [products, search, sourceFilter, currentStage]);

  const groupedProducts = useMemo(() => {
    const groups: Record<string, PipelineProduct[]> = {};
    const cohortIds: string[] = [];

    filteredProducts.forEach((product) => {
      const cohortId = product.cohort_id || "ungrouped";
      if (!groups[cohortId]) {
        groups[cohortId] = [];
        cohortIds.push(cohortId);
      }
      groups[cohortId].push(product);
    });

    // Sort IDs: ungrouped first, then alphabetical
    cohortIds.sort((a, b) => {
      if (a === "ungrouped") return -1;
      if (b === "ungrouped") return 1;
      return a.localeCompare(b);
    });

    return { groups, cohortIds };
  }, [filteredProducts]);

  // Fetch brand names for cohort groups
  useEffect(() => {
    const cohortUuids = groupedProducts.cohortIds.filter((id) => id !== "ungrouped");
    if (cohortUuids.length === 0) return;

    // Only fetch for cohorts we don't already have brand data for
    const missingIds = cohortUuids.filter((id) => !(id in cohortBrands));
    if (missingIds.length === 0) return;

    Promise.all(
      missingIds.map(async (id) => {
        try {
          const res = await fetch(`/api/admin/cohorts/${id}`);
          if (res.ok) {
            const data = await res.json();
            const brand = data.cohort?.brand_name || null;
            return [id, brand] as const;
          }
        } catch { /* ignore */ }
        return [id, null] as const;
      })
    ).then((results) => {
      const newBrands: Record<string, string> = {};
      results.forEach(([id, brand]) => {
        if (brand) newBrands[id] = brand;
      });
      if (Object.keys(newBrands).length > 0) {
        setCohortBrands((prev) => ({ ...prev, ...newBrands }));
      }
    });
  }, [groupedProducts.cohortIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset source filter if the selected source is no longer available in the product set
  useEffect(() => {
    if (
      sourceFilter &&
      sources.length > 0 &&
      !sources.includes(sourceFilter)
    ) {
      setSourceFilter("");
    }
  }, [sources, sourceFilter]);

  // Fetch products for a specific stage
  const fetchProducts = useCallback(
    async (stage: PipelineStage, searchTerm?: string, silent = false) => {
      const dataStatus = getStageDataStatus(stage);

      if (!dataStatus) {
        setProducts([]);
        setTotalCount(0);
        setSelectedSkus(new Set());
        return;
      }

      if (!silent) setIsLoading(true);
      try {
        const params = new URLSearchParams({
          status: dataStatus,
          limit: "500",
        });
        if (searchTerm) params.set("search", searchTerm);
        if (sourceFilter && stage === "scraped") params.set("source", sourceFilter);
        if (productLineFilter) params.set("product_line", productLineFilter);
        if (cohortIdFilter) params.set("cohort_id", cohortIdFilter);

        const res = await fetch(`/api/admin/pipeline?${params}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch products");
        const data = await res.json();
        setProducts(data.products || []);
        setTotalCount(data.count || 0);
        if (data.availableSources) {
          setSources(data.availableSources);
        }
      } catch {
        toast.error("Failed to fetch products");
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [sourceFilter, productLineFilter, cohortIdFilter],
  );

  // Fetch counts for all stages
  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/pipeline/counts", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setCounts((previousCounts) => {
          const publishedCount = previousCounts.find((count) => count.status === "published")?.count;
          const nextCounts = data.counts || [];

          return typeof publishedCount === "number"
            ? mergePublishedCount(nextCounts, publishedCount)
            : nextCounts;
        });
      }
    } catch {
      // Silently fail for counts
    }
  }, []);

  const getPublishedSkus = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && publishedSkuCacheRef.current) {
      return publishedSkuCacheRef.current;
    }

    const response = await fetch("/api/admin/pipeline/export-xml", { cache: "no-store" });
    if (response.status === 404) {
      publishedSkuCacheRef.current = [];
      return [];
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Failed to derive published products");
    }

    const xml = await response.text();
    const skus = parsePublishedSkus(xml);
    publishedSkuCacheRef.current = skus;
    return skus;
  }, []);

  const fetchPublishedProducts = useCallback(
    async (silent = false, forceRefresh = false) => {
      if (!silent) {
        setIsLoading(true);
      }

      try {
        const publishedSkus = await getPublishedSkus(forceRefresh);

        if (publishedSkus.length === 0) {
          setProducts([]);
          setTotalCount(0);
          setCounts((previousCounts) => mergePublishedCount(previousCounts, 0));
          return;
        }

        const productResponses = await Promise.all(
          publishedSkus.map(async (sku) => {
            const response = await fetch(`/api/admin/pipeline/${encodeURIComponent(sku)}`, {
              cache: "no-store",
            });

            if (!response.ok) {
              return null;
            }

            const payload = await response.json();
            return (payload.product ?? null) as PipelineProduct | null;
          }),
        );

        const nextProducts = productResponses.filter(
          (product): product is PipelineProduct => product !== null,
        );

        setProducts(nextProducts);
        setTotalCount(nextProducts.length);
        setCounts((previousCounts) => mergePublishedCount(previousCounts, nextProducts.length));
      } catch {
        toast.error("Failed to fetch published products");
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [getPublishedSkus],
  );

  // Refresh everything
  const refreshAll = useCallback(async (silent = false) => {
    if (currentStage === "published") {
      await Promise.all([fetchPublishedProducts(silent, true), fetchCounts()]);
      return;
    }

    await Promise.all([fetchProducts(currentStage, search, silent), fetchCounts()]);
  }, [currentStage, search, fetchProducts, fetchCounts, fetchPublishedProducts]);

  const isFirstMount = useRef(true);
  const lastFetchedSearch = useRef(searchParams.get("search") || "");

  // Sync state with props from Server Component
  useEffect(() => {
    setProducts(initialProducts);
    setCounts(initialCounts);
    setTotalCount(initialTotal);
    setSources(initialSources);
    setSelectedSkus(new Set());
    setIsLoading(false);
    
    // Update tracking ref on sync so we don't re-fetch immediately if initialProducts is already filtered
    lastFetchedSearch.current = searchParams.get("search") || "";
  }, [initialProducts, initialCounts, initialTotal, initialSources, searchParams]);

  // Fetch products when search changes
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    // Skip if search matches what we already have from props or last fetch
    if (search === lastFetchedSearch.current) {
      return;
    }

    let isMounted = true;

    const performFetch = async () => {
      if (!isMounted) return;

      if (isLiveOperationalTab(currentStage)) {
        setProducts([]);
        setTotalCount(0);
        setSelectedSkus(new Set());
        return;
      }

      if (currentStage === "published") {
        setSelectedSkus(new Set());
        return;
      }

      await fetchProducts(currentStage, search);
      if (isMounted) {
          setSelectedSkus(new Set());
          lastFetchedSearch.current = search;
      }
    };

    performFetch();

    return () => {
      isMounted = false;
    };
  }, [search, fetchProducts, currentStage]);

  useEffect(() => {
    void getPublishedSkus()
      .then((publishedSkus) => {
        setCounts((previousCounts) => mergePublishedCount(previousCounts, publishedSkus.length));
      })
      .catch(() => {
        // Ignore badge derivation failures until the published tab is opened.
      });
  }, [getPublishedSkus]);

  useEffect(() => {
    if (currentStage !== "published") {
      return;
    }

    void fetchPublishedProducts();
  }, [currentStage, fetchPublishedProducts]);

  // Sync state from URL (e.g. on navigation or back button)
  useEffect(() => {
    const searchParam = searchParams.get("search") || "";
    const sourceParam = searchParams.get("source") || "";
    const productLineParam = searchParams.get("product_line") || "";
    const cohortIdParam = searchParams.get("cohort_id") || "";

    if (searchParam !== search) setSearch(searchParam);
    if (sourceParam !== sourceFilter) setSourceFilter(sourceParam);
    if (productLineParam !== productLineFilter) {
      setProductLineFilter(productLineParam);
    }
    if (cohortIdParam !== cohortIdFilter) {
      setCohortIdFilter(cohortIdParam);
    }
    // We only depend on searchParams to detect external changes (like back button)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Update URL when filters change (debounced)
  useEffect(() => {
    if (isFirstMount.current) return;
    
    const timer = setTimeout(() => {
      const currentParams = new URLSearchParams(searchParams.toString());
      const hasSearchChanged = (currentParams.get("search") || "") !== search;
      const hasSourceChanged = (currentParams.get("source") || "") !== sourceFilter;
      const hasProductLineChanged = (currentParams.get("product_line") || "") !== productLineFilter;
      const hasCohortIdChanged = (currentParams.get("cohort_id") || "") !== cohortIdFilter;

      if (!hasSearchChanged && !hasSourceChanged && !hasProductLineChanged && !hasCohortIdChanged) return;

      if (search) currentParams.set("search", search);
      else currentParams.delete("search");

      if (sourceFilter) currentParams.set("source", sourceFilter);
      else currentParams.delete("source");

      if (productLineFilter) currentParams.set("product_line", productLineFilter);
      else currentParams.delete("product_line");

      if (cohortIdFilter) currentParams.set("cohort_id", cohortIdFilter);
      else currentParams.delete("cohort_id");

      router.replace(`${pathname}?${currentParams.toString()}`, { scroll: false });
    }, 400);

    return () => clearTimeout(timer);
  }, [search, sourceFilter, productLineFilter, cohortIdFilter, pathname, router, searchParams]);

  // Handle stage tab change
  const handleStageChange = useCallback((stage: PipelineStage) => {
    // Clear local filters before navigating
    // This allows the server to fetch clean data for the new stage
    setSearch("");
    setSourceFilter("");
    setLastSelectedSku(null);

    const params = new URLSearchParams(searchParams.toString());
    params.set("stage", stage);
    params.delete("search"); // clear search on stage change
    params.delete("source"); // clear source on stage change

    startNavigation(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }, [pathname, router, searchParams]);

  const [lastSelectedSku, setLastSelectedSku] = useState<string | null>(null);

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

        if (isShiftClick && index !== undefined && lastSelectedSku !== null) {
          const lastIndex = sourceProducts.findIndex((p) => p.sku === lastSelectedSku);

          if (lastIndex !== -1) {
            const [start, end] = [lastIndex, index].sort((a, b) => a - b);
            const rangeSkus = sourceProducts.slice(start, end + 1).map((p) => p.sku);

            if (selected) {
              rangeSkus.forEach((skuItem) => {
                next.add(skuItem);
              });
            } else {
              rangeSkus.forEach((skuItem) => {
                next.delete(skuItem);
              });
            }
          } else {
            // Last selected item is not in this specific list (e.g. different cohort).
            // Default to single selection.
            if (selected) next.add(sku);
            else next.delete(sku);
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

      setLastSelectedSku(sku);
    },
    [filteredProducts, lastSelectedSku],
  );

  // Select all visible products
  const handleSelectAllVisible = () => {
    setSelectedSkus(new Set(filteredProducts.map((p) => p.sku)));
  };

  // Select ALL matching (including beyond visible page) via API
  const handleSelectAll = async () => {
    if (currentStage === "finalizing") {
      // Finalizing should not support select-all behavior; enforce one-by-one in UI.
      return;
    }

    if (currentStage === "published") {
      handleSelectAllVisible();
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
    setLastSelectedSku(null);
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
    [fetchCounts, handleStageChange],
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
  const handleBulkAction = async (nextStage: PersistedPipelineStatus) => {
    const skus = Array.from(selectedSkus);
    if (skus.length === 0) return;

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
  const handleResetStage = async (previousStage: PersistedPipelineStatus) => {
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
          cohort_id: cohortIdFilter || undefined,
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
          // Navigate to the live scraping tab for initial scrapes.
          handleStageChange("scraping");
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
    <div className="flex h-full flex-col space-y-0.5 -mt-2">
      {/* Stage Tabs & Inline Actions */}
      <StageTabs
        currentStage={currentStage}
        counts={counts}
        onStageChange={handleStageChange}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative group w-48 md:w-64">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground transition-colors group-focus-within:text-brand-forest-green" />
              <Input
                placeholder="Search SKUs or names..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-7.5 pr-7 bg-muted/20 border-muted-foreground/10 focus-visible:ring-brand-forest-green/30 text-xs"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {currentStage === "scraped" && (
              <PipelineFilters
                filters={{
                  source: sourceFilter,
                  product_line: productLineFilter,
                  cohort_id: cohortIdFilter,
                }}
                onFilterChange={(newFilters) => {
                  if (newFilters.source !== undefined) setSourceFilter(newFilters.source || "");
                  if (newFilters.product_line !== undefined) setProductLineFilter(newFilters.product_line || "");
                  if (newFilters.cohort_id !== undefined) setCohortIdFilter(newFilters.cohort_id || "");
                }}
                availableSources={sources}
                className="h-8"
              />
            )}

            {currentStage === "imported" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsIntegraImportOpen(true)}
                  disabled={isLoading}
                  className="h-8 border-border text-muted-foreground hover:bg-muted text-xs font-semibold"
                >
                  <Database className="mr-1.5 h-3.5 w-3.5" />
                  Import CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsManualAddOpen(true)}
                  disabled={isLoading}
                  className="h-8 border-border text-muted-foreground hover:bg-muted text-xs font-semibold"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Product
                </Button>
              </>
            )}
            {currentStage === "published" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUploadAllShopSite}
                  disabled={isLoading || publishedActionState === "upload"}
                  className="h-8 border-brand-forest-green/20 text-brand-forest-green hover:bg-brand-forest-green/5 text-xs font-semibold"
                >
                  {publishedActionState === "upload" ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Upload to ShopSite
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadAllZip}
                  disabled={isLoading || publishedActionState === "zip"}
                  className="h-8 border-brand-burgundy/20 text-brand-burgundy hover:bg-brand-burgundy/5 text-xs font-semibold"
                >
                  {publishedActionState === "zip" ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Archive className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Images ZIP
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Content Area */}
      <div className="flex-1 min-h-0">
        {isLoading || isNavigating ? (
          <div className="flex h-48 items-center justify-center">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        ) : currentStage === "scraping" ? (
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
            onSelectAll={(skus) => {
              setSelectedSkus(prev => {
                const next = new Set(prev);
                skus.forEach(sku => next.add(sku));
                return next;
              });
            }}
            onDeselectAll={(skus) => {
              setSelectedSkus(prev => {
                const next = new Set(prev);
                skus.forEach(sku => next.delete(sku));
                return next;
              });
            }}
            onRefresh={refreshAll}
            search={search}
            onSearchChange={(value) => setSearch(value)}
            filters={{
              source: sourceFilter,
              product_line: productLineFilter,
              cohort_id: cohortIdFilter,
            }}
            onFilterChange={(newFilters) => {
              if (newFilters.source !== undefined) setSourceFilter(newFilters.source || "");
              if (newFilters.product_line !== undefined) setProductLineFilter(newFilters.product_line || "");
              if (newFilters.cohort_id !== undefined) setCohortIdFilter(newFilters.cohort_id || "");
            }}
            availableSources={sources}
            groupedProducts={groupedProducts}
            cohortBrands={cohortBrands}
          />
        ) : currentStage === "finalizing" || currentStage === "published" ? (
          <FinalizingResultsView
            products={filteredProducts}
            onRefresh={refreshAll}
            search={search}
            onSearchChange={(value) => setSearch(value)}
            groupedProducts={groupedProducts}
            cohortBrands={cohortBrands}
          />
        ) : (
          <div className="space-y-4">
            {groupedProducts.cohortIds.length <= 1 ? (
              <ProductTable
                products={filteredProducts}
                selectedSkus={selectedSkus}
                onSelectSku={handleSelectSku}
                onSelectAll={handleSelectAllVisible}
                onDeselectAll={handleClearSelection}
                currentStage={currentStage}
                search={search}
                onSearchChange={(value) => setSearch(value)}
                filters={{
                  source: sourceFilter,
                  product_line: productLineFilter,
                  cohort_id: cohortIdFilter,
                }}
                onFilterChange={(newFilters) => {
                  if (newFilters.source !== undefined) setSourceFilter(newFilters.source || "");
                  if (newFilters.product_line !== undefined) setProductLineFilter(newFilters.product_line || "");
                  if (newFilters.cohort_id !== undefined) setCohortIdFilter(newFilters.cohort_id || "");
                }}
                availableSources={sources}
                totalCount={totalCount}
                onSelectAllTotal={handleSelectAll}
              />
            ) : (
              <Accordion type="multiple" defaultValue={groupedProducts.cohortIds} className="space-y-4">
                {groupedProducts.cohortIds.map((cohortId) => {
                  const groupProducts = groupedProducts.groups[cohortId] || [];
                  return (
                    <AccordionItem 
                      key={cohortId} 
                      value={cohortId}
                      className="rounded-lg border border-border bg-card shadow-sm overflow-hidden border-l-4 border-l-brand-forest-green/40"
                    >
                      <AccordionTrigger className="px-3 py-2 hover:bg-muted/30 hover:no-underline [&[data-state=open]>div>svg]:rotate-90 bg-muted/10">
                        <div className="flex items-center gap-3">
                          <ChevronRight className="h-4 w-4 transition-transform duration-200 text-muted-foreground" />
                          <div className="flex items-center gap-2">
                            <Layers className="h-3.5 w-3.5 text-brand-forest-green/70" />
                            <span className="font-bold text-xs uppercase tracking-tight text-foreground/80">
                              {cohortId === "ungrouped" ? "Ungrouped Products" : `Cohort: ${cohortId}`}
                            </span>
                            {cohortBrands[cohortId] && (
                              <Badge variant="outline" className="ml-1 text-xs gap-1 border-brand-forest-green/30 text-brand-forest-green">
                                <Tag className="h-3 w-3" />
                                {cohortBrands[cohortId]}
                              </Badge>
                            )}
                            <Badge variant="secondary" className="ml-2 bg-muted text-muted-foreground font-normal">
                              {groupProducts.length} items
                            </Badge>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-0 border-t border-border">
                        <ProductTable
                          products={groupProducts}
                          selectedSkus={selectedSkus}
                          onSelectSku={(sku, selected, index, isShift) => 
                            handleSelectSku(sku, selected, index, isShift, groupProducts)
                          }
                          onSelectAll={() => {
                            const groupSkus = new Set(selectedSkus);
                            groupProducts.forEach(p => groupSkus.add(p.sku));
                            setSelectedSkus(groupSkus);
                          }}
                          onDeselectAll={() => {
                            const groupSkus = new Set(selectedSkus);
                            groupProducts.forEach(p => groupSkus.delete(p.sku));
                            setSelectedSkus(groupSkus);
                          }}
                          currentStage={currentStage}
                          search={search}
                          onSearchChange={(value) => setSearch(value)}
                          filters={{
                            source: sourceFilter,
                            product_line: productLineFilter,
                            cohort_id: cohortIdFilter,
                          }}
                          onFilterChange={(newFilters) => {
                            if (newFilters.source !== undefined) setSourceFilter(newFilters.source || "");
                            if (newFilters.product_line !== undefined) setProductLineFilter(newFilters.product_line || "");
                            if (newFilters.cohort_id !== undefined) setCohortIdFilter(newFilters.cohort_id || "");
                          }}
                          availableSources={sources}
                          totalCount={groupProducts.length}
                          onSelectAllTotal={() => {
                            const groupSkus = new Set(selectedSkus);
                            groupProducts.forEach(p => groupSkus.add(p.sku));
                            setSelectedSkus(groupSkus);
                          }}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </div>
        )}
      </div>

      {/* Scraper Selection Dialog */}
      <ScraperSelectDialog
        open={isScrapeDialogOpen}
        onOpenChange={setIsScrapeDialogOpen}
        selectedSkuCount={selectedSkus.size}
        onConfirm={handleScrapeConfirm}
        brandName={(() => {
          // Derive brand from the first selected product's cohort
          const firstSku = Array.from(selectedSkus)[0];
          const product = filteredProducts.find((p) => p.sku === firstSku);
          const cId = product?.cohort_id;
          return cId ? cohortBrands[cId] || null : null;
        })()}
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
      {!isLiveOperationalTab(currentStage) && (
        <FloatingActionsBar
          selectedCount={selectedSkus.size}
          totalCount={totalCount}
          currentStage={currentStage}
          isLoading={isLoading}
          onClearSelection={handleClearSelection}
          onSelectAll={handleSelectAll}
          onBulkAction={handleBulkAction}
          onResetStage={handleResetStage}
          onConsolidate={() => handleConsolidate(Array.from(selectedSkus))}
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
      )}

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
