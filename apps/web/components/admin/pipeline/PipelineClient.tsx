"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useTransition,
} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";import { toast } from "sonner";
import {
  ChevronRight,
  ArrowLeft,
  Layers,
  Tag,
  Edit2,
  Activity,
} from "lucide-react";
import { StageTabs } from "./StageTabs";
import { ProductTable } from "./ProductTable";
import { ProcessedResultsView } from "./ProcessedResultsView";
import { ActiveEnrichmentsTab } from "./ActiveEnrichmentsTab";
import { ActiveConsolidationsTab } from "./ActiveConsolidationsTab";
import { ReviewingResultsView } from "./ReviewingResultsView";
import { FloatingActionsBar } from "./FloatingActionsBar";
import { ImportedResultsView } from "./ImportedResultsView";
import { PublishingResultsView } from "./PublishingResultsView";
import { PipelineFilters, type PipelineFiltersState } from "./PipelineFilters";
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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import type { Brand } from "@/lib/types";
import type {
  PipelineProduct,
  PipelineStage,
  PersistedPipelineStatus,
  StatusCount,
} from "@/lib/pipeline/types";
import { normalizePipelineStage, STAGE_CONFIG } from "@/lib/pipeline/types";
import { adminFetch } from '@/lib/admin/api-client';

const ScraperSelectDialog = dynamic(
  () => import("./ScraperSelectDialog").then((mod) => mod.ScraperSelectDialog),
  { ssr: false },
);
const CohortEditDialog = dynamic(
  () => import("./CohortEditDialog").then((mod) => mod.CohortEditDialog),
  { ssr: false },
);
const BulkAssignBrandDialog = dynamic(
  () => import("./BulkAssignBrandDialog").then((mod) => mod.BulkAssignBrandDialog),
  { ssr: false },
);
const IntegraImportDialog = dynamic(
  () => import("./IntegraImportDialog").then((mod) => mod.IntegraImportDialog),
  { ssr: false },
);
const ManualAddProductDialog = dynamic(
  () => import("./ManualAddProductDialog").then((mod) => mod.ManualAddProductDialog),
  { ssr: false },
);

