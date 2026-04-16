"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useTransition,
} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  Activity,
  Brain,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  Layers,
  Tag,
  Plus,
  Database,
  Edit2,
} from "lucide-react";
import { StageTabs } from "./StageTabs";
import { PipelineHeader } from "./PipelineHeader";
import { ProductTable } from "./ProductTable";
import { ScrapedResultsView } from "./ScrapedResultsView";
import { FloatingActionsBar } from "./FloatingActionsBar";
import { ActiveRunsTab } from "./ActiveRunsTab";
import { ActiveConsolidationsTab } from "./ActiveConsolidationsTab";
import { FinalizingResultsView } from "./FinalizingResultsView";
import {
  PipelineFilters,
  type PipelineFiltersState,
} from "./PipelineFilters";
import { PipelineSearchField } from "./PipelineSearchField";
import { formatPipelineBatchLabel } from "./view-utils";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import type {
  PipelineProduct,
  PipelineStage,
  PersistedPipelineStatus,
  StatusCount,
} from "@/lib/pipeline/types";
import { normalizePipelineStage, STAGE_CONFIG } from "@/lib/pipeline/types";

const ScraperSelectDialog = dynamic(
  () => import("./ScraperSelectDialog").then((mod) => mod.ScraperSelectDialog),
  { ssr: false },
);
const ManualAddProductDialog = dynamic(
  () =>
    import("./ManualAddProductDialog").then(
      (mod) => mod.ManualAddProductDialog,
    ),
  { ssr: false },
);
const IntegraImportDialog = dynamic(
  () => import("./IntegraImportDialog").then((mod) => mod.IntegraImportDialog),
  { ssr: false },
);
const CohortEditDialog = dynamic(
  () => import("./CohortEditDialog").then((mod) => mod.CohortEditDialog),
  { ssr: false },
);

const LIVE_OPERATIONAL_TABS = new Set<PipelineStage>([
  "scraping",
  "consolidating",
]);
const WORKSPACE_TABS = new Set<PipelineStage>(["scraped", "finalizing"]);
const EMPTY_SOURCES: string[] = [];

function isLiveOperationalTab(stage: PipelineStage): boolean {
  return LIVE_OPERATIONAL_TABS.has(stage);
}

function isWorkspaceTab(stage: PipelineStage): boolean {
  return WORKSPACE_TABS.has(stage);
}

interface PipelineClientProps {
  initialCounts: StatusCount[];
  initialProducts: PipelineProduct[];
  initialTotal: number;
  initialStage?: PipelineStage;
  initialSources?: string[];
  hideTabs?: boolean;
}

