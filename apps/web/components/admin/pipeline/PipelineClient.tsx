"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  Activity,
  Brain,
  ChevronRight,
  ArrowLeft,
  Layers,
  Tag,
  Edit2,
  Globe,
} from "lucide-react";
import { StageTabs } from "./StageTabs";
import { ProductTable } from "./ProductTable";
import { ScrapedResultsView } from "./ScrapedResultsView";
import { FloatingActionsBar } from "./FloatingActionsBar";
import { ActiveRunsTab } from "./ActiveRunsTab";
import { ActiveConsolidationsTab } from "./ActiveConsolidationsTab";
import { FinalizingResultsView } from "./FinalizingResultsView";
import { ImportedResultsView } from "./ImportedResultsView";
import { SearchingTab } from "./SearchingTab";
import { UrlReviewWorkspace } from "./UrlReviewWorkspace";
import { PipelineFilters, type PipelineFiltersState } from "./PipelineFilters";
import { PipelineSearchField } from "./PipelineSearchField";
import { formatPipelineBatchLabel } from "./view-utils";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import {
  AdminCard,
  AdminCardHeader,
  AdminCardTitle,
  AdminCardDescription,
  AdminCardContent,
} from "@/components/admin/admin-card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
  "searching",
  "extracting",
  "scraping",
  "consolidating",
]);
const WORKSPACE_TABS = new Set<PipelineStage>(["scraped", "url_review", "finalizing", "imported", "exporting"]);
const EMPTY_SOURCES: string[] = [];
const PIPELINE_LEGACY_FIELDS_STORAGE_KEY = "baystate.pipeline.show-legacy-shopsite-fields";

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
  const [showLegacyShopSiteFields, setShowLegacyShopSiteFields] =
    useState(false);
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

    const storedPreference = window.localStorage.getItem(
      PIPELINE_LEGACY_FIELDS_STORAGE_KEY,
    );
    if (storedPreference === "true") {
      setShowLegacyShopSiteFields(true);
    }
    setLegacyPreferenceLoaded(true);
  }, []);

  useEffect(() => {
    if (!legacyPreferenceLoaded || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      PIPELINE_LEGACY_FIELDS_STORAGE_KEY,
      String(showLegacyShopSiteFields),
    );
  }, [legacyPreferenceLoaded, showLegacyShopSiteFields]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (sourceFilter && currentStage === "scraped") {
      result = products.filter((product) => {
        const productSources = product.sources ?? {};
        return Object.keys(productSources)
          .filter((key) => !key.startsWith("_"))
          .includes(sourceFilter);
      });
    }

    // Apply stable sort by SKU
    return [...result].sort((a, b) => a.sku.localeCompare(b.sku));
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

  const officialBrandSelection = useMemo(() => {
    const selectedProducts = filteredProducts.filter((product) =>
      selectedSkus.has(product.sku),
    );

    if (selectedProducts.length === 0) {
      return {
        allowed: false,
        reason: "Select products from one cohort to use Official Brand.",
      };
    }

    const cohortIds = Array.from(
      new Set(
        selectedProducts.map((product) => product.cohort_id || "ungrouped"),
      ),
    );

    if (cohortIds.length !== 1) {
      return {
        allowed: false,
        reason: "Official Brand requires one cohort at a time. Select products from a single cohort.",
      };
    }

    const cohortId = cohortIds[0];
    if (!cohortId || cohortId === "ungrouped") {
      return {
        allowed: false,
        reason: "Official Brand only works on grouped cohort batches.",
      };
    }

    const brand = groupedProducts.brandObjects[cohortId] || null;
    if (!brand?.id) {
      return {
        allowed: false,
        reason: "Official Brand requires the selected cohort to have an assigned registry brand.",
      };
    }

    const hasConfiguredDomains = Boolean(
      (brand.official_domains && brand.official_domains.length > 0)
        || (brand.preferred_domains && brand.preferred_domains.length > 0),
    );

    if (!hasConfiguredDomains) {
      return {
        allowed: false,
        reason: "Official Brand requires the cohort brand to have official or preferred domains configured.",
      };
    }

    return {
      allowed: true,
      reason: null,
      cohortId,
      brandName: groupedProducts.brands[cohortId] || brand.name || null,
    };
  }, [filteredProducts, groupedProducts.brandObjects, groupedProducts.brands, selectedSkus]);

  const scrapeSelectionValidation = useMemo(() => {
    if (currentStage !== "imported" || selectedSkus.size === 0) {
      return { allowed: true, reason: null };
    }

    const selectedProducts = filteredProducts.filter((p) => selectedSkus.has(p.sku));
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
      } else if (
        (!brand.official_domains || brand.official_domains.length === 0)
        && (!brand.preferred_domains || brand.preferred_domains.length === 0)
      ) {
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
  }, [currentStage, selectedSkus, filteredProducts, groupedProducts.brandObjects, groupedProducts.brands]);

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
    setSelectedSkus(new Set());
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
        setSelectedSkus(new Set());
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
        setSelectedSkus(new Set());
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
      setLastSelectedSku(null);

      const params = new URLSearchParams(searchParams.toString());
      params.set("stage", stage);
      params.delete("search"); // clear search on stage change
      params.delete("source"); // clear source on stage change
      params.delete("product_line");
      params.delete("cohort_id");

      startNavigation(() => {
        // If we're on the /export subpage, go back to the main pipeline route for other stages
        const targetPath =
          pathname.endsWith("/export") && stage !== "exporting"
            ? "/admin/pipeline"
            : pathname;
        router.replace(`${targetPath}?${params.toString()}`);
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
        throw new Error(payload.error || "Failed to download the ShopSite ZIP");
      }

      return response;
    },
    [],
  );

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
        const uploadedSkus = Array.isArray(payload.uploadedSkus)
          ? (payload.uploadedSkus as unknown[]).filter(
              (sku: unknown): sku is string =>
                typeof sku === "string" && sku.length > 0,
            )
          : (skus ?? []);
        let zipDownloaded = false;

        try {
          setExportActionState("zip");
          const zipResponse = await fetchPublishedImageZipResponse(
            uploadedSkus,
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

        setSelectedSkus(new Set());
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
    async (skus?: string[]) => {
      const exportCount = skus?.length ?? totalCount;
      if (exportCount === 0) {
        return;
      }

      setExportActionState("zip");
      try {
        const response = await fetchPublishedImageZipResponse(skus);
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

    const isReset = nextStage === "imported";

    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/pipeline/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skus,
          toStatus: nextStage,
          resetResults: isReset,
        }),
      });

      if (res.ok) {
        const payload = await res.json().catch(() => null);
        const updatedCount =
          typeof payload?.updatedCount === "number"
            ? payload.updatedCount
            : skus.length;
        toast.success(
          nextStage === "exporting"
            ? `Published ${updatedCount} product${updatedCount === 1 ? "" : "s"} to the storefront`
            : `Moved ${updatedCount} product${updatedCount === 1 ? "" : "s"} to ${nextStage}`,
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
    enrichmentMethod: "scrapers" | "official_brand",
    options?: { phase?: "url_discovery" | "extraction"; urlsBySku?: Record<string, string> },
  ) => {
    const skus = Array.from(selectedSkus);
    if (skus.length === 0) return;

    if (enrichmentMethod === "official_brand" && options?.phase === "url_discovery") {
      const res = await fetch("/api/admin/pipeline/official-brand/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cohort_id: officialBrandSelection.cohortId,
          skus,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(
          `Discovered URLs for ${skus.length} product${skus.length > 1 ? "s" : ""}`,
          {
            description: `${data.candidate_count} URL candidates found`,
            action: {
              label: "Review Candidates",
              onClick: () => router.push(`/admin/pipeline?stage=url_review&cohort_id=${encodeURIComponent(officialBrandSelection.cohortId ?? "")}`),
            },
          },
        );
        setIsScrapeDialogOpen(false);
        setSelectedSkus(new Set());
        await refreshAll();
      } else {
        const error = await res.json();
        toast.error(error.error || "Discovery failed");
      }
      return;
    }

    if (enrichmentMethod === "official_brand" && !officialBrandSelection.allowed) {
      toast.error(
        officialBrandSelection.reason ||
          "Official Brand requires one eligible cohort at a time.",
      );
      return;
    }

    const isAdditionalScrape = currentStage === "scraped";

    try {
      const res = await fetch("/api/admin/pipeline/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skus,
          scrapers,
          enrichment_method: enrichmentMethod,
          cohort_id:
            enrichmentMethod === "official_brand"
              ? officialBrandSelection.cohortId
              : cohortIdFilter || undefined,
          ...(enrichmentMethod === "official_brand" && options?.phase ? { official_brand_phase: options.phase } : {}),
          ...(enrichmentMethod === "official_brand" && options?.urlsBySku ? { urls_by_sku: options.urlsBySku } : {}),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const isOfficialBrandDiscovery =
          enrichmentMethod === "official_brand" && options?.phase === "url_discovery";
        const reviewCohortId = officialBrandSelection.cohortId;
        toast.success(
          isOfficialBrandDiscovery
            ? `Started Official Brand discovery for ${skus.length} product${skus.length > 1 ? "s" : ""}`
            : isAdditionalScrape
              ? `Started additional scrape for ${skus.length} product${skus.length > 1 ? "s" : ""}`
              : `Created scrape job for ${skus.length} product${skus.length > 1 ? "s" : ""} with ${scrapers.length} scraper${scrapers.length !== 1 ? "s" : ""}`,
          {
            description: isOfficialBrandDiscovery
              ? `Candidates will be saved for review. Job ID: ${data.jobIds?.[0]?.slice(0, 8) ?? "unknown"}...`
              : `Job ID: ${data.jobIds?.[0]?.slice(0, 8) ?? "unknown"}...`,
            ...(isOfficialBrandDiscovery && reviewCohortId
              ? {
                  action: {
                    label: "Review Candidates",
                    onClick: () => router.push(`/admin/pipeline?stage=url_review&cohort_id=${encodeURIComponent(reviewCohortId)}`),
                  },
                }
              : {}),
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

  // Handle discover official brand from floating actions bar
  const handleDiscoverOfficialBrand = async () => {
    const skus = Array.from(selectedSkus);
    if (skus.length === 0) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/pipeline/official-brand/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cohort_id: officialBrandSelection.cohortId,
          skus,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(
          `Discovered URLs for ${skus.length} product${skus.length > 1 ? "s" : ""}`,
          {
            description: `${data.candidate_count} URL candidates found`,
            action: {
              label: "Review Candidates",
              onClick: () => router.push(`/admin/pipeline?stage=url_review&cohort_id=${encodeURIComponent(officialBrandSelection.cohortId ?? "")}`),
            },
          },
        );
        setSelectedSkus(new Set());
        handleStageChange("url_review");
      } else {
        const error = await res.json();
        toast.error(error.error || "Discovery failed");
      }
    } catch {
      toast.error("Failed to start discovery");
    } finally {
      setIsLoading(false);
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
  const officialBrandReviewCohortId =
    cohortIdFilter ||
    (officialBrandSelection.allowed && officialBrandSelection.cohortId
      ? officialBrandSelection.cohortId
      : "");
  const officialBrandReviewHref = officialBrandReviewCohortId
    ? `/admin/pipeline?stage=url_review&cohort_id=${encodeURIComponent(officialBrandReviewCohortId)}`
    : null;
  const canDiscoverOfficialBrand = currentStage === "imported" && officialBrandSelection.allowed && selectedSkus.size > 0;
  const showLegacyShopSiteToggle =
    currentStage === "finalizing" || currentStage === "exporting";
  const applyFilterState = (newFilters: PipelineFiltersState) => {
    setSourceFilter(newFilters.source || "");
    setProductLineFilter(newFilters.product_line || "");
    setCohortIdFilter(newFilters.cohort_id || "");
  };

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {shellControlsBelongToRoute ? (
        <>
          <div className="flex shrink-0 items-center justify-center h-8 w-8 border border-border bg-card hover:bg-muted/50 transition-colors">
            <Checkbox
              aria-label="Select all visible products"
              checked={
                filteredProducts.length > 0 &&
                filteredProducts.every((p) => selectedSkus.has(p.sku))
                  ? true
                  : filteredProducts.some((p) => selectedSkus.has(p.sku))
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(checked) => {
                if (checked) {
                  const next = new Set(selectedSkus);
                  filteredProducts.forEach((p) => {
                    next.add(p.sku);
                  });
                  setSelectedSkus(next);
                } else {
                  const next = new Set(selectedSkus);
                  filteredProducts.forEach((p) => {
                    next.delete(p.sku);
                  });
                  setSelectedSkus(next);
                }
              }}
              className="h-4 w-4 rounded-none border border-border accent-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground"
            />
          </div>
          <PipelineSearchField
            value={search}
            onChange={setSearch}
            className="w-48 md:w-64"
          />
        </>
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

      {officialBrandReviewHref ? (
        <Button variant="outline" size="sm" asChild className="h-8">
          <Link href={officialBrandReviewHref}>
            <Globe className="h-4 w-4" />
            Official Brand Candidates
          </Link>
        </Button>
      ) : null}

      {showLegacyShopSiteToggle ? (
        <label className="flex h-8 items-center gap-2 border border-border bg-card px-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          <span className={cn(showLegacyShopSiteFields && "text-foreground")}>
            Legacy / ShopSite
          </span>
          <Switch
            checked={showLegacyShopSiteFields}
            onCheckedChange={setShowLegacyShopSiteFields}
            aria-label="Show legacy ShopSite fields"
          />
        </label>
      ) : null}

      {currentStage === "imported" && (
        <>
          {/* Buttons moved to ImportedResultsView sidebar */}
        </>
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Stage Tabs & Inline Actions */}
      <div className="shrink-0">
        {hideTabs ? (
          <div className="flex flex-col gap-1 border-b border-border/50 pb-1 xl:flex-row xl:items-center xl:justify-between">
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
                  <h1 className="text-lg font-black uppercase tracking-tighter text-foreground">
                    {stageConfig.label}
                  </h1>
                  <p className="text-[10px] font-black uppercase text-muted-foreground">
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
        "flex-1 min-h-0 relative transition-opacity p-1 pr-4 pb-4",
        isLiveOperationalTab(currentStage) ? "overflow-y-auto" : "overflow-hidden",
        (isLoading || isNavigating) && "opacity-50 pointer-events-none"
      )}>
        <div className="flex flex-col flex-1 h-full w-full min-h-0">
          {currentStage === "searching" ? (
            <SearchingTab />
          ) : currentStage === "extracting" ? (
            <div className="grid gap-4 xl:grid-cols-1 p-1 pr-8 pb-8">
              <AdminCard variant="panel">
                <AdminCardHeader>
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Activity className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <AdminCardTitle>Official Brand Extraction</AdminCardTitle>
                    <AdminCardDescription>
                      Live Official Brand extraction jobs currently running or queued.
                    </AdminCardDescription>
                  </div>
                </AdminCardHeader>
                <AdminCardContent>
                  <ActiveRunsTab jobSubtype="official_brand_extraction" />
                </AdminCardContent>
              </AdminCard>
            </div>
          ) : currentStage === "scraping" ? (
            <div className="grid gap-4 xl:grid-cols-1 p-1 pr-8 pb-8">
              <AdminCard variant="panel">
                <AdminCardHeader>
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Activity className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <AdminCardTitle>Active Runs</AdminCardTitle>
                    <AdminCardDescription>
                      Live scraper jobs currently running or queued.
                    </AdminCardDescription>
                  </div>
                </AdminCardHeader>
                <AdminCardContent>
                  <ActiveRunsTab />
                </AdminCardContent>
              </AdminCard>
            </div>
          ) : currentStage === "consolidating" ? (
            <div className="grid gap-4 xl:grid-cols-1 p-1 pr-8 pb-8">
              <AdminCard variant="panel">
                <AdminCardHeader>
                  <div className="rounded-lg bg-brand-burgundy/10 p-2">
                    <Brain className="h-5 w-5 text-brand-burgundy" />
                  </div>
                  <div>
                    <AdminCardTitle>AI Consolidations</AdminCardTitle>
                    <AdminCardDescription>
                      Active consolidation batches and history.
                    </AdminCardDescription>
                  </div>
                </AdminCardHeader>
                <AdminCardContent>
                  <ActiveConsolidationsTab />
                </AdminCardContent>
              </AdminCard>
            </div>
          ) : currentStage === "url_review" ? (
            <div className="min-h-0">
              <UrlReviewWorkspace />
            </div>
          ) : currentStage === "scraped" ? (
            <ScrapedResultsView
              products={filteredProducts}
              selectedSkus={selectedSkus}
              onSelectSku={handleSelectSku}
              onSelectAll={(skus) => {
                setSelectedSkus((prev) => {
                  const next = new Set(prev);
                  skus.forEach((sku) => {
                    next.add(sku);
                  });
                  return next;
                });
              }}
              onDeselectAll={(skus) => {
                setSelectedSkus((prev) => {
                  const next = new Set(prev);
                  skus.forEach((sku) => {
                    next.delete(sku);
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
              isSearching={isSearching}
            />
          ) : currentStage === "finalizing" ? (
            <div data-testid="finalizing-results" className="contents">
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
                selectedSkus={selectedSkus}
                onSelectSku={handleSelectSku}
                isSearching={isSearching}
                showLegacyShopSiteFields={showLegacyShopSiteFields}
              />
            </div>
          ) : currentStage === "imported" || currentStage === "exporting" || hideTabs ? (
            <ImportedResultsView
              products={filteredProducts}
              selectedSkus={selectedSkus}
              onSelectSku={handleSelectSku}
              onSelectAll={(skus) => {
                setSelectedSkus((prev) => {
                  const next = new Set(prev);
                  skus.forEach((sku) => {
                    next.add(sku);
                  });
                  return next;
                });
              }}
              onDeselectAll={(skus) => {
                setSelectedSkus((prev) => {
                  const next = new Set(prev);
                  skus.forEach((sku) => {
                    next.delete(sku);
                  });
                  return next;
                });
              }}
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
              isSearching={isSearching}
              onImportCsv={currentStage === "imported" ? () => setIsIntegraImportOpen(true) : undefined}
              onManualAdd={currentStage === "imported" ? () => setIsManualAddOpen(true) : undefined}
              isLoading={isLoading}
            />
          ) : (
            <div className="flex flex-col h-full min-h-0">
              {groupedProducts.cohortIds.length <= 1 &&
              (groupedProducts.cohortIds.length === 0 ||
                groupedProducts.cohortIds[0] === "ungrouped") ? (
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
                <div className="border border-border bg-card overflow-hidden rounded-[var(--surface-admin-radius)]">
                  <Accordion type="multiple" className="divide-y divide-border">
                    {groupedProducts.cohortIds.map((cohortId) => {
                      const groupProducts =
                        groupedProducts.groups[cohortId] || [];
                      const cohortSkus = groupProducts.map((p) => p.sku);
                      const allSelected = groupProducts.length > 0 && groupProducts.every((p) => selectedSkus.has(p.sku));
                      const someSelected = groupProducts.some((p) => selectedSkus.has(p.sku)) && !allSelected;

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
                                      const next = new Set(selectedSkus);
                                      cohortSkus.forEach((s) => {
                                        next.add(s);
                                      });
                                      setSelectedSkus(next);
                                    } else {
                                      const next = new Set(selectedSkus);
                                      cohortSkus.forEach((s) => {
                                        next.delete(s);
                                      });
                                      setSelectedSkus(next);
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
                                  <span className="font-black text-base uppercase tracking-tighter text-foreground truncate">
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
                                  className="rounded-none border border-brand-forest-green bg-brand-forest-green/10 text-brand-forest-green font-black uppercase text-[10px] gap-1"
                                >
                                  <Tag className="h-3 w-3" />
                                  {groupedProducts.brands[cohortId]}
                                </Badge>
                              )}
                              <Badge
                                variant="secondary"
                                className="bg-foreground text-background rounded-none font-black uppercase text-[10px]"
                              >
                                {groupProducts.length} items
                              </Badge>
                              {cohortId !== "ungrouped" &&
                                canEditCohorts && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 border border-border text-foreground hover:bg-muted rounded-none active:translate-x-[1px] active:translate-y-[1px] transition-all px-2 text-[10px] font-black uppercase tracking-widest"
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
                              <div className="px-4 py-2 bg-muted/30 border-b border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                Products without a valid numeric SKU cannot be
                                auto-grouped into cohorts.
                              </div>
                            )}
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
                                groupProducts.forEach((p) => {
                                  groupSkus.add(p.sku);
                                });
                                setSelectedSkus(groupSkus);
                              }}
                              onDeselectAll={() => {
                                const groupSkus = new Set(selectedSkus);
                                groupProducts.forEach((p) => {
                                  groupSkus.delete(p.sku);
                                });
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
                                groupProducts.forEach((p) => {
                                  groupSkus.add(p.sku);
                                });
                                setSelectedSkus(groupSkus);
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
            <div className="flex flex-col items-center gap-2 rounded-[var(--surface-admin-radius)] bg-background/80 px-8 py-6 border border-border shadow-md backdrop-blur-sm">
              <Activity className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              <p className="text-sm font-black uppercase tracking-widest">
                Updating Results...
              </p>
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
        brandName={officialBrandSelection.brandName ?? null}
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
          scrapeSelectionValidation={scrapeSelectionValidation}
          onDiscoverOfficialBrand={handleDiscoverOfficialBrand}
          canDiscoverOfficialBrand={canDiscoverOfficialBrand}
          officialBrandSelectionReason={officialBrandSelection.reason}
          onDelete={handleDelete}
          actionState={currentStage === "exporting" ? exportActionState : null}
          onUploadShopSite={
            currentStage === "exporting"
              ? handleUploadSelectedShopSite
              : undefined
          }
          onDownloadZip={
            currentStage === "exporting" ? handleDownloadSelectedZip : undefined
          }
          showLegacyShopSiteActions={showLegacyShopSiteFields}
        />
      )}

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
        description={`Are you sure you want to permanently delete ${selectedSkus.size} product${selectedSkus.size > 1 ? "s" : ""}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        isLoading={isLoading}
      />
    </div>
  );
}