const LIVE_OPERATIONAL_TABS = new Set<PipelineStage>([
  "extracting",
  "merging",
]);
const WORKSPACE_TABS = new Set<PipelineStage>(["processed", "reviewing", "imported", "publishing"]);
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
  const searchParams = useSearchParams();  const [isNavigating, startNavigation] = useTransition();

  const stageFromUrl = searchParams.get("stage");
  const currentStage: PipelineStage =
    normalizePipelineStage(stageFromUrl) ?? initialStage;
  const [selectedUpcs, setSelectedUpcs] = useState<Set<string>>(new Set());
  const [products, setProducts] = useState<PipelineProduct[]>(initialProducts);
  const [counts, setCounts] = useState<StatusCount[]>(initialCounts);
  const [sources, setSources] = useState<string[]>(initialSources);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isScrapeDialogOpen, setIsScrapeDialogOpen] = useState(false);
  const [isBulkAssignBrandOpen, setIsBulkAssignBrandOpen] = useState(false);
  const [isIntegraImportOpen, setIsIntegraImportOpen] = useState(false);
  const [isManualAddOpen, setIsManualAddOpen] = useState(false);
  const [consolidationConfig, setConsolidationConfig] = useState<{
    provider: string;
    model: string;
  } | null>(null);

  // Handle bulk brand assignment
  const handleBulkAssignBrand = async (brandId: string | null) => {
    const upcs = Array.from(selectedUpcs);
    if (upcs.length === 0) return;

    setIsLoading(true);
    try {
      const res = await adminFetch("/api/admin/pipeline/bulk/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upcs,
          brandId,
        }),
      });

      if (res.ok) {
        toast.success(
          `Assigned brand to ${upcs.length} product${upcs.length > 1 ? "s" : ""}`,
          { description: "Products are being re-grouped into brand-specific cohorts." }
        );
        setSelectedUpcs(new Set());
        await refreshAll();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to assign brand");
      }
    } catch {
      toast.error("Failed to assign brand");
    } finally {
      setIsLoading(false);
    }
  };
  const [exportActionState, setExportActionState] = useState<
    "upload" | "zip" | null
  >(null);
  const [legacyPreferenceLoaded, setLegacyPreferenceLoaded] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editingCohort, setEditingCohort] = useState<{
    id: string;
    name: string | null;
    brandName: string | null;
    brandId?: string | null;
    brand?: Brand | null;
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setLegacyPreferenceLoaded(true);
  }, []);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (sourceFilter && currentStage === "processed") {
      result = products.filter((product) => {
        const productSources = product.sources ?? {};
        return Object.keys(productSources)
          .filter((key) => !key.startsWith("_"))
          .includes(sourceFilter);
      });
    }

    // Apply stable sort by UPC
    return [...result].sort((a, b) => a.upc.localeCompare(b.upc));
  }, [products, sourceFilter, currentStage]);

  const groupedProducts = useMemo(() => {
    const groups: Record<string, PipelineProduct[]> = {};
    const cohortIds: string[] = [];
    const brands: Record<string, string> = {};
    const brandIds: Record<string, string> = {};
    const brandObjects: Record<string, Brand> = {};
    const names: Record<string, string> = {};

    // Grouping in a single pass
    for (let i = 0; i < filteredProducts.length; i++) {
      const product = filteredProducts[i];
      const cohortId = product.cohort_id || "ungrouped";

      if (!groups[cohortId]) {
        groups[cohortId] = [];
        cohortIds.push(cohortId);
      }
      groups[cohortId].push(product);

      if (cohortId !== "ungrouped") {
        if (product.cohort_brand_name && !brands[cohortId]) {
          brands[cohortId] = product.cohort_brand_name;
        }
        if (product.cohort_brand_id && !brandIds[cohortId]) {
          brandIds[cohortId] = product.cohort_brand_id;
        }
        if (product.cohort_brands && !brandObjects[cohortId]) {
          brandObjects[cohortId] = product.cohort_brands;
        }
        if (product.cohort_name && !names[cohortId]) {
          names[cohortId] = product.cohort_name;
        }
      }
    }

    // Sort IDs: ungrouped first, then alphabetical by name.
    // This is faster than sorting the entire result set multiple times.
    cohortIds.sort((a, b) => {
      if (a === "ungrouped") return -1;
      if (b === "ungrouped") return 1;

      const nameA = names[a]?.trim() || `Batch ${a.slice(0, 8)}`;
      const nameB = names[b]?.trim() || `Batch ${b.slice(0, 8)}`;
      return nameA.localeCompare(nameB);
    });

    return { groups, cohortIds, brands, brandIds, brandObjects, names };
  }, [filteredProducts]);

  const scrapeSelectionValidation = useMemo(() => {
    if (currentStage !== "imported" || selectedUpcs.size === 0) {
      return { allowed: true, reason: null };
    }

    const selectedProducts = filteredProducts.filter((p) => selectedUpcs.has(p.upc));
    const unreadyCohorts: string[] = [];
    const missingUrlCohorts: string[] = [];

    const selectedCohortIds = new Set(selectedProducts.map(p => p.cohort_id || "ungrouped"));

    selectedCohortIds.forEach(cohortId => {
      if (cohortId === "ungrouped") {
        unreadyCohorts.push("Ungrouped Products");
        return;
      }

      const brand = groupedProducts.brandObjects[cohortId];
      const brandName = groupedProducts.brands[cohortId] || `Batch ${cohortId.slice(0, 8)}`;

      if (!brand?.id) {
        unreadyCohorts.push(brandName);
      } else if (!brand.official_domains || brand.official_domains.length === 0) {
        missingUrlCohorts.push(brandName);
      }
    });

    if (unreadyCohorts.length > 0) {
      return {
        allowed: false,
        reason: `Missing Brand: ${unreadyCohorts.join(", ")}`,
      };
    }

    if (missingUrlCohorts.length > 0) {
      return {
        allowed: false,
        reason: `Missing Brand Domains: ${missingUrlCohorts.join(", ")}`,
      };
    }

    return { allowed: true, reason: null };
  }, [currentStage, selectedUpcs, filteredProducts, groupedProducts.brandObjects, groupedProducts.brands]);

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
        setSelectedUpcs(new Set());
        return;
      }

      if (!silent) {
        setIsLoading(true);
        setProducts([]);
      }
      try {
        const params = new URLSearchParams({
          stage,
          limit: "500",
        });
        if (searchTerm) params.set("search", searchTerm);
        if (sourceFilter && stage === "processed")
          params.set("source", sourceFilter);
        if (productLineFilter) params.set("product_line", productLineFilter);
        if (cohortIdFilter) params.set("cohort_id", cohortIdFilter);

        const res = await adminFetch(`/api/admin/pipeline?${params}`, {
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
      const res = await adminFetch("/api/admin/pipeline/counts", {
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

  // Fetch consolidation runtime config to show model/provider info
  const fetchConsolidationConfig = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/consolidation/settings");
      if (res.ok) {
        const data = await res.json();
        if (data.runtime) {
          setConsolidationConfig({
            provider: data.runtime.provider,
            model: data.runtime.model,
          });
        }
      }
    } catch {
      // Silently fail for consolidation config
    }
  }, []);

  // Fetch consolidation config when on the processed stage (where Merge is available)
  useEffect(() => {
    if (currentStage === 'processed') {
      void fetchConsolidationConfig();
    }
  }, [currentStage, fetchConsolidationConfig]);

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
  const lastFetchedParams = useRef({
    search: searchParams.get("search") || "",
    source: searchParams.get("source") || "",
    product_line: searchParams.get("product_line") || "",
    cohort_id: searchParams.get("cohort_id") || "",
  });

  // Sync state with props from Server Component
  useEffect(() => {
    setProducts(initialProducts);
    setCounts(initialCounts);
    setTotalCount(initialTotal);
    setSources(initialSources);
    setSelectedUpcs(new Set());
    setIsLoading(false);

    // Update tracking ref on sync so we don't re-fetch immediately if initialProducts is already filtered
    lastFetchedParams.current = {
      search: searchParams.get("search") || "",
      source: searchParams.get("source") || "",
      product_line: searchParams.get("product_line") || "",
      cohort_id: searchParams.get("cohort_id") || "",
    };
  }, [
    initialProducts,
    initialCounts,
    initialTotal,
    initialSources,
    searchParams,
  ]);

  // Fetch products when search or filters change
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    const hasChanged =
      search !== lastFetchedParams.current.search ||
      sourceFilter !== lastFetchedParams.current.source ||
      productLineFilter !== lastFetchedParams.current.product_line ||
      cohortIdFilter !== lastFetchedParams.current.cohort_id;

    // Skip if nothing changed since last fetch or sync
    if (!hasChanged) {
      return;
    }

    let isMounted = true;

    // Debounce fetch to prevent focus loss and excessive API calls
    const timer = setTimeout(async () => {
      if (!isMounted) return;

      if (isLiveOperationalTab(currentStage)) {
        setProducts([]);
        setTotalCount(0);
        setSelectedUpcs(new Set());
        return;
      }

      // Use silent fetch for search/filter to avoid triggering global isLoading (which unmounts UI)
      setIsSearching(true);
      try {
        await fetchProducts(currentStage, search, true);
      } finally {
        if (isMounted) setIsSearching(false);
      }

      if (isMounted) {
        setSelectedUpcs(new Set());
        lastFetchedParams.current = {
          search,
          source: sourceFilter,
          product_line: productLineFilter,
          cohort_id: cohortIdFilter,
        };
      }
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [search, sourceFilter, productLineFilter, cohortIdFilter, fetchProducts, currentStage]);

  // Sync state from URL (e.g. on navigation or back button)
  useEffect(() => {
    const searchParam = searchParams.get("search") || "";
    const sourceParam = searchParams.get("source") || "";
    const productLineParam = searchParams.get("product_line") || "";
    const cohortIdParam = searchParams.get("cohort_id") || "";

    // IMPORTANT: Only update if the URL actually changed from what we last FETCHED or SYNCED.
    // This prevents the "typed a character, URL hasn't updated yet, so reset state to empty" bug.
    if (searchParam !== lastFetchedParams.current.search) setSearch(searchParam);
    if (sourceParam !== lastFetchedParams.current.source) setSourceFilter(sourceParam);
    if (productLineParam !== lastFetchedParams.current.product_line) {
      setProductLineFilter(productLineParam);
    }
    if (cohortIdParam !== lastFetchedParams.current.cohort_id) {
      setCohortIdFilter(cohortIdParam);
    }

    // We update our ref to match the URL state after syncing
    lastFetchedParams.current = {
      search: searchParam,
      source: sourceParam,
      product_line: productLineParam,
      cohort_id: cohortIdParam,
    };
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
      // Clear local filters before navigating
      // This allows the server to fetch clean data for the new stage
      setSearch("");
      setSourceFilter("");
      setProductLineFilter("");
      setCohortIdFilter("");
      setLastSelectedUpc(null);

      const params = new URLSearchParams(searchParams.toString());
      params.set("stage", stage);
      params.delete("search"); // clear search on stage change
      params.delete("source"); // clear source on stage change
      params.delete("product_line");
      params.delete("cohort_id");

      startNavigation(() => {
        // If we're on the /export subpage, go back to the main pipeline route for other stages
        const targetPath =
          pathname.endsWith("/publish") && stage !== "publishing"
            ? "/admin/pipeline"
            : pathname;
        router.replace(`${targetPath}?${params.toString()}`);
      });
    },
    [pathname, router, searchParams],
  );

  const [lastSelectedUpc, setLastSelectedUpc] = useState<string | null>(null);

  // Toggle product selection with optional Shift+Click range support
  const handleSelectUpc = useCallback(
    (
      upc: string,
      selected: boolean,
      index?: number,
      isShiftClick?: boolean,
      visibleProducts?: PipelineProduct[],
    ) => {
      const sourceProducts = visibleProducts ?? filteredProducts;

      setSelectedUpcs((prev) => {
        const next = new Set(prev);

        if (isShiftClick && index !== undefined && lastSelectedUpc !== null) {
          const lastIndex = sourceProducts.findIndex(
            (p) => p.upc === lastSelectedUpc,
          );

          if (lastIndex !== -1) {
            const [start, end] = [lastIndex, index].sort((a, b) => a - b);
            const rangeUpcs = sourceProducts
              .slice(start, end + 1)
              .map((p) => p.upc);

            if (selected) {
              rangeUpcs.forEach((upcItem) => {
                next.add(upcItem);
              });
            } else {
              rangeUpcs.forEach((upcItem) => {
                next.delete(upcItem);
              });
            }
          } else {
            // Last selected item is not in this specific list (e.g. different cohort).
            // Default to single selection.
            if (selected) next.add(upc);
            else next.delete(upc);
          }
        } else {
          if (selected) {
            next.add(upc);
          } else {
            next.delete(upc);
          }
        }

        return next;
      });

      setLastSelectedUpc(upc);
    },
    [filteredProducts, lastSelectedUpc],
  );

  // Select all visible products
  const handleSelectAllVisible = () => {
    setSelectedUpcs(new Set(filteredProducts.map((p) => p.upc)));
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

      const res = await adminFetch(`/api/admin/pipeline?${params}`);
      if (res.ok) {
        const data = await res.json();
        const allUpcs: string[] = data.upcs || [];
        setSelectedUpcs(new Set(allUpcs));
        toast.success(`Selected all ${allUpcs.length} products`);
      } else {
        handleSelectAllVisible();
      }
    } catch {
      handleSelectAllVisible();
    }
  };

  // Clear selection
  const handleClearSelection = useCallback(() => {
    setSelectedUpcs(new Set());
    setLastSelectedUpc(null);
  }, []);

  // Handle consolidation submission for scraped products
  const handleConsolidate = useCallback(
    async (upcs: string[]) => {
      setIsLoading(true);
      try {
        const res = await adminFetch("/api/admin/consolidation/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            upcs,
            description: `Consolidation batch for ${upcs.length} products`,
            auto_apply: true,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const completed = data.completed_item_count ?? 0;
          const failed = data.failed_item_count ?? 0;
          const applied = data.applied_count ?? completed;

          // Gemini batch: show async toast
          if (data.execution_mode === 'gemini_batch' || data.provider === 'gemini') {
            toast.info(
              `Queued ${data.product_count} product${data.product_count !== 1 ? 's' : ''} for Gemini consolidation`,
              {
                description: 'Image prep and batch processing may take up to 24 hours. Check back in the Consolidating tab.',
              },
            );
          } else {
            toast.success(
              `Consolidated and applied ${applied} of ${data.product_count} product${data.product_count !== 1 ? "s" : ""}`,
              {
                description: failed > 0
                  ? `${failed} failed. Open Consolidating to review errors.`
                  : `Results are live in the Consolidating tab.`,
              },
            );
          }
          setSelectedUpcs(new Set());
          handleStageChange("merging");
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
    const upcs = Array.from(selectedUpcs);
    if (upcs.length === 0) return;
    setConfirmDeleteOpen(true);
  }, [selectedUpcs]);

  const handleConfirmDelete = useCallback(async () => {
    setConfirmDeleteOpen(false);
    const upcs = Array.from(selectedUpcs);
    if (upcs.length === 0) return;

    setIsLoading(true);
    try {
      const res = await adminFetch("/api/admin/pipeline/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upcs }),
      });

      if (res.ok) {
        toast.success(
          `Deleted ${upcs.length} product${upcs.length > 1 ? "s" : ""}`,
        );
        setSelectedUpcs(new Set());
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
  }, [selectedUpcs, refreshAll]);

  const downloadResponseToFile = useCallback(
    async (response: Response, fallbackFilename: string) => {
      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/i);
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
      upcs?: string[],
      options: { includeExportedSelection?: boolean } = {},
    ) => {
      const hasScopedSelection = !!upcs && upcs.length > 0;
      const response = hasScopedSelection
        ? await adminFetch("/api/admin/pipeline/export-zip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            upcs,
            ...(options.includeExportedSelection
              ? { includeExportedSelection: true }
              : {}),
          }),
        })
        : await adminFetch("/api/admin/pipeline/export-zip");

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to download the ShopSite ZIP");
      }

      return response;
    },
    [],
  );

  const uploadPublishedProducts = useCallback(
    async (upcs?: string[]) => {
      const uploadCount = upcs?.length ?? totalCount;
      if (uploadCount === 0) {
        return;
      }

      setExportActionState("upload");
      try {
        const response = await adminFetch("/api/admin/pipeline/upload-shopsite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(upcs && upcs.length > 0 ? { upcs } : {}),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            payload.error || "Failed to sync products to ShopSite",
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
        const publishWarning =
          typeof payload.publishWarning === "string" &&
            payload.publishWarning.length > 0
            ? payload.publishWarning
            : null;
        const uploadedUpcs = Array.isArray(payload.uploadedUpcs)
          ? (payload.uploadedUpcs as unknown[]).filter(
            (upc: unknown): upc is string =>
              typeof upc === "string" && upc.length > 0,
          )
          : (upcs ?? []);
        let zipDownloaded = false;

        try {
          setExportActionState("zip");
          const zipResponse = await fetchPublishedImageZipResponse(
            uploadedUpcs,
            {
              includeExportedSelection: true,
            },
          );
          await downloadResponseToFile(zipResponse, "shopsite-images.zip");
          zipDownloaded = true;
        } catch (zipError) {
          toast.error(
            zipError instanceof Error
              ? zipError.message
              : "Synced to ShopSite, but failed to download the ShopSite ZIP",
          );
        }

        setSelectedUpcs(new Set());
        await refreshAll();

        toast.success("ShopSite sync complete", {
          description: `${uploadedCount} storefront product${uploadedCount === 1 ? "" : "s"} archived${marker ? ` and tagged ${marker}` : ""}${zipDownloaded ? "; ShopSite ZIP downloaded" : ""}`,
        });

        if (publishWarning) {
          toast.warning("ShopSite publish still running", {
            description: publishWarning,
          });
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to sync products to ShopSite",
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
    async (upcs?: string[]) => {
      const exportCount = upcs?.length ?? totalCount;
      if (exportCount === 0) {
        return;
      }

      setExportActionState("zip");
      try {
        const response = await fetchPublishedImageZipResponse(upcs);
        await downloadResponseToFile(response, "shopsite-images.zip");

        toast.success("ShopSite ZIP downloaded", {
          description: `${exportCount} storefront product${exportCount === 1 ? "" : "s"}`,
        });
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to download the ShopSite ZIP",
        );
      } finally {
        setExportActionState(null);
      }
    },
    [downloadResponseToFile, fetchPublishedImageZipResponse, totalCount],
  );

  const handleUploadSelectedShopSite = useCallback(() => {
    void uploadPublishedProducts(Array.from(selectedUpcs));
  }, [uploadPublishedProducts, selectedUpcs]);

  const handleDownloadSelectedZip = useCallback(() => {
    void downloadPublishedImageZip(Array.from(selectedUpcs));
  }, [downloadPublishedImageZip, selectedUpcs]);

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
      } else if (selectedUpcs.size > 0) {
        if (e.key.toLowerCase() === "s") {
          if (currentStage === "imported") {
            e.preventDefault();
            setIsScrapeDialogOpen(true);
          }
        } else if (e.key.toLowerCase() === "c") {
          if (currentStage === "processed") {
            e.preventDefault();
            handleConsolidate(Array.from(selectedUpcs));
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
    selectedUpcs,
    currentStage,
    handleClearSelection,
    refreshAll,
    handleConsolidate,
    handleDelete,
  ]);

  // Handle bulk status transition (non-scrape stages)
  const handleBulkAction = async (nextStage: PersistedPipelineStatus) => {
    const upcs = Array.from(selectedUpcs);
    if (upcs.length === 0) return;

    const isReset = nextStage === "imported";

    setIsLoading(true);
    try {
      const res = await adminFetch("/api/admin/pipeline/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upcs,
          toStatus: nextStage,
          resetResults: isReset,
        }),
      });

      if (res.ok) {
        const payload = await res.json().catch(() => null);
        const updatedCount =
          typeof payload?.updatedCount === "number"
            ? payload.updatedCount
            : upcs.length;
        toast.success(
          nextStage === "publishing"
            ? `Published ${updatedCount} product${updatedCount === 1 ? "" : "s"} to the storefront`
            : `Moved ${updatedCount} product${updatedCount === 1 ? "" : "s"} to ${nextStage}`,
        );
        setSelectedUpcs(new Set());
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
    const upcs = Array.from(selectedUpcs);
    if (upcs.length === 0) return;

    setIsLoading(true);
    try {
      const res = await adminFetch("/api/admin/pipeline/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upcs,
          toStatus: previousStage,
          resetResults: true,
        }),
      });

      if (res.ok) {
        toast.success(
          `Reset ${upcs.length} product${upcs.length > 1 ? "s" : ""} to ${previousStage}`,
        );
        setSelectedUpcs(new Set());
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

  // Handle scrape dialog confirm — creates static scraper jobs only
  const handleScrapeConfirm = async (scrapers: string[]) => {
    const upcs = Array.from(selectedUpcs);
    if (upcs.length === 0) return;

    const isAdditionalScrape = currentStage === "processed";

    try {
      const res = await adminFetch("/api/admin/pipeline/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upcs,
          scrapers,
          cohort_id: cohortIdFilter || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(
          isAdditionalScrape
            ? `Started additional scrape for ${upcs.length} product${upcs.length > 1 ? "s" : ""}`
            : `Created scrape job for ${upcs.length} product${upcs.length > 1 ? "s" : ""} with ${scrapers.length} scraper${scrapers.length !== 1 ? "s" : ""}`,
          {
            description: `Job ID: ${data.jobIds?.[0]?.slice(0, 8) ?? "unknown"}...`,
          },
        );

        setIsScrapeDialogOpen(false);
        setSelectedUpcs(new Set());

        if (isAdditionalScrape) {
          setSearch("");
          await refreshAll();
        } else {
          handleStageChange("extracting");
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

  const headerActions = (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
      {shellControlsBelongToRoute ? (
        <>
          <div className="hidden h-8 w-8 shrink-0 items-center justify-center border border-border bg-card transition-colors hover:bg-muted/50 sm:flex">
            <Checkbox
              aria-label="Select all visible products"
              checked={
                filteredProducts.length > 0 &&
                  filteredProducts.every((p) => selectedUpcs.has(p.upc))
                  ? true
                  : filteredProducts.some((p) => selectedUpcs.has(p.upc))
                    ? 'indeterminate'
                    : false
              }
              onCheckedChange={(checked) => {
                if (checked) {
                  const next = new Set(selectedUpcs);
                  filteredProducts.forEach((p) => {
                    next.add(p.upc);
                  });
                  setSelectedUpcs(next);
                } else {
                  const next = new Set(selectedUpcs);
                  filteredProducts.forEach((p) => {
                    next.delete(p.upc);
                  });
                  setSelectedUpcs(next);
                }
              }}
              className="h-4 w-4 rounded-none border border-border accent-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground"
            />
          </div>
          <PipelineSearchField value={search} onChange={setSearch} className="w-full min-w-0 sm:w-56 md:w-64" />
        </>
      ) : null}

      {shellControlsBelongToRoute ? (
        <PipelineFilters
          filters={filterState}
          onFilterChange={applyFilterState}
          availableSources={sources}
          showSourceFilter={false}
          className="h-10 w-full justify-center sm:h-8 sm:w-auto"
        />
      ) : null}

      {currentStage === "imported" && (
        <>
          {/* Buttons moved to ImportedResultsView sidebar */}
        </>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* Stage Tabs & Inline Actions */}
      <div className="shrink-0">
        {hideTabs ? (
          <div className="admin-panel flex flex-col gap-2 p-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/admin/pipeline")}
                className="h-8 w-8 p-0 border-border/50 hover:bg-muted text-muted-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                <div
                  className="h-6 w-1 rounded-full"
                  style={{ backgroundColor: stageConfig.color }}
                />
                <div>
                  <h2 className="text-lg font-semibold text-foreground leading-none">
                    {stageConfig.label}
                  </h2>
                  <p className="text-[10px] font-semibold text-muted-foreground mt-1 uppercase tracking-wider">
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
      </div>

      {/* Content Area */}
      <div className={cn(
        'relative flex-1 min-h-0 px-0.5 pb-0.5 transition-opacity',
        isLiveOperationalTab(currentStage) ? 'overflow-y-auto' : 'overflow-hidden',
        (isLoading || isNavigating) && 'pointer-events-none opacity-50'
      )}>
        <div className="flex flex-col flex-1 h-full w-full min-h-0">
          {currentStage === "extracting" ? (
            <ActiveEnrichmentsTab />
          ) : currentStage === "merging" ? (
            <ActiveConsolidationsTab />
          ) : currentStage === "processed" ? (
            <ProcessedResultsView
              products={filteredProducts}
              selectedUpcs={selectedUpcs}
              onSelectUpc={handleSelectUpc}
              onSelectAll={(upcs: string[]) => {
                setSelectedUpcs((prev) => {
                  const next = new Set(prev);
                  upcs.forEach((upc) => {
                    next.add(upc);
                  });
                  return next;
                });
              }}
              onDeselectAll={(upcs: string[]) => {
                setSelectedUpcs((prev) => {
                  const next = new Set(prev);
                  upcs.forEach((upc) => {
                    next.delete(upc);
                  });
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
              groupedProducts={{
                groups: groupedProducts.groups,
                cohortIds: groupedProducts.cohortIds,
                names: groupedProducts.names,
                brands: groupedProducts.brandObjects,
              }}
              cohortBrands={groupedProducts.brands}
              cohortBrandObjects={groupedProducts.brandObjects}
              onEditCohort={
                canEditCohorts
                  ? (id: string, name: string | null, brandName: string | null) => {
                    setEditingCohort({
                      id,
                      name: name ?? null,
                      brandName: brandName ?? null,
                      brandId: groupedProducts.brandIds?.[id] || null,
                      brand: groupedProducts.brandObjects?.[id] || null,
                    });
                  }
                  : undefined
              }
              isSearching={isSearching}
            />
          ) : currentStage === "reviewing" ? (
            <div data-testid="reviewing-results" className="contents">
              <ReviewingResultsView
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
                      setEditingCohort({
                        id,
                        name,
                        brandName,
                        brandId: groupedProducts.brandIds[id] || null,
                        brand: groupedProducts.brandObjects[id] || null,
                      });
                    }
                    : undefined
                }
                selectedUpcs={selectedUpcs}
                onSelectUpc={handleSelectUpc}
                isSearching={isSearching}
              />
            </div>
          ) : currentStage === "imported" || hideTabs ? (
            <ImportedResultsView
              products={filteredProducts}
              onRefresh={refreshAll}
              search={search}
              onSearchChange={(value) => setSearch(value)}
              filters={filterState}
              onFilterChange={applyFilterState}
              availableSources={sources}
              groupedProducts={groupedProducts}
              cohortBrands={groupedProducts.brands}
              cohortBrandObjects={groupedProducts.brandObjects}
              onEditCohort={
                canEditCohorts
                  ? (id, name, brandName) => {
                    setEditingCohort({
                      id,
                      name,
                      brandName,
                      brandId: groupedProducts.brandIds[id] || null,
                      brand: groupedProducts.brandObjects[id] || null,
                    });
                  }
                  : undefined
              }
              onImportCsv={() => setIsIntegraImportOpen(true)}
              onManualAdd={() => setIsManualAddOpen(true)}
              isSearching={isSearching}
              isLoading={isLoading}
            />
          ) : currentStage === "publishing" ? (
            <PublishingResultsView
              products={filteredProducts}
              onRefresh={refreshAll}
              search={search}
              onSearchChange={(value) => setSearch(value)}
              filters={filterState}
              onFilterChange={applyFilterState}
              availableSources={sources}
              selectedUpcs={selectedUpcs}
              onSelectUpc={handleSelectUpc}
              onSelectAll={handleSelectAllVisible}
              onClearSelection={handleClearSelection}
              isLoading={isLoading}
            />
          ) : (
            <div className="flex flex-col h-full min-h-0">
              {groupedProducts.cohortIds.length <= 1 &&
                (groupedProducts.cohortIds.length === 0 ||
                  groupedProducts.cohortIds[0] === "ungrouped") ? (
                <ProductTable
                  products={filteredProducts}
                  selectedUpcs={selectedUpcs}
                  onSelectUpc={handleSelectUpc}
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
                <div className="border border-border bg-card overflow-hidden rounded-[var(--surface-admin-radius)]">
                  <Accordion type="multiple" className="divide-y divide-border">
                    {groupedProducts.cohortIds.map((cohortId) => {
                      const groupProducts =
                        groupedProducts.groups[cohortId] || [];
                      const cohortUpcs = groupProducts.map((p) => p.upc);
                      const allSelected = groupProducts.length > 0 && groupProducts.every((p) => selectedUpcs.has(p.upc));
                      const someSelected = groupProducts.some((p) => selectedUpcs.has(p.upc)) && !allSelected;

                      return (
                        <AccordionItem
                          key={cohortId}
                          value={cohortId}
                          className="border-none"
                        >
                          <div className="flex items-center hover:bg-muted/30 bg-muted/10 pr-2 group border-b border-border last:border-b-0">
                            <div className="pl-4 flex items-center shrink-0">
                              <input
                                type="checkbox"
                                checked={allSelected}
                                ref={el => {
                                  if (el) el.indeterminate = someSelected;
                                }}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    const next = new Set(selectedUpcs);
                                    cohortUpcs.forEach((s) => {
                                      next.add(s);
                                    });
                                    setSelectedUpcs(next);
                                  } else {
                                    const next = new Set(selectedUpcs);
                                    cohortUpcs.forEach((s) => {
                                      next.delete(s);
                                    });
                                    setSelectedUpcs(next);
                                  }
                                }}
                                className="h-4 w-4 rounded-none border border-border cursor-pointer accent-primary"
                              />
                            </div>

                            <AccordionTrigger
                              hideIcon
                              className="flex-1 px-3 py-3 hover:no-underline [&[data-state=open]>div>svg]:rotate-90"
                            >
                              <div className="flex items-center gap-3 overflow-hidden">
                                <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 text-foreground" />
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <Layers className="h-4 w-4 shrink-0 text-brand-forest-green" />
                                  <span className="font-bold text-base uppercase tracking-tighter text-foreground truncate">
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
                                  className="rounded-none border border-brand-forest-green bg-brand-forest-green/10 text-brand-forest-green font-semibold text-[10px] gap-1"
                                >
                                  <Tag className="h-3 w-3" />
                                  {groupedProducts.brands[cohortId]}
                                </Badge>
                              )}
                              <Badge
                                variant="secondary"
                                className="bg-foreground text-background rounded-none font-semibold text-[10px]"
                              >
                                {groupProducts.length} items
                              </Badge>
                              {cohortId !== "ungrouped" &&
                                canEditCohorts && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 border border-border text-foreground hover:bg-muted rounded-none active:translate-x-[1px] active:translate-y-[1px] transition-all px-2 text-[10px] font-semibold"
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
                                        brandId:
                                          groupedProducts.brandIds[cohortId] ||
                                          null,
                                        brand:
                                          groupedProducts.brandObjects[cohortId] ||
                                          null,
                                      });
                                    }}
                                  >
                                    <Edit2 className="h-3 w-3 mr-1" />
                                    Edit Batch
                                  </Button>
                                )}
                            </div>
                          </div>

                          <AccordionContent className="pt-0">
                            {cohortId === "ungrouped" && (
                              <div className="px-4 py-2 bg-muted/30 border-b border-border text-[10px] font-semibold text-muted-foreground">
                                Products without a valid numeric UPC cannot be
                                auto-grouped into cohorts.
                              </div>
                            )}
                            <ProductTable
                              products={groupProducts}
                              selectedUpcs={selectedUpcs}
                              onSelectUpc={(upc, selected, index, isShift) =>
                                handleSelectUpc(
                                  upc,
                                  selected,
                                  index,
                                  isShift,
                                  groupProducts,
                                )
                              }
                              onSelectAll={() => {
                                const groupUpcs = new Set(selectedUpcs);
                                groupProducts.forEach((p) => {
                                  groupUpcs.add(p.upc);
                                });
                                setSelectedUpcs(groupUpcs);
                              }}
                              onDeselectAll={() => {
                                const groupUpcs = new Set(selectedUpcs);
                                groupProducts.forEach((p) => {
                                  groupUpcs.delete(p.upc);
                                });
                                setSelectedUpcs(groupUpcs);
                              }}
                              currentStage={currentStage}
                              search={search}
                              onSearchChange={(value) => setSearch(value)}
                              filters={filterState}
                              onFilterChange={applyFilterState}
                              availableSources={sources}
                              totalCount={groupProducts.length}
                              onSelectAllTotal={() => {
                                const groupUpcs = new Set(selectedUpcs);
                                groupProducts.forEach((p) => {
                                  groupUpcs.add(p.upc);
                                });
                                setSelectedUpcs(groupUpcs);
                              }}
                            />
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </div>
              )}
            </div>
          )}
        </div>

        {(isLoading || isNavigating || isSearching) && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center"
            role="status"
            aria-live="polite"
            aria-busy={isLoading || isNavigating || isSearching}
          >
            <div className="flex flex-col items-center gap-2 rounded-[var(--surface-admin-radius)] border border-border bg-background/96 px-8 py-6 shadow-[var(--shadow-sm)] backdrop-blur-sm">
              <Activity className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">Updating results...</p>
            </div>
          </div>
        )}
      </div>

      {/* Scraper Selection Dialog */}
      <ScraperSelectDialog
        open={isScrapeDialogOpen}
        onOpenChange={setIsScrapeDialogOpen}
        selectedUpcCount={selectedUpcs.size}
        onConfirm={handleScrapeConfirm}
      />

      {/* Floating Bulk Actions Bar */}
      {!isLiveOperationalTab(currentStage) && currentStage !== "imported" && currentStage !== "publishing" && (
        <FloatingActionsBar
          selectedCount={selectedUpcs.size}
          totalCount={totalCount}
          currentStage={currentStage}
          isLoading={isLoading}
          onClearSelection={handleClearSelection}
          onSelectAll={handleSelectAll}
          onBulkAction={handleBulkAction}
          onResetStage={handleResetStage}
          onConsolidate={() => handleConsolidate(Array.from(selectedUpcs))}
          consolidationInfo={consolidationConfig}
          onOpenScrapeDialog={() => setIsScrapeDialogOpen(true)}
          onAssignBrand={() => setIsBulkAssignBrandOpen(true)}
          scrapeSelectionValidation={scrapeSelectionValidation}

          onDelete={handleDelete}
          actionState={(currentStage as PipelineStage) === "publishing" ? exportActionState : null}
          onUploadShopSite={
            (currentStage as PipelineStage) === "publishing"
              ? handleUploadSelectedShopSite
              : undefined
          }
          onDownloadZip={
            (currentStage as PipelineStage) === "publishing" ? handleDownloadSelectedZip : undefined
          }
          showLegacyShopSiteActions={false}
        />
      )}

      <BulkAssignBrandDialog
        open={isBulkAssignBrandOpen}
        onOpenChange={setIsBulkAssignBrandOpen}
        selectedCount={selectedUpcs.size}
        onConfirm={handleBulkAssignBrand}
      />

      <CohortEditDialog
        open={editingCohort !== null}
        onOpenChange={(open) => !open && setEditingCohort(null)}
        cohortId={editingCohort?.id || ""}
        initialName={editingCohort?.name || null}
        initialBrandName={editingCohort?.brandName || null}
        initialBrandId={editingCohort?.brandId}
        initialBrand={editingCohort?.brand}
        onSuccess={refreshAll}
      />

      <ConfirmationDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        onConfirm={handleConfirmDelete}
        title="Delete Products"
        description={`Are you sure you want to permanently delete ${selectedUpcs.size} product${selectedUpcs.size > 1 ? "s" : ""}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        isLoading={isLoading}
      />

      {isIntegraImportOpen && (
        <IntegraImportDialog
          onSuccess={refreshAll}
          onCancel={() => setIsIntegraImportOpen(false)}
        />
      )}

      {isManualAddOpen && (
        <ManualAddProductDialog
          onSuccess={refreshAll}
          onCancel={() => setIsManualAddOpen(false)}
        />
      )}
    </div>
  );
}