export function PipelineClient({
  initialCounts,
  initialProducts,
  initialTotal,
  initialStage = "imported",
  initialSources = EMPTY_SOURCES,
  hideTabs = false,
}: PipelineClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, startNavigation] = useTransition();

  const stageFromUrl = searchParams.get("stage");
  const currentStage: PipelineStage =
    normalizePipelineStage(stageFromUrl) ?? initialStage;
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [products, setProducts] = useState<PipelineProduct[]>(initialProducts);
  const [counts, setCounts] = useState<StatusCount[]>(initialCounts);
  const [sources, setSources] = useState<string[]>(initialSources);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isScrapeDialogOpen, setIsScrapeDialogOpen] = useState(false);
  const [isManualAddOpen, setIsManualAddOpen] = useState(false);
  const [isIntegraImportOpen, setIsIntegraImportOpen] = useState(false);
  const [exportActionState, setExportActionState] = useState<
    "upload" | "zip" | null
  >(null);
  const [exportDownloadState, setExportDownloadState] = useState<
    "excel" | "xml" | null
  >(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editingCohort, setEditingCohort] = useState<{
    id: string;
    name: string | null;
    brandName: string | null;
  } | null>(null);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [sourceFilter, setSourceFilter] = useState(
    searchParams.get("source") || "",
  );
  const [productLineFilter, setProductLineFilter] = useState(
    searchParams.get("product_line") || "",
  );
  const [cohortIdFilter, setCohortIdFilter] = useState(
    searchParams.get("cohort_id") || "",
  );
  const canEditCohorts = currentStage === "imported";

  useEffect(() => {
    if (!canEditCohorts) {
      setEditingCohort(null);
    }
  }, [canEditCohorts]);

  const filteredProducts = useMemo(() => {
    if (!sourceFilter || currentStage !== "scraped") return products;
    return products.filter((product) => {
      const productSources = product.sources ?? {};
      return Object.keys(productSources)
        .filter((key) => !key.startsWith("_"))
        .includes(sourceFilter);
    });
  }, [products, sourceFilter, currentStage]);

  const groupedProducts = useMemo(() => {
    const groups: Record<string, PipelineProduct[]> = {};
    const cohortIds: string[] = [];
    const brands: Record<string, string> = {};
    const names: Record<string, string> = {};

    filteredProducts.forEach((product) => {
      const cohortId = product.cohort_id || "ungrouped";
      if (!groups[cohortId]) {
        groups[cohortId] = [];
        cohortIds.push(cohortId);
      }
      groups[cohortId].push(product);

      if (
        cohortId !== "ungrouped" &&
        product.cohort_brand_name &&
        !brands[cohortId]
      ) {
        brands[cohortId] = product.cohort_brand_name;
      }

      if (cohortId !== "ungrouped" && product.cohort_name && !names[cohortId]) {
        names[cohortId] = product.cohort_name;
      }
    });

    // Sort IDs: ungrouped first, then alphabetical
    cohortIds.sort((a, b) => {
      if (a === "ungrouped") return -1;
      if (b === "ungrouped") return 1;
      return a.localeCompare(b);
    });

    return { groups, cohortIds, brands, names };
  }, [filteredProducts]);

  // Reset source filter if the selected source is no longer available in the product set
  useEffect(() => {
    if (sourceFilter && sources.length > 0 && !sources.includes(sourceFilter)) {
      setSourceFilter("");
    }
  }, [sources, sourceFilter]);

  // Fetch products for a specific stage
  const fetchProducts = useCallback(
    async (stage: PipelineStage, searchTerm?: string, silent = false) => {
      if (isLiveOperationalTab(stage)) {
        setProducts([]);
        setTotalCount(0);
        setSelectedSkus(new Set());
        return;
      }

      if (!silent) setIsLoading(true);
      try {
        const params = new URLSearchParams({
          stage,
          limit: "500",
        });
        if (searchTerm) params.set("search", searchTerm);
        if (sourceFilter && stage === "scraped")
          params.set("source", sourceFilter);
        if (productLineFilter) params.set("product_line", productLineFilter);
        if (cohortIdFilter) params.set("cohort_id", cohortIdFilter);

        const res = await fetch(`/api/admin/pipeline?${params}`, {
          cache: "no-store",
        });
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
        const res = await fetch("/api/admin/pipeline/counts", {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setCounts(data.counts || []);
        }
      } catch {
        // Silently fail for counts
      }
    }, []);

  // Refresh everything
  const refreshAll = useCallback(
    async (silent = false) => {
      await Promise.all([
        fetchProducts(currentStage, search, silent),
        fetchCounts(),
      ]);
    },
    [currentStage, search, fetchProducts, fetchCounts],
  );

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
  }, [
    initialProducts,
    initialCounts,
    initialTotal,
    initialSources,
    searchParams,
  ]);

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

    // Debounce search fetch to prevent focus loss and excessive API calls
    const timer = setTimeout(async () => {
      if (!isMounted) return;

      if (isLiveOperationalTab(currentStage)) {
        setProducts([]);
        setTotalCount(0);
        setSelectedSkus(new Set());
        return;
      }

      // Use silent fetch for search to avoid triggering global isLoading (which unmounts UI)
      setIsSearching(true);
      try {
        await fetchProducts(currentStage, search, true);
      } finally {
        if (isMounted) setIsSearching(false);
      }
      
      if (isMounted) {
        setSelectedSkus(new Set());
        lastFetchedSearch.current = search;
      }
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [search, fetchProducts, currentStage]);

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
      const hasSourceChanged =
        (currentParams.get("source") || "") !== sourceFilter;
      const hasProductLineChanged =
        (currentParams.get("product_line") || "") !== productLineFilter;
      const hasCohortIdChanged =
        (currentParams.get("cohort_id") || "") !== cohortIdFilter;

      if (
        !hasSearchChanged &&
        !hasSourceChanged &&
        !hasProductLineChanged &&
        !hasCohortIdChanged
      )
        return;

      if (search) currentParams.set("search", search);
      else currentParams.delete("search");

      if (sourceFilter) currentParams.set("source", sourceFilter);
      else currentParams.delete("source");

      if (productLineFilter)
        currentParams.set("product_line", productLineFilter);
      else currentParams.delete("product_line");

      if (cohortIdFilter) currentParams.set("cohort_id", cohortIdFilter);
      else currentParams.delete("cohort_id");

      startNavigation(() => {
        router.replace(`${pathname}?${currentParams.toString()}`, {
          scroll: false,
        });
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [
    search,
    sourceFilter,
    productLineFilter,
    cohortIdFilter,
    pathname,
    router,
    searchParams,
  ]);

  // Handle stage tab change
  const handleStageChange = useCallback(
    (stage: PipelineStage) => {
      if (stage === "exporting") {
        router.push("/admin/pipeline/export");
        return;
      }

      // Clear local filters before navigating
      // This allows the server to fetch clean data for the new stage
      setSearch("");
      setSourceFilter("");
      setProductLineFilter("");
      setCohortIdFilter("");
      setLastSelectedSku(null);

      const params = new URLSearchParams(searchParams.toString());
      params.set("stage", stage);
      params.delete("search"); // clear search on stage change
      params.delete("source"); // clear source on stage change
      params.delete("product_line");
      params.delete("cohort_id");

      startNavigation(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [pathname, router, searchParams],
  );

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
          const lastIndex = sourceProducts.findIndex(
            (p) => p.sku === lastSelectedSku,
          );

          if (lastIndex !== -1) {
            const [start, end] = [lastIndex, index].sort((a, b) => a - b);
            const rangeSkus = sourceProducts
              .slice(start, end + 1)
              .map((p) => p.sku);

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
    // If we have a source filter, we only select what's visible since API doesn't support complex local filters easily
    // or if visible products cover the total, just select visible
    if (
      sourceFilter ||
      products.length >= totalCount ||
      productLineFilter ||
      cohortIdFilter
    ) {
      handleSelectAllVisible();
      return;
    }

    try {
      const params = new URLSearchParams({
        stage: currentStage,
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

  const downloadResponseToFile = useCallback(
    async (response: Response, fallbackFilename: string) => {
      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch =
        contentDisposition?.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] ?? fallbackFilename;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return filename;
    },
    [],
  );

  const fetchPublishedImageZipResponse = useCallback(
    async (
      skus?: string[],
      options: { includeExportedSelection?: boolean } = {},
    ) => {
      const hasScopedSelection = !!skus && skus.length > 0;
      const response = hasScopedSelection
        ? await fetch("/api/admin/pipeline/export-zip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              skus,
              ...(options.includeExportedSelection
                ? { includeExportedSelection: true }
                : {}),
            }),
          })
        : await fetch("/api/admin/pipeline/export-zip");

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to download image ZIP");
      }

      return response;
    },
    [],
  );

  const selectedExportSkus = useMemo(
    () => Array.from(selectedSkus),
    [selectedSkus],
  );
  const selectedExportCount = selectedExportSkus.length;
  const scopedExportCount =
    selectedExportCount > 0 ? selectedExportCount : totalCount;
  const hasExportableProducts = scopedExportCount > 0;

  const uploadPublishedProducts = useCallback(
    async (skus?: string[]) => {
      const uploadCount = skus?.length ?? totalCount;
      if (uploadCount === 0) {
        return;
      }

      setExportActionState("upload");
      try {
        const response = await fetch("/api/admin/pipeline/upload-shopsite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(skus && skus.length > 0 ? { skus } : {}),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            payload.error || "Failed to upload products to ShopSite",
          );
        }

        const marker =
          typeof payload.marker === "string" && payload.marker.length > 0
            ? payload.marker
            : null;
        const uploadedCount =
          typeof payload.uploadedCount === "number"
            ? payload.uploadedCount
            : uploadCount;
        const uploadedSkus = Array.isArray(payload.uploadedSkus)
          ? (payload.uploadedSkus as unknown[]).filter(
              (sku: unknown): sku is string =>
                typeof sku === "string" && sku.length > 0,
            )
          : skus ?? [];
        let zipDownloaded = false;

        try {
          setExportActionState("zip");
          const zipResponse = await fetchPublishedImageZipResponse(uploadedSkus, {
            includeExportedSelection: true,
          });
          await downloadResponseToFile(zipResponse, "shopsite-images.zip");
          zipDownloaded = true;
        } catch (zipError) {
          toast.error(
            zipError instanceof Error
              ? zipError.message
              : "Uploaded to ShopSite, but failed to download image ZIP",
          );
        }

        setSelectedSkus(new Set());
        await refreshAll();

        toast.success("Uploaded to ShopSite", {
          description: `${uploadedCount} storefront product${uploadedCount === 1 ? "" : "s"} archived${marker ? ` and tagged ${marker}` : ""}${zipDownloaded ? "; image ZIP downloaded" : ""}`,
        });
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to upload products to ShopSite",
        );
      } finally {
        setExportActionState(null);
      }
    },
    [
      downloadResponseToFile,
      fetchPublishedImageZipResponse,
      refreshAll,
      totalCount,
    ],
  );

  const downloadPublishedImageZip = useCallback(
    async (skus?: string[]) => {
      const exportCount = skus?.length ?? totalCount;
      if (exportCount === 0) {
        return;
      }

      setExportActionState("zip");
      try {
        const response = await fetchPublishedImageZipResponse(skus);
        await downloadResponseToFile(response, "shopsite-images.zip");

        toast.success("Image ZIP downloaded", {
          description: `${exportCount} storefront product${exportCount === 1 ? "" : "s"}`,
        });
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to download image ZIP",
        );
      } finally {
        setExportActionState(null);
      }
    },
    [downloadResponseToFile, fetchPublishedImageZipResponse, totalCount],
  );

  const downloadPublishedXml = useCallback(
    async (skus?: string[]) => {
      const exportCount = skus?.length ?? totalCount;
      if (exportCount === 0) {
        return;
      }

      setExportDownloadState("xml");
      try {
        const response =
          skus && skus.length > 0
            ? await fetch("/api/admin/pipeline/export-xml", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ skus }),
              })
            : await fetch("/api/admin/pipeline/export-xml");

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to generate XML export");
        }

        await downloadResponseToFile(response, "shopsite-products.xml");

        toast.success("ShopSite XML downloaded", {
          description: `${exportCount} storefront product${exportCount === 1 ? "" : "s"}`,
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to generate XML export",
        );
      } finally {
        setExportDownloadState(null);
      }
    },
    [downloadResponseToFile, totalCount],
  );

  const downloadPublishedWorkbook = useCallback(
    async (skus?: string[]) => {
      const exportCount = skus?.length ?? totalCount;
      if (exportCount === 0) {
        return;
      }

      setExportDownloadState("excel");
      try {
        const response =
          skus && skus.length > 0
            ? await fetch("/api/admin/pipeline/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ skus }),
              })
            : await fetch("/api/admin/pipeline/export?status=exporting");

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to export products");
        }

        await downloadResponseToFile(response, "products-export.xlsx");

        toast.success("Spreadsheet export downloaded", {
          description: `${exportCount} storefront product${exportCount === 1 ? "" : "s"}`,
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to export products",
        );
      } finally {
        setExportDownloadState(null);
      }
    },
    [downloadResponseToFile, totalCount],
  );

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

  const stageConfig = STAGE_CONFIG[currentStage];
  const currentStageCount =
    counts.find((count) => normalizePipelineStage(count.status) === currentStage)
      ?.count ?? totalCount;
  const shellControlsBelongToRoute =
    !isLiveOperationalTab(currentStage) && !isWorkspaceTab(currentStage);
  const filterState: PipelineFiltersState = {
    source: sourceFilter,
    product_line: productLineFilter,
    cohort_id: cohortIdFilter,
  };
  const applyFilterState = (newFilters: PipelineFiltersState) => {
    setSourceFilter(newFilters.source || "");
    setProductLineFilter(newFilters.product_line || "");
    setCohortIdFilter(newFilters.cohort_id || "");
  };
  const activeConstraints = [
    search
      ? {
          key: "search",
          label: `Search: ${search}`,
          clear: () => setSearch(""),
        }
      : null,
    sourceFilter
      ? {
          key: "source",
          label: `Source: ${sourceFilter}`,
          clear: () => setSourceFilter(""),
        }
      : null,
    productLineFilter
      ? {
          key: "product_line",
          label: `Product line: ${productLineFilter}`,
          clear: () => setProductLineFilter(""),
        }
      : null,
    cohortIdFilter
      ? {
          key: "cohort_id",
          label: `Batch ID: ${cohortIdFilter}`,
          clear: () => setCohortIdFilter(""),
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    clear: () => void;
  }>;

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {shellControlsBelongToRoute ? (
        <PipelineSearchField
          value={search}
          onChange={setSearch}
          className="w-48 md:w-64"
        />
      ) : null}

      {shellControlsBelongToRoute ? (
        <PipelineFilters
          filters={filterState}
          onFilterChange={applyFilterState}
          availableSources={sources}
          showSourceFilter={false}
          className="h-8"
        />
      ) : null}

      {currentStage === "exporting" ? (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void uploadPublishedProducts(
                selectedExportCount > 0 ? selectedExportSkus : undefined,
              )
            }
            disabled={!hasExportableProducts || exportActionState !== null}
            className="h-8 border-primary/20 text-primary hover:bg-primary/5 text-xs font-semibold"
          >
            {exportActionState === "upload"
              ? "Uploading..."
              : selectedExportCount > 0
                ? `Upload ${selectedExportCount} Selected`
                : "Upload to ShopSite"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void downloadPublishedXml(
                selectedExportCount > 0 ? selectedExportSkus : undefined,
              )
            }
            disabled={!hasExportableProducts || exportDownloadState !== null}
            className="h-8 border-border text-muted-foreground hover:bg-muted text-xs font-semibold"
          >
            {exportDownloadState === "xml"
              ? "Exporting XML..."
              : selectedExportCount > 0
                ? `XML ${selectedExportCount} Selected`
                : "Export ShopSite XML"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void downloadPublishedWorkbook(
                selectedExportCount > 0 ? selectedExportSkus : undefined,
              )
            }
            disabled={!hasExportableProducts || exportDownloadState !== null}
            className="h-8 border-border text-muted-foreground hover:bg-muted text-xs font-semibold"
          >
            {exportDownloadState === "excel"
              ? "Exporting..."
              : selectedExportCount > 0
                ? `Export ${selectedExportCount} Selected`
                : "Export Excel"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void downloadPublishedImageZip(
                selectedExportCount > 0 ? selectedExportSkus : undefined,
              )
            }
            disabled={!hasExportableProducts || exportActionState !== null}
            className="h-8 border-border text-muted-foreground hover:bg-muted text-xs font-semibold"
          >
            {exportActionState === "zip"
              ? "Downloading ZIP..."
              : selectedExportCount > 0
                ? `ZIP ${selectedExportCount} Selected`
                : "Download Images ZIP"}
          </Button>
        </>
      ) : null}

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
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Stage Tabs & Inline Actions */}
      {hideTabs ? (
        <div className="flex flex-col gap-4 border-b border-border/50 pb-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/admin/pipeline")}
              className="h-9 w-9 p-0 border-border/50 hover:bg-muted text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-3">
              <div
                className="h-8 w-1 rounded-full"
                style={{ backgroundColor: stageConfig.color }}
              />
              <div>
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  {stageConfig.label}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {stageConfig.description}
                </p>
              </div>
            </div>
          </div>
          {headerActions}
        </div>
      ) : (
        <StageTabs
          currentStage={currentStage}
          counts={counts}
          onStageChange={handleStageChange}
          actions={headerActions}
        />
      )}

      {/* Content Area */}
      <div className="flex-1 min-h-0 relative">
        <div className={cn("h-full transition-opacity", (isLoading || isNavigating) && "opacity-50 pointer-events-none")}>
          {currentStage === "scraping" ? (
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
              setSelectedSkus((prev) => {
                const next = new Set(prev);
                skus.forEach((sku) => next.add(sku));
                return next;
              });
            }}
            onDeselectAll={(skus) => {
              setSelectedSkus((prev) => {
                const next = new Set(prev);
                skus.forEach((sku) => next.delete(sku));
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
              if (newFilters.source !== undefined)
                setSourceFilter(newFilters.source || "");
              if (newFilters.product_line !== undefined)
                setProductLineFilter(newFilters.product_line || "");
              if (newFilters.cohort_id !== undefined)
                setCohortIdFilter(newFilters.cohort_id || "");
            }}
            availableSources={sources}
            groupedProducts={groupedProducts}
            cohortBrands={groupedProducts.brands}
            onEditCohort={
              canEditCohorts
                ? (id, name, brandName) => {
                    setEditingCohort({ id, name, brandName });
                  }
                : undefined
            }
            isSearching={isSearching}
          />
        ) : currentStage === "finalizing" ? (
          <FinalizingResultsView
            products={filteredProducts}
            onRefresh={refreshAll}
            search={search}
            onSearchChange={(value) => setSearch(value)}
            filters={filterState}
            onFilterChange={applyFilterState}
            availableSources={sources}
            groupedProducts={groupedProducts}
            cohortBrands={groupedProducts.brands}
            onEditCohort={
              canEditCohorts
                ? (id, name, brandName) => {
                    setEditingCohort({ id, name, brandName });
                  }
                : undefined
            }
            selectedSkus={selectedSkus}
            onSelectSku={handleSelectSku}
            isSearching={isSearching}
          />
        ) : currentStage === "exporting" || hideTabs ? (
          <div className="space-y-4">
            {(groupedProducts.cohortIds.length <= 1 && (groupedProducts.cohortIds.length === 0 || groupedProducts.cohortIds[0] === "ungrouped")) ? (
              <ProductTable
                products={filteredProducts}
                selectedSkus={selectedSkus}
                onSelectSku={handleSelectSku}
                onSelectAll={handleSelectAllVisible}
                onDeselectAll={handleClearSelection}
                currentStage={currentStage}
                search={search}
                onSearchChange={(value) => setSearch(value)}
                filters={filterState}
                onFilterChange={applyFilterState}
                availableSources={sources}
                totalCount={totalCount}
                onSelectAllTotal={handleSelectAll}
              />
            ) : (
              <Accordion type="multiple" className="space-y-4">
                {groupedProducts.cohortIds.map((cohortId) => {
                  const groupProducts = groupedProducts.groups[cohortId] || [];
                  return (
                    <AccordionItem
                      key={cohortId}
                      value={cohortId}
                      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
                    >
                      <div className="group flex items-center bg-muted/10 pr-2 hover:bg-muted/30">
                        <AccordionTrigger className="flex-1 px-3 py-2 hover:no-underline [&[data-state=open]>div>svg]:rotate-90">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
                            <div className="flex items-center gap-2 overflow-hidden">
                              <Layers className="h-3.5 w-3.5 shrink-0 text-brand-forest-green/70" />
                              <span className="truncate text-sm font-bold uppercase tracking-tight text-foreground/90">
                                {formatPipelineBatchLabel(
                                  cohortId,
                                  groupedProducts.names[cohortId] || null,
                                )}
                              </span>
                            </div>
                          </div>
                        </AccordionTrigger>

                        <div className="ml-auto flex shrink-0 items-center gap-2 pr-2">
                          {groupedProducts.brands[cohortId] ? (
                            <Badge
                              variant="outline"
                              className="gap-1 border-brand-forest-green/30 text-xs text-brand-forest-green"
                            >
                              <Tag className="h-3 w-3" />
                              {groupedProducts.brands[cohortId]}
                            </Badge>
                          ) : null}
                          <Badge
                            variant="secondary"
                            className="bg-muted font-normal text-muted-foreground"
                          >
                            {groupProducts.length} items
                          </Badge>
                        </div>
                      </div>

                      <AccordionContent className="border-t border-border pt-0">
                        <ProductTable
                          products={groupProducts}
                          selectedSkus={selectedSkus}
                          onSelectSku={(sku, selected, index, isShift) =>
                            handleSelectSku(
                              sku,
                              selected,
                              index,
                              isShift,
                              groupProducts,
                            )
                          }
                          onSelectAll={() => {
                            const groupSkus = new Set(selectedSkus);
                            groupProducts.forEach((p) => groupSkus.add(p.sku));
                            setSelectedSkus(groupSkus);
                          }}
                          onDeselectAll={() => {
                            const groupSkus = new Set(selectedSkus);
                            groupProducts.forEach((p) => groupSkus.delete(p.sku));
                            setSelectedSkus(groupSkus);
                          }}
                          currentStage={currentStage}
                          search={search}
                          onSearchChange={(value) => setSearch(value)}
                          filters={filterState}
                          onFilterChange={applyFilterState}
                          availableSources={sources}
                          totalCount={groupProducts.length}
                          onSelectAllTotal={() => {
                            const groupSkus = new Set(selectedSkus);
                            groupProducts.forEach((p) => groupSkus.add(p.sku));
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
        ) : (
          <div className="space-y-4">
            {(groupedProducts.cohortIds.length <= 1 && (groupedProducts.cohortIds.length === 0 || groupedProducts.cohortIds[0] === "ungrouped")) ? (
              <ProductTable
                products={filteredProducts}
                selectedSkus={selectedSkus}
                onSelectSku={handleSelectSku}
                onSelectAll={handleSelectAllVisible}
                onDeselectAll={handleClearSelection}
                currentStage={currentStage}
                search={search}
                onSearchChange={(value) => setSearch(value)}
                filters={filterState}
                onFilterChange={applyFilterState}
                availableSources={sources}
                totalCount={totalCount}
                onSelectAllTotal={handleSelectAll}
              />
            ) : (
              <Accordion type="multiple" className="space-y-4">
                {groupedProducts.cohortIds.map((cohortId) => {
                  const groupProducts = groupedProducts.groups[cohortId] || [];
                  return (
                    <AccordionItem
                      key={cohortId}
                      value={cohortId}
                      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
                    >
                      <div className="flex items-center hover:bg-muted/30 bg-muted/10 pr-2 group">
                        <AccordionTrigger className="flex-1 px-3 py-2 hover:no-underline [&[data-state=open]>div>svg]:rotate-90">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 text-muted-foreground" />
                            <div className="flex items-center gap-2 overflow-hidden">
                              <Layers className="h-3.5 w-3.5 shrink-0 text-brand-forest-green/70" />
                              <span className="font-bold text-sm uppercase tracking-tight text-foreground/90 truncate">
                                {formatPipelineBatchLabel(
                                  cohortId,
                                  groupedProducts.names[cohortId] || null,
                                )}
                              </span>
                            </div>
                          </div>
                        </AccordionTrigger>

                        <div className="flex items-center gap-2 shrink-0 ml-auto pr-2">
                          {groupedProducts.brands[cohortId] && (
                            <Badge
                              variant="outline"
                              className="text-xs gap-1 border-brand-forest-green/30 text-brand-forest-green"
                            >
                              <Tag className="h-3 w-3" />
                              {groupedProducts.brands[cohortId]}
                            </Badge>
                          )}
                          <Badge
                            variant="secondary"
                            className="bg-muted text-muted-foreground font-normal"
                          >
                            {groupProducts.length} items
                          </Badge>
                          {cohortId !== "ungrouped" &&
                            currentStage === "imported" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-brand-forest-green"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setEditingCohort({
                                    id: cohortId,
                                    name:
                                      groupedProducts.names[cohortId] || null,
                                    brandName:
                                      groupedProducts.brands[cohortId] ||
                                      null,
                                  });
                                }}
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            )}
                        </div>
                      </div>

                      <AccordionContent className="pt-0 border-t border-border">
                        <ProductTable
                          products={groupProducts}
                          selectedSkus={selectedSkus}
                          onSelectSku={(sku, selected, index, isShift) =>
                            handleSelectSku(
                              sku,
                              selected,
                              index,
                              isShift,
                              groupProducts,
                            )
                          }
                          onSelectAll={() => {
                            const groupSkus = new Set(selectedSkus);
                            groupProducts.forEach((p) => groupSkus.add(p.sku));
                            setSelectedSkus(groupSkus);
                          }}
                          onDeselectAll={() => {
                            const groupSkus = new Set(selectedSkus);
                            groupProducts.forEach((p) =>
                              groupSkus.delete(p.sku),
                            );
                            setSelectedSkus(groupSkus);
                          }}
                          currentStage={currentStage}
                          search={search}
                          onSearchChange={(value) => setSearch(value)}
                          filters={filterState}
                          onFilterChange={applyFilterState}
                          availableSources={sources}
                          totalCount={groupProducts.length}
                          onSelectAllTotal={() => {
                            const groupSkus = new Set(selectedSkus);
                            groupProducts.forEach((p) => groupSkus.add(p.sku));
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

        {(isLoading || isNavigating || isSearching) && (
          <div className="absolute inset-0 z-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 rounded-lg bg-background/80 px-8 py-6 shadow-xl border backdrop-blur-sm">
              <Activity className="h-8 w-8 animate-spin text-brand-forest-green" />
              <p className="text-sm font-bold uppercase tracking-tighter">Updating Results...</p>
            </div>
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
          return cId ? groupedProducts.brands[cId] || null : null;
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
            currentStage === "exporting" ? exportActionState : null
          }
          onUploadShopSite={
            currentStage === "exporting"
              ? handleUploadSelectedShopSite
              : undefined
          }
          onDownloadZip={
            currentStage === "exporting" ? handleDownloadSelectedZip : undefined
          }
        />
      )}

      <CohortEditDialog
        open={editingCohort !== null}
        onOpenChange={(open) => !open && setEditingCohort(null)}
        cohortId={editingCohort?.id || ""}
        initialName={editingCohort?.name || null}
        initialBrandName={editingCohort?.brandName || null}
        onSuccess={refreshAll}
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
