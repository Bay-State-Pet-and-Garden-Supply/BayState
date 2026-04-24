"use client";

import {
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
  type SetStateAction,
} from "react";
import {
  Package,
  Plus,
  X,
  ChevronRight,
  Search,
  Check,
  Sparkles,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import type { PipelineProduct } from "@/lib/pipeline/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SHOPSITE_PAGES } from "@/lib/shopsite/constants";
import {
  formatSourceLabel,
  isValidCustomImageUrl,
} from "./finalizing/finalizing-utils";
import { ProductListSidebar } from "./finalizing/ProductListSidebar";
import { ImageCarousel } from "./finalizing/ImageCarousel";
import { ProductSaveActions } from "./finalizing/ProductSaveActions";
import { FinalizationCopilotPanel } from "./finalizing/FinalizationCopilotPanel";
import { ProductInfoForm } from "./finalizing/ProductInfoForm";
import { MerchandisingClassification } from "./finalizing/MerchandisingClassification";
import type { PipelineFiltersState } from "./PipelineFilters";
import type { VirtualizedPipelineTableHandle } from "./VirtualizedPipelineTable";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import {
  applyProductNameTransform,
  applySetProductFieldsToDraft,
  buildFinalizationProductSnapshot,
  buildWorkspaceProductSummary,
  inspectFinalizationProductSource,
  listFinalizationProductImageSources,
  listWorkspaceProducts as listWorkspaceProductSummaries,
  resolveFinalizationProductScope,
  type FinalizationCopilotContext,
} from "@/lib/pipeline/finalization-copilot-workspace";
import {
  buildConsolidatedPayloadFromDraft,
  buildInitialFinalizationDraft,
  createPersistedFinalizationDraftSnapshot,
  EMPTY_FINALIZATION_DRAFT,
  toFinalizationImageArray,
  type FinalizationDraft,
} from "@/lib/pipeline/finalization-draft";
import type {
  AddSelectedImagesInput,
  AssignBrandInput,
  BulkAssignBrandInput,
  BulkTransformProductNamesInput,
  BulkSetProductFieldsInput,
  BulkStorePagesInput,
  CreateBrandInput,
  InspectSourceDataInput,
  ListImageSourcesInput,
  ListWorkspaceProductsInput,
  PreviewProductScopeInput,
  ProductSnapshotInput,
  RemoveSelectedImagesInput,
  RemoveStorePagesInput,
  ReplaceSelectedImagesInput,
  ScopedProductActionInput,
  ScopedRejectProductInput,
  SetProductFieldsInput,
  SetStorePagesInput,
  ToolSummary,
} from "@/lib/tools/finalization-copilot";
import {
  filterPendingCopilotDraftReview,
  restorePendingCopilotDraftReview,
  stagePendingCopilotDraftReview,
  type PendingCopilotDraftReview,
} from "@/lib/pipeline/finalization-copilot-review";

interface FinalizingResultsViewProps {
  products: PipelineProduct[];
  onRefresh: (silent?: boolean) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  filters?: PipelineFiltersState;
  onFilterChange?: (filters: PipelineFiltersState) => void;
  availableSources?: string[];
  groupedProducts?: {
    groups: Record<string, PipelineProduct[]>;
    cohortIds: string[];
    names?: Record<string, string>;
  };
  cohortBrands?: Record<string, string>;
  onEditCohort?: (id: string, name: string | null, brandName: string | null) => void;
  selectedSkus?: Set<string>;
  onSelectSku?: (
    sku: string,
    selected: boolean,
    index?: number,
    isShift?: boolean,
  ) => void;
  isSearching?: boolean;
}

interface Brand {
  id: string;
  name: string;
  slug?: string | null;
}

interface PersistProductsResult extends ToolSummary {
  successfulSkus: string[];
  failedSkus: string[];
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  if (items.length === 0) {
    return [];
  }

  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let currentIndex = 0;

  async function runWorker() {
    while (true) {
      const index = currentIndex;
      currentIndex += 1;

      if (index >= items.length) {
        return;
      }

      try {
        results[index] = {
          status: "fulfilled",
          value: await worker(items[index]),
        };
      } catch (error) {
        results[index] = {
          status: "rejected",
          reason: error,
        };
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => runWorker(),
    ),
  );

  return results;
}

export function FinalizingResultsView({
  products,
  onRefresh,
  search,
  onSearchChange,
  filters,
  onFilterChange,
  availableSources = [],
  groupedProducts,
  cohortBrands = {},
  onEditCohort,
  selectedSkus = new Set(),
  onSelectSku,
  isSearching = false,
}: FinalizingResultsViewProps) {
  const [copilotOpen, setCopilotOpen] = useState(false);

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => a.sku.localeCompare(b.sku));
  }, [products]);

  const [preferredSku, setPreferredSku] = useState<string | null>(
    sortedProducts.length > 0 ? sortedProducts[0].sku : null,
  );

  // track previous products to detect when a product is removed (moved to export/rejected)
  const prevProductsRef = useRef<PipelineProduct[]>(sortedProducts);

  // Brand state
  const [brandsState, setBrandsState] = useState<Brand[]>([]);
  const brandsRef = useRef<Brand[]>([]);
  const setBrands = useCallback((value: SetStateAction<Brand[]>) => {
    setBrandsState((prev) => {
      const next =
        typeof value === "function"
          ? (value as (previous: Brand[]) => Brand[])(prev)
          : value;
      brandsRef.current = next;
      return next;
    });
  }, []);
  const brands = brandsState;
  const [brandSearch, setBrandSearch] = useState("");
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [brandPopoverOpen, setBrandPopoverOpen] = useState(false);

  // Store Pages (Product Pages) state
  const [pageSearch, setPageSearch] = useState("");
  const [pagePopoverOpen, setPagePopoverOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);
  const scrollContainerRef = useRef<VirtualizedPipelineTableHandle>(null);
  const [draftsState, setDraftsState] = useState<Record<string, FinalizationDraft>>(
    {},
  );
  const draftsRef = useRef<Record<string, FinalizationDraft>>({});
  const setDrafts = useCallback(
    (value: SetStateAction<Record<string, FinalizationDraft>>) => {
      if (typeof value !== "function") {
        draftsRef.current = value;
      }
      setDraftsState((prev) => {
        const next =
          typeof value === "function"
            ? (
                value as (
                  previous: Record<string, FinalizationDraft>,
                ) => Record<string, FinalizationDraft>
              )(prev)
            : value;
        draftsRef.current = next;
        return next;
      });
    },
    [],
  );
  const draftsBySku = draftsState;
  const [savedDraftsState, setSavedDraftsState] = useState<
    Record<string, FinalizationDraft>
  >({});
  const savedDraftsRef = useRef<Record<string, FinalizationDraft>>({});
  const setSavedDrafts = useCallback(
    (value: SetStateAction<Record<string, FinalizationDraft>>) => {
      if (typeof value !== "function") {
        savedDraftsRef.current = value;
      }
      setSavedDraftsState((prev) => {
        const next =
          typeof value === "function"
            ? (
                value as (
                  previous: Record<string, FinalizationDraft>,
                ) => Record<string, FinalizationDraft>
              )(prev)
            : value;
        savedDraftsRef.current = next;
        return next;
      });
    },
    [],
  );
  const savedDraftsBySku = savedDraftsState;
  const [pendingCopilotReviewState, setPendingCopilotReviewState] =
    useState<PendingCopilotDraftReview | null>(null);
  const pendingCopilotReviewRef = useRef<PendingCopilotDraftReview | null>(null);
  const setPendingCopilotReview = useCallback(
    (value: SetStateAction<PendingCopilotDraftReview | null>) => {
      if (typeof value !== "function") {
        pendingCopilotReviewRef.current = value;
      }
      setPendingCopilotReviewState((prev) => {
        const next =
          typeof value === "function"
            ? (
                value as (
                  previous: PendingCopilotDraftReview | null,
                ) => PendingCopilotDraftReview | null
              )(prev)
            : value;
        pendingCopilotReviewRef.current = next;
        return next;
      });
    },
    [],
  );
  const pendingCopilotReview = pendingCopilotReviewState;

  const filteredBrands = useMemo(() => {
    if (!brandSearch.trim()) return brands;
    const search = brandSearch.toLowerCase();
    return brands.filter((b) => b.name.toLowerCase().includes(search));
  }, [brands, brandSearch]);

  const filteredPages = useMemo(() => {
    if (!pageSearch.trim()) return SHOPSITE_PAGES;
    const search = pageSearch.toLowerCase();
    return SHOPSITE_PAGES.filter((p) => p.toLowerCase().includes(search));
  }, [pageSearch]);
  const validStorePages = useMemo(() => new Set<string>(SHOPSITE_PAGES), []);

  const createBrandRecord = useCallback(async (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error("Brand name is required");
    }

    const res = await fetch("/api/admin/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmedName }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Failed to create brand");
    }

    const { brand } = (await res.json()) as { brand: Brand };
    setBrands((prev) =>
      [...prev, brand].sort((a, b) => a.name.localeCompare(b.name)),
    );

    return brand;
  }, [setBrands]);
  const [selectedImageSourceId, setSelectedImageSourceId] = useState("");
  const productsBySku = useMemo(
    () =>
      Object.fromEntries(sortedProducts.map((product) => [product.sku, product])),
    [sortedProducts],
  );
  const productsBySkuRef = useRef<Record<string, PipelineProduct>>(productsBySku);

  const selectedProduct= useMemo(
    () =>
      sortedProducts.find((product) => product.sku === preferredSku) ??
      sortedProducts[0] ??
      null,
    [preferredSku, sortedProducts],
  );
  const selectedProductRef = useRef<PipelineProduct | null>(selectedProduct);

  const selectedSku = selectedProduct?.sku ?? null;

  useEffect(() => {
    selectedProductRef.current = selectedProduct;
  }, [selectedProduct]);

  useEffect(() => {
    productsBySkuRef.current = productsBySku;
  }, [productsBySku]);

  // Intelligent selection: When products change, if the current selection is gone,
  // select the next product that was after it.
  useEffect(() => {
    const prevProducts = prevProductsRef.current;
    if (prevProducts !== sortedProducts) {
      const currentExists = sortedProducts.some((p) => p.sku === preferredSku);
      if (!currentExists && preferredSku) {
        // Current SKU was removed (for example, moved into exporting or rejected).
        // Find where it was in the PREVIOUS list.
        const prevIndex = prevProducts.findIndex((p) => p.sku === preferredSku);
        if (prevIndex !== -1) {
          // Select the product that is now at that same index (or the one before if it was last)
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

  // Fetch brands
  useEffect(() => {
    async function fetchData() {
      try {
        const brandsRes = await fetch("/api/admin/brands");

        if (brandsRes.ok) {
          const data = await brandsRes.json();
          setBrands(data.brands || []);
        }
      } catch (err) {
        console.error("Failed to fetch reference data:", err);
      }
    }
    fetchData();
  }, [setBrands]);

  useEffect(() => {
    const nextDrafts: Record<string, FinalizationDraft> = {};
    const nextSavedDrafts: Record<string, FinalizationDraft> = {};

    sortedProducts.forEach((product) => {
      const initialDraft = buildInitialFinalizationDraft(product);
      const persistedDraft =
        createPersistedFinalizationDraftSnapshot(initialDraft);
      const existingDraft = draftsRef.current[product.sku];
      const existingSavedDraft = savedDraftsRef.current[product.sku];
      const preserveExistingDraft =
        existingDraft
        && existingSavedDraft
        && JSON.stringify(existingDraft) !== JSON.stringify(existingSavedDraft);

      nextDrafts[product.sku] = preserveExistingDraft
        ? existingDraft
        : initialDraft;
      nextSavedDrafts[product.sku] = preserveExistingDraft
        ? existingSavedDraft
        : persistedDraft;
    });

    setDrafts(nextDrafts);
    setSavedDrafts(nextSavedDrafts);
  }, [sortedProducts, setDrafts, setSavedDrafts]);

  useEffect(() => {
    setSelectedImageSourceId("");
  }, [selectedSku]);

  const formData = selectedSku
    ? draftsBySku[selectedSku] ?? EMPTY_FINALIZATION_DRAFT
    : EMPTY_FINALIZATION_DRAFT;
  const dirtySkus = useMemo(
    () =>
      sortedProducts
        .filter((product) => {
          const draft = draftsBySku[product.sku];
          const saved = savedDraftsBySku[product.sku];

          return (
            !!draft
            && !!saved
            && JSON.stringify(draft) !== JSON.stringify(saved)
          );
        })
        .map((product) => product.sku),
    [draftsBySku, savedDraftsBySku, sortedProducts],
  );
  const isDirty = selectedSku ? dirtySkus.includes(selectedSku) : false;

  const updateDraftForSku = useCallback(
    (sku: string, value: SetStateAction<FinalizationDraft>) => {
      setDrafts((prev) => {
        const current = prev[sku] ?? EMPTY_FINALIZATION_DRAFT;
        const nextDraft =
          typeof value === "function"
            ? (value as (previous: FinalizationDraft) => FinalizationDraft)(
                current,
              )
            : value;

        return {
          ...prev,
          [sku]: nextDraft,
        };
      });
    },
    [setDrafts],
  );

  const updateSavedDrafts = useCallback(
    (updates: Record<string, FinalizationDraft>) => {
      setSavedDrafts((prev) => ({
        ...prev,
        ...updates,
      }));
    },
    [setSavedDrafts],
  );
  const hasPendingCopilotReview = pendingCopilotReview !== null;

  const stageCopilotDraftReview = useCallback(
    (skus: string[], summary: string): ToolSummary => {
      const nextPendingReview = stagePendingCopilotDraftReview({
        pendingReview: pendingCopilotReviewRef.current,
        draftsBySku: draftsRef.current,
        targetSkus: skus,
        summary,
      });
      setPendingCopilotReview(nextPendingReview);

      return {
        summary: `${summary} Review and accept to autosave, or reject to restore the previous draft.`,
      };
    },
    [setPendingCopilotReview],
  );

  const ensureNoPendingCopilotReview = useCallback(
    (action: string) => {
      if (!pendingCopilotReviewRef.current) {
        return;
      }

      throw new Error(
        `Review the staged copilot changes before ${action}. Accept autosaves them; reject restores the previous drafts.`,
      );
    },
    [],
  );

  const notifyPendingCopilotReview = useCallback((action: string) => {
    toast.error(
      `Accept or reject the staged copilot changes before ${action}.`,
    );
  }, []);

  const handleInputChange = useCallback(
    <K extends keyof FinalizationDraft>(
      field: K,
      value: FinalizationDraft[K],
    ) => {
      if (!selectedSku) {
        return;
      }
      if (pendingCopilotReviewRef.current) {
        notifyPendingCopilotReview("editing the draft manually");
        return;
      }

      updateDraftForSku(selectedSku, (prev) => ({ ...prev, [field]: value }));
    },
    [notifyPendingCopilotReview, selectedSku, updateDraftForSku],
  );

  const handleCreateBrand = async () => {
    if (!brandSearch.trim()) return;
    if (pendingCopilotReviewRef.current) {
      notifyPendingCopilotReview("editing the draft manually");
      return;
    }
    setCreatingBrand(true);
    try {
      const brand = await createBrandRecord(brandSearch);
      handleInputChange("brandId", brand.id);
      setBrandSearch("");
      setBrandPopoverOpen(false);
      toast.success(`Brand "${brand.name}" created`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "An error occurred while creating brand",
      );
    } finally {
      setCreatingBrand(false);
    }
  };

  const handleNameChange = (newName: string) => {
    if (!selectedSku) {
      return;
    }
    if (pendingCopilotReviewRef.current) {
      notifyPendingCopilotReview("editing the draft manually");
      return;
    }

    updateDraftForSku(selectedSku, (prev) => ({ ...prev, name: newName }));
  };

  const toggleImage = (url: string) => {
    if (!selectedSku) {
      return;
    }
    if (pendingCopilotReviewRef.current) {
      notifyPendingCopilotReview("editing the draft manually");
      return;
    }

    updateDraftForSku(selectedSku, (prev) => {
      const isSelected = prev.selectedImages.includes(url);
      if (isSelected) {
        return {
          ...prev,
          selectedImages: prev.selectedImages.filter((img) => img !== url),
        };
      } else {
        return { ...prev, selectedImages: [...prev.selectedImages, url] };
      }
    });
  };

  const addCustomImage = () => {
    if (!selectedSku) return;
    if (!formData.customImageUrl.trim()) return;
    if (pendingCopilotReviewRef.current) {
      notifyPendingCopilotReview("editing the draft manually");
      return;
    }
    const url = formData.customImageUrl.trim();

    if (!isValidCustomImageUrl(url)) {
      toast.error("Enter a valid image URL");
      return;
    }

    if (!formData.selectedImages.includes(url)) {
      updateDraftForSku(selectedSku, (prev) => ({
        ...prev,
        selectedImages: [...prev.selectedImages, url],
        customImageUrl: "",
      }));
    } else {
      updateDraftForSku(selectedSku, (prev) => ({
        ...prev,
        customImageUrl: "",
      }));
    }
  };

  const addCustomSource = () => {
    if (!selectedSku) return;
    const url = formData.customSourceUrl.trim();
    if (!url) return;
    if (pendingCopilotReviewRef.current) {
      notifyPendingCopilotReview("editing the draft manually");
      return;
    }

    try {
      new URL(url);
    } catch {
      toast.error("Enter a valid URL");
      return;
    }

    const hostname = new URL(url).hostname.replace("www.", "");
    const sourceKey = `custom:${hostname}`;

    updateDraftForSku(selectedSku, (prev) => ({
      ...prev,
      sources: {
        ...prev.sources,
        [sourceKey]: {
          url,
          scraped_at: new Date().toISOString(),
          _is_custom: true,
        },
      },
      customSourceUrl: "",
    }));
    toast.success(`Added source: ${hostname}`);
  };

  const removeSource = (sourceKey: string) => {
    if (!selectedSku) return;
    if (pendingCopilotReviewRef.current) {
      notifyPendingCopilotReview("editing the draft manually");
      return;
    }

    updateDraftForSku(selectedSku, (prev) => {
      const nextSources = { ...prev.sources };
      delete nextSources[sourceKey];
      return {
        ...prev,
        sources: nextSources,
      };
    });
    toast.success(`Removed source: ${sourceKey}`);
  };

  const normalizeStorePages = useCallback(
    (pages: string[]) => {
      const requestedPages = new Set(
        pages.map((page) => page.trim()).filter((page) => validStorePages.has(page)),
      );

      return SHOPSITE_PAGES.filter((page) => requestedPages.has(page));
    },
    [validStorePages],
  );

  const normalizeSelectedImages = useCallback((images: string[]) => {
    return toFinalizationImageArray(
      images.filter((image) => isValidCustomImageUrl(image)),
    );
  }, []);

  const persistProducts = useCallback(
    async ({
      skus,
      andPublish = false,
      silent = false,
    }: {
      skus: string[];
      andPublish?: boolean;
      silent?: boolean;
    }): Promise<PersistProductsResult> => {
      const targetSkus = Array.from(
        new Set(skus.filter((sku) => sku.trim().length > 0)),
      );

      if (targetSkus.length === 0) {
        throw new Error("No products matched the requested scope.");
      }

      if (andPublish) {
        setPublishing(true);
      } else {
        setSaving(true);
      }

      try {
        const results = await runWithConcurrency(targetSkus, 4, async (sku) => {
          const currentProduct = productsBySkuRef.current[sku];
          const currentDraft = draftsRef.current[sku];
          const currentSavedDraft = savedDraftsRef.current[sku];

          if (!currentProduct || !currentDraft || !currentSavedDraft) {
            throw new Error(`Missing draft state for ${sku}.`);
          }

          const persistedSnapshot =
            createPersistedFinalizationDraftSnapshot(currentDraft);
          const hasPersistableChanges =
            JSON.stringify(persistedSnapshot)
            !== JSON.stringify(currentSavedDraft);

          if (hasPersistableChanges) {
            const patchRes = await fetch(
              `/api/admin/pipeline/${encodeURIComponent(currentProduct.sku)}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  consolidated: buildConsolidatedPayloadFromDraft(currentDraft),
                  sources: currentDraft.sources,
                }),
              },
            );

            if (!patchRes.ok) {
              const data = await patchRes.json().catch(() => null);
              throw new Error(data?.error || "Failed to save changes");
            }
          }

          if (andPublish) {
            const publishRes = await fetch(`/api/admin/pipeline/publish`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sku: currentProduct.sku }),
            });

            if (!publishRes.ok) {
              const data = await publishRes.json().catch(() => null);
              throw new Error(
                data?.error || "Failed to move product into exporting",
              );
            }
          }

          return {
            sku,
            hasPersistableChanges,
            persistedSnapshot,
          };
        });

        const successful = results
          .filter(
            (
              result,
            ): result is PromiseFulfilledResult<{
              sku: string;
              hasPersistableChanges: boolean;
              persistedSnapshot: FinalizationDraft;
            }> => result.status === "fulfilled",
          )
          .map((result) => result.value);
        const failedSkus = results
          .map((result, index) =>
            result.status === "rejected" ? targetSkus[index] : null,
          )
          .filter((sku): sku is string => sku !== null);

        if (successful.length === 0 && failedSkus.length > 0) {
          const firstFailure = results.find(
            (result): result is PromiseRejectedResult =>
              result.status === "rejected",
          );

          throw (
            firstFailure?.reason
            ?? new Error(`Failed to update ${failedSkus.join(", ")}.`)
          );
        }

        const savedUpdates = Object.fromEntries(
          successful.map((result) => [result.sku, result.persistedSnapshot]),
        );
        if (Object.keys(savedUpdates).length > 0) {
          updateSavedDrafts(savedUpdates);
        }

        if (successful.length > 0) {
          onRefresh(!andPublish);
        }

        const changedCount = successful.filter(
          (result) => result.hasPersistableChanges,
        ).length;
        const alreadyCurrentCount = successful.length - changedCount;
        const noun = successful.length === 1 ? "product" : "products";
        let summary = andPublish
          ? `Approved ${successful.length} ${noun}.`
          : changedCount > 0
            ? `Saved ${changedCount} ${changedCount === 1 ? "product" : "products"}.`
            : `All ${successful.length} matched drafts were already up to date.`;

        if (!andPublish && changedCount > 0 && alreadyCurrentCount > 0) {
          summary += ` ${alreadyCurrentCount} ${
            alreadyCurrentCount === 1 ? "draft was" : "drafts were"
          } already up to date.`;
        }

        if (failedSkus.length > 0) {
          summary += ` ${failedSkus.length} failed: ${failedSkus.join(", ")}.`;
        }

        if (!silent) {
          if (failedSkus.length > 0) {
            toast.error(summary);
          } else {
            toast.success(summary);
          }
        }

        return {
          summary,
          successfulSkus: successful.map((result) => result.sku),
          failedSkus,
        };
      } catch (error) {
        if (!silent) {
          toast.error(
            error instanceof Error ? error.message : "An error occurred",
          );
        }

        throw error;
      } finally {
        setSaving(false);
        setPublishing(false);
      }
    },
    [onRefresh, updateSavedDrafts],
  );

  const persistCurrentDraft = useCallback(
    async ({
      andPublish = false,
      silent = false,
    }: {
      andPublish?: boolean;
      silent?: boolean;
    } = {}): Promise<ToolSummary> => {
      const currentSku = selectedProductRef.current?.sku;
      if (!currentSku) {
        throw new Error("Select a product before saving.");
      }

      return persistProducts({
        skus: [currentSku],
        andPublish,
        silent,
      });
    },
    [persistProducts],
  );

  const handleAcceptPendingCopilotReview = useCallback(async () => {
    const currentPendingReview = pendingCopilotReviewRef.current;
    if (!currentPendingReview) {
      return;
    }

    try {
      const result = await persistProducts({
        skus: currentPendingReview.skus,
        silent: true,
      });

      setPendingCopilotReview(
        filterPendingCopilotDraftReview(currentPendingReview, result.failedSkus),
      );

      if (result.failedSkus.length > 0) {
        toast.error(
          `Accepted ${result.successfulSkus.length} copilot ${
            result.successfulSkus.length === 1 ? "change" : "changes"
          }, but ${result.failedSkus.length} product${
            result.failedSkus.length === 1 ? "" : "s"
          } still need review: ${result.failedSkus.join(", ")}.`,
        );
        return;
      }

      toast.success(`Accepted copilot changes. ${result.summary}`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to accept the staged copilot changes.",
      );
    }
  }, [persistProducts, setPendingCopilotReview]);

  const handleRejectPendingCopilotReview = useCallback(() => {
    const currentPendingReview = pendingCopilotReviewRef.current;
    if (!currentPendingReview) {
      return;
    }

    setDrafts((prev) =>
      restorePendingCopilotDraftReview(prev, currentPendingReview),
    );
    setPendingCopilotReview(null);
    toast.success(
      `Rejected staged copilot changes for ${currentPendingReview.skus.length} product${
        currentPendingReview.skus.length === 1 ? "" : "s"
      }.`,
    );
  }, [setDrafts, setPendingCopilotReview]);

  const handleSelectProduct = useCallback(
    async (newSku: string | null) => {
      if (newSku === preferredSku) return;

      if (pendingCopilotReviewRef.current) {
        toast.error(
          "Accept or reject the staged copilot changes before switching products.",
        );
        return;
      }

      if (isDirty && selectedSku && !saving && !publishing) {
        try {
          await persistCurrentDraft({ silent: true });
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to save the current draft before switching products.",
          );
          return;
        }
      }
      setPreferredSku(newSku);
    },
    [isDirty, selectedSku, preferredSku, persistCurrentDraft, saving, publishing],
  );

  // Keyboard navigation and shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInput =
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA" ||
        activeElement?.getAttribute("contenteditable") === "true";

      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (pendingCopilotReviewRef.current) {
          notifyPendingCopilotReview("saving");
          return;
        }
        void persistCurrentDraft();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (pendingCopilotReviewRef.current) {
          notifyPendingCopilotReview("approving");
          return;
        }
        void persistCurrentDraft({ andPublish: true });
        return;
      }

      if (isInput || sortedProducts.length === 0) return;

      // Arrow navigation is now handled by PipelineSidebarTable in the sidebar
      // to ensure consistency with cohort grouping and expansion.
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    persistCurrentDraft,
    notifyPendingCopilotReview,
  ]);

  const handleReject = async () => {
    if (!selectedSku) return;
    if (pendingCopilotReviewRef.current) {
      notifyPendingCopilotReview("rejecting the product");
      return;
    }
    setConfirmRejectOpen(true);
  };

  const rejectProducts = useCallback(
    async ({
      skus,
      silent = false,
    }: {
      skus: string[];
      silent?: boolean;
    }): Promise<ToolSummary> => {
      const targetSkus = Array.from(
        new Set(skus.filter((sku) => sku.trim().length > 0)),
      );

      if (targetSkus.length === 0) {
        throw new Error("No products matched the requested rejection scope.");
      }

      setRejecting(true);

      try {
        const res =
          targetSkus.length === 1
            ? await fetch(
                `/api/admin/pipeline/${encodeURIComponent(targetSkus[0])}`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ pipeline_status: "scraped" }),
                },
              )
            : await fetch(`/api/admin/pipeline/bulk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  skus: targetSkus,
                  toStatus: "scraped",
                }),
              });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Failed to reject product");
        }

        const summary =
          targetSkus.length === 1
            ? "Moved the product back to the scraped stage for additional review."
            : `Moved ${targetSkus.length} products back to the scraped stage for additional review.`;

        if (!silent) {
          toast.success(summary);
        }

        onRefresh(false);

        return { summary };
      } catch (error) {
        if (!silent) {
          toast.error(
            error instanceof Error ? error.message : "An error occurred",
          );
        }

        throw error;
      } finally {
        setRejecting(false);
      }
    },
    [onRefresh],
  );

  const rejectCurrentProduct = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}): Promise<ToolSummary> => {
      const currentSku = selectedProductRef.current?.sku;
      if (!currentSku) {
        throw new Error("Select a product before rejecting it.");
      }

      return rejectProducts({
        skus: [currentSku],
        silent,
      });
    },
    [rejectProducts],
  );

  const handleConfirmReject = async () => {
    if (!selectedSku) return;
    setConfirmRejectOpen(false);
    try {
      await rejectCurrentProduct();
    } catch {
      // rejectCurrentProduct already surfaces the error consistently
    }
  };

  const resolveProductWorkspaceState = useCallback((sku?: string) => {
    const resolvedSku = sku ?? selectedProductRef.current?.sku;
    if (!resolvedSku) {
      throw new Error("Select a product or provide a SKU first.");
    }

    const product = productsBySkuRef.current[resolvedSku];
    const draft = draftsRef.current[resolvedSku];
    const savedDraft = savedDraftsRef.current[resolvedSku];

    if (!product || !draft || !savedDraft) {
      throw new Error(`Product ${resolvedSku} is not available in finalizing.`);
    }

    return {
      sku: resolvedSku,
      product,
      draft,
      savedDraft,
    };
  }, []);

  const resolveScopeSkus = useCallback(
    (scope: PreviewProductScopeInput["scope"]) => {
      const matchedSkus = resolveFinalizationProductScope(
        sortedProducts,
        draftsRef.current,
        savedDraftsRef.current,
        selectedProductRef.current?.sku ?? null,
        scope,
      );

      if (matchedSkus.length === 0) {
        throw new Error("No products matched the requested scope.");
      }

      return matchedSkus;
    },
    [sortedProducts],
  );

  const buildScopeSummaries = useCallback((skus: string[]) => {
    return skus
      .map((sku) => {
        const product = productsBySkuRef.current[sku];
        const draft = draftsRef.current[sku];
        const savedDraft = savedDraftsRef.current[sku];

        if (!product || !draft || !savedDraft) {
          return null;
        }

        return buildWorkspaceProductSummary(
          product,
          draft,
          savedDraft,
          selectedProductRef.current?.sku ?? null,
        );
      })
      .filter(
        (
          summary,
        ): summary is ReturnType<typeof buildWorkspaceProductSummary> =>
          summary !== null,
      );
  }, []);

  const getCopilotContext = useCallback((): FinalizationCopilotContext => {
    const currentProduct = selectedProductRef.current;

    const input =
      currentProduct?.input
      && typeof currentProduct.input === "object"
      && !Array.isArray(currentProduct.input)
        ? (currentProduct.input as Record<string, unknown>)
        : null;

    const consolidated =
      currentProduct?.consolidated
      && typeof currentProduct.consolidated === "object"
      && !Array.isArray(currentProduct.consolidated)
        ? (currentProduct.consolidated as Record<string, unknown>)
        : null;

    return {
      workspace: {
        totalProducts: sortedProducts.length,
        selectedSku,
        dirtySkus,
      },
      selectedProduct: currentProduct
        ? {
            sku: currentProduct.sku,
            input,
            consolidated,
            sources: currentProduct.sources || {},
            selected_images: currentProduct.selected_images,
            confidence_score: currentProduct.confidence_score ?? null,
          }
        : null,
      selectedDraft: selectedSku ? draftsRef.current[selectedSku] ?? null : null,
      selectedSavedDraft: selectedSku
        ? savedDraftsRef.current[selectedSku] ?? null
        : null,
    };
  }, [dirtySkus, selectedSku, sortedProducts.length]);

  const handleCopilotListWorkspaceProducts = useCallback(
    async (input: ListWorkspaceProductsInput) => {
      const result = listWorkspaceProductSummaries(
        sortedProducts,
        draftsRef.current,
        savedDraftsRef.current,
        selectedProductRef.current?.sku ?? null,
        input,
      );

      return {
        ...result,
        summary: input.query
          ? `Found ${result.matched} matching products in finalizing (showing ${result.products.length}).`
          : `Loaded ${result.total} products in finalizing (showing ${result.products.length}).`,
      };
    },
    [sortedProducts],
  );

  const handleCopilotPreviewProductScope = useCallback(
    async ({ scope }: PreviewProductScopeInput) => {
      const matchedSkus = resolveScopeSkus(scope);
      const products = buildScopeSummaries(matchedSkus);

      return {
        summary: `Scope matches ${products.length} product${products.length === 1 ? "" : "s"}.`,
        matched: products.length,
        products,
      };
    },
    [buildScopeSummaries, resolveScopeSkus],
  );

  const handleCopilotGetProductSnapshot = useCallback(
    async ({ sku }: ProductSnapshotInput) => {
      const { product, draft, savedDraft } = resolveProductWorkspaceState(sku);
      return buildFinalizationProductSnapshot(product, draft, savedDraft);
    },
    [resolveProductWorkspaceState],
  );

  const handleCopilotInspectSourceData = useCallback(
    async ({ sku, sourceKey, focus }: InspectSourceDataInput) => {
      const { product } = resolveProductWorkspaceState(sku);
      return inspectFinalizationProductSource(product, sourceKey, focus);
    },
    [resolveProductWorkspaceState],
  );

  const handleCopilotListImageSources = useCallback(
    async ({ sku }: ListImageSourcesInput) => {
      const { product, draft } = resolveProductWorkspaceState(sku);
      return listFinalizationProductImageSources(product, draft);
    },
    [resolveProductWorkspaceState],
  );

  const handleCopilotSetProductFields = useCallback(
    async (input: SetProductFieldsInput): Promise<ToolSummary> => {
      const currentSku = selectedProductRef.current?.sku;
      if (!currentSku) {
        throw new Error("Select a product before updating fields.");
      }

      const result = applySetProductFieldsToDraft(
        draftsRef.current[currentSku] ?? EMPTY_FINALIZATION_DRAFT,
        input,
      );

      const review = stageCopilotDraftReview(
        [currentSku],
        `Prepared updates for ${result.updatedFields.join(", ")} on ${currentSku}.`,
      );
      updateDraftForSku(currentSku, result.draft);

      return review;
    },
    [stageCopilotDraftReview, updateDraftForSku],
  );

  const handleCopilotBulkSetProductFields = useCallback(
    async ({
      scope,
      changes,
    }: BulkSetProductFieldsInput): Promise<ToolSummary> => {
      const matchedSkus = resolveScopeSkus(scope);
      if (matchedSkus.length > 1 && changes.name !== undefined) {
        throw new Error(
          "Bulk exact name replacement is blocked. Use the name-transform tool for prefix, suffix, or replace operations so existing names are preserved.",
        );
      }
      const updatedFields = new Set<string>();
      const nextDrafts = { ...draftsRef.current };

      matchedSkus.forEach((sku) => {
        const result = applySetProductFieldsToDraft(
          nextDrafts[sku] ?? EMPTY_FINALIZATION_DRAFT,
          changes,
        );
        nextDrafts[sku] = result.draft;
        result.updatedFields.forEach((field) => updatedFields.add(field));
      });

      setDrafts(nextDrafts);

      return stageCopilotDraftReview(
        matchedSkus,
        `Prepared updates for ${matchedSkus.length} product${
          matchedSkus.length === 1 ? "" : "s"
        }: ${Array.from(updatedFields).join(", ")}.`,
      );
    },
    [resolveScopeSkus, setDrafts, stageCopilotDraftReview],
  );

  const handleCopilotBulkTransformProductNames = useCallback(
    async ({
      scope,
      mode,
      value,
      find,
      skipIfContains,
    }: BulkTransformProductNamesInput): Promise<ToolSummary> => {
      const matchedSkus = resolveScopeSkus(scope);
      let changedCount = 0;
      const changedSkus: string[] = [];
      const nextDrafts = { ...draftsRef.current };

      matchedSkus.forEach((sku) => {
        const result = applyProductNameTransform(
          nextDrafts[sku] ?? EMPTY_FINALIZATION_DRAFT,
          {
            mode,
            value,
            find,
            skipIfContains,
          },
        );
        if (result.changed) {
          changedCount += 1;
          changedSkus.push(sku);
          nextDrafts[sku] = result.draft;
        }
      });

      if (changedCount === 0) {
        return {
          summary:
            "No product names changed. The matched products already satisfied that naming rule.",
        };
      }

      setDrafts(nextDrafts);

      return stageCopilotDraftReview(
        changedSkus,
        `Prepared ${mode} name updates for ${changedCount} product${
          changedCount === 1 ? "" : "s"
        }.`,
      );
    },
    [resolveScopeSkus, setDrafts, stageCopilotDraftReview],
  );

  const handleCopilotAssignBrand = useCallback(
    async ({ brandId, brandName }: AssignBrandInput): Promise<ToolSummary> => {
      const currentSku = selectedProductRef.current?.sku;
      if (!currentSku) {
        throw new Error("Select a product before assigning a brand.");
      }
      if (
        brandId !== "none"
        && !brandsRef.current.some((brand) => brand.id === brandId)
      ) {
        throw new Error(
          `Brand "${brandName}" is not available. Search for the brand first.`,
        );
      }

      const review = stageCopilotDraftReview(
        [currentSku],
        brandId === "none"
          ? `Prepared a cleared brand assignment for ${currentSku}.`
          : `Prepared a brand assignment to ${brandName} for ${currentSku}.`,
      );
      handleInputChange("brandId", brandId);

      return review;
    },
    [handleInputChange, stageCopilotDraftReview],
  );

  const handleCopilotCreateBrand = useCallback(
    async ({ name }: CreateBrandInput): Promise<ToolSummary> => {
      const brand = await createBrandRecord(name);
      const currentSku = selectedProductRef.current?.sku;
      if (!currentSku) {
        throw new Error("Select a product before assigning a brand.");
      }
      const review = stageCopilotDraftReview(
        [currentSku],
        `Prepared a new brand assignment to ${brand.name} for ${currentSku}.`,
      );
      handleInputChange("brandId", brand.id);

      return review;
    },
    [createBrandRecord, handleInputChange, stageCopilotDraftReview],
  );

  const handleCopilotBulkAssignBrand = useCallback(
    async ({
      scope,
      brandId,
      brandName,
    }: BulkAssignBrandInput): Promise<ToolSummary> => {
      if (
        brandId !== "none"
        && !brandsRef.current.some((brand) => brand.id === brandId)
      ) {
        throw new Error(
          `Brand "${brandName}" is not available. Search for the brand first.`,
        );
      }

      const matchedSkus = resolveScopeSkus(scope);
      const nextDrafts = { ...draftsRef.current };
      matchedSkus.forEach((sku) => {
        nextDrafts[sku] = {
          ...(nextDrafts[sku] ?? EMPTY_FINALIZATION_DRAFT),
          brandId,
        };
      });
      setDrafts(nextDrafts);

      return stageCopilotDraftReview(
        matchedSkus,
        brandId === "none"
          ? `Prepared cleared brand assignments for ${matchedSkus.length} product${
              matchedSkus.length === 1 ? "" : "s"
            }.`
          : `Prepared ${brandName} brand assignments for ${matchedSkus.length} product${
              matchedSkus.length === 1 ? "" : "s"
            }.`,
      );
    },
    [resolveScopeSkus, setDrafts, stageCopilotDraftReview],
  );

  const handleCopilotSetStorePages = useCallback(
    async ({ pages }: SetStorePagesInput): Promise<ToolSummary> => {
      const currentSku = selectedProductRef.current?.sku;
      if (!currentSku) {
        throw new Error("Select a product before updating store pages.");
      }
      const nextPages = normalizeStorePages(pages);
      if (nextPages.length === 0) {
        throw new Error("Provide at least one valid ShopSite page.");
      }

      const review = stageCopilotDraftReview(
        [currentSku],
        `Prepared ShopSite pages for ${currentSku}: ${nextPages.join(", ")}.`,
      );
      handleInputChange("productOnPages", nextPages);
      return review;
    },
    [normalizeStorePages, handleInputChange, stageCopilotDraftReview],
  );

  const handleCopilotAddStorePages = useCallback(
    async ({ pages }: SetStorePagesInput): Promise<ToolSummary> => {
      if (!selectedSku) {
        throw new Error("Select a product before updating store pages.");
      }
      const nextPages = normalizeStorePages([
        ...(selectedSku ? draftsRef.current[selectedSku]?.productOnPages ?? [] : []),
        ...pages,
      ]);
      const review = stageCopilotDraftReview(
        [selectedSku],
        `Prepared added ShopSite pages for ${selectedSku}: ${normalizeStorePages(
          pages,
        ).join(", ")}.`,
      );
      handleInputChange("productOnPages", nextPages);

      return review;
    },
    [normalizeStorePages, handleInputChange, selectedSku, stageCopilotDraftReview],
  );

  const handleCopilotRemoveStorePages = useCallback(
    async ({ pages }: RemoveStorePagesInput): Promise<ToolSummary> => {
      if (!selectedSku) {
        throw new Error("Select a product before updating store pages.");
      }
      const pagesToRemove = new Set(
        normalizeStorePages(pages).map((page) => page.trim()),
      );
      const nextPages = (
        selectedSku ? draftsRef.current[selectedSku]?.productOnPages ?? [] : []
      ).filter(
        (page) => !pagesToRemove.has(page),
      );
      const review = stageCopilotDraftReview(
        [selectedSku],
        `Prepared removed ShopSite pages for ${selectedSku}: ${Array.from(
          pagesToRemove,
        ).join(", ")}.`,
      );
      handleInputChange("productOnPages", nextPages);

      return review;
    },
    [normalizeStorePages, handleInputChange, selectedSku, stageCopilotDraftReview],
  );

  const handleCopilotBulkUpdateStorePages = useCallback(
    async ({ scope, mode, pages }: BulkStorePagesInput): Promise<ToolSummary> => {
      const normalizedPages = normalizeStorePages(pages);
      const normalizedPageSet = new Set<string>(normalizedPages);
      if (normalizedPages.length === 0) {
        throw new Error("Provide at least one valid ShopSite page.");
      }

      const matchedSkus = resolveScopeSkus(scope);
      const nextDrafts = { ...draftsRef.current };

      matchedSkus.forEach((sku) => {
        const currentPages = nextDrafts[sku]?.productOnPages ?? [];
        nextDrafts[sku] = {
          ...(nextDrafts[sku] ?? EMPTY_FINALIZATION_DRAFT),
          productOnPages:
            mode === "replace"
              ? normalizedPages
              : mode === "add"
                ? normalizeStorePages([...currentPages, ...normalizedPages])
                : currentPages.filter((page) => !normalizedPageSet.has(page)),
        };
      });

      setDrafts(nextDrafts);

      return stageCopilotDraftReview(
        matchedSkus,
        `Prepared ${
          mode === "replace" ? "updated" : mode === "add" ? "added" : "removed"
        } ShopSite pages for ${matchedSkus.length} product${
          matchedSkus.length === 1 ? "" : "s"
        }.`,
      );
    },
    [normalizeStorePages, resolveScopeSkus, setDrafts, stageCopilotDraftReview],
  );

  const handleCopilotReplaceSelectedImages = useCallback(
    async ({ images }: ReplaceSelectedImagesInput): Promise<ToolSummary> => {
      const currentSku = selectedProductRef.current?.sku;
      if (!currentSku) {
        throw new Error("Select a product before updating images.");
      }
      const nextImages = normalizeSelectedImages(images);
      if (nextImages.length === 0) {
        throw new Error("Provide at least one valid image URL.");
      }

      const review = stageCopilotDraftReview(
        [currentSku],
        `Prepared a replacement image set with ${nextImages.length} images for ${currentSku}.`,
      );
      handleInputChange("selectedImages", nextImages);
      return review;
    },
    [normalizeSelectedImages, handleInputChange, stageCopilotDraftReview],
  );

  const handleCopilotAddSelectedImages = useCallback(
    async ({ images }: AddSelectedImagesInput): Promise<ToolSummary> => {
      if (!selectedSku) {
        throw new Error("Select a product before updating images.");
      }
      const nextImages = normalizeSelectedImages([
        ...(selectedSku ? draftsRef.current[selectedSku]?.selectedImages ?? [] : []),
        ...images,
      ]);
      const review = stageCopilotDraftReview(
        [selectedSku],
        `Prepared ${normalizeSelectedImages(images).length} added image${
          normalizeSelectedImages(images).length === 1 ? "" : "s"
        } for ${selectedSku}.`,
      );
      handleInputChange("selectedImages", nextImages);

      return review;
    },
    [normalizeSelectedImages, handleInputChange, selectedSku, stageCopilotDraftReview],
  );

  const handleCopilotRemoveSelectedImages = useCallback(
    async ({ images }: RemoveSelectedImagesInput): Promise<ToolSummary> => {
      if (!selectedSku) {
        throw new Error("Select a product before updating images.");
      }
      const toRemove = new Set(normalizeSelectedImages(images));
      const nextImages = (
        selectedSku ? draftsRef.current[selectedSku]?.selectedImages ?? [] : []
      ).filter(
        (image) => !toRemove.has(image),
      );
      const review = stageCopilotDraftReview(
        [selectedSku],
        `Prepared removal of ${toRemove.size} image${
          toRemove.size === 1 ? "" : "s"
        } for ${selectedSku}.`,
      );
      handleInputChange("selectedImages", nextImages);

      return review;
    },
    [normalizeSelectedImages, handleInputChange, selectedSku, stageCopilotDraftReview],
  );

  const handleCopilotRestoreSavedDraft = useCallback(
    async (): Promise<ToolSummary> => {
      const currentSku = selectedProductRef.current?.sku;
      if (!currentSku) {
        throw new Error("Select a product before restoring its draft.");
      }

      const review = stageCopilotDraftReview(
        [currentSku],
        `Prepared a restore to the last saved draft for ${currentSku}.`,
      );
      updateDraftForSku(
        currentSku,
        savedDraftsRef.current[currentSku] ?? EMPTY_FINALIZATION_DRAFT,
      );
      return review;
    },
    [stageCopilotDraftReview, updateDraftForSku],
  );

  const handleCopilotSaveDraft = useCallback(
    async (): Promise<ToolSummary> => {
      ensureNoPendingCopilotReview("saving");
      return persistCurrentDraft({ silent: true });
    },
    [ensureNoPendingCopilotReview, persistCurrentDraft],
  );

  const handleCopilotApproveProduct = useCallback(
    async (): Promise<ToolSummary> => {
      ensureNoPendingCopilotReview("approving");
      return persistCurrentDraft({ andPublish: true, silent: true });
    },
    [ensureNoPendingCopilotReview, persistCurrentDraft],
  );

  const handleCopilotRejectProduct = useCallback(
    async (): Promise<ToolSummary> => {
      ensureNoPendingCopilotReview("rejecting");
      return rejectCurrentProduct({ silent: true });
    },
    [ensureNoPendingCopilotReview, rejectCurrentProduct],
  );

  const handleCopilotSaveProducts = useCallback(
    async ({ scope }: ScopedProductActionInput): Promise<ToolSummary> => {
      ensureNoPendingCopilotReview("saving");
      return persistProducts({
        skus: resolveScopeSkus(scope),
        silent: true,
      });
    },
    [ensureNoPendingCopilotReview, persistProducts, resolveScopeSkus],
  );

  const handleCopilotApproveProducts = useCallback(
    async ({ scope }: ScopedProductActionInput): Promise<ToolSummary> => {
      ensureNoPendingCopilotReview("approving");
      return persistProducts({
        skus: resolveScopeSkus(scope),
        andPublish: true,
        silent: true,
      });
    },
    [ensureNoPendingCopilotReview, persistProducts, resolveScopeSkus],
  );

  const handleCopilotRejectProducts = useCallback(
    async ({ scope }: ScopedRejectProductInput): Promise<ToolSummary> => {
      ensureNoPendingCopilotReview("rejecting");
      return rejectProducts({
        skus: resolveScopeSkus(scope),
        silent: true,
      });
    },
    [ensureNoPendingCopilotReview, rejectProducts, resolveScopeSkus],
  );

  const renderCopilotPanel = () => (
    <FinalizationCopilotPanel
      selectedSku={selectedSku}
      workspaceProductCount={sortedProducts.length}
      dirtyProductCount={dirtySkus.length}
      hasPendingCopilotReview={hasPendingCopilotReview}
      pendingCopilotReviewCount={pendingCopilotReview?.skus.length ?? 0}
      pendingCopilotSummaries={pendingCopilotReview?.summaries ?? []}
      reviewActionPending={saving || publishing || rejecting}
      getContext={getCopilotContext}
      onAcceptPendingCopilotReview={handleAcceptPendingCopilotReview}
      onRejectPendingCopilotReview={handleRejectPendingCopilotReview}
      onListWorkspaceProducts={handleCopilotListWorkspaceProducts}
      onPreviewProductScope={handleCopilotPreviewProductScope}
      onGetProductSnapshot={handleCopilotGetProductSnapshot}
      onInspectSourceData={handleCopilotInspectSourceData}
      onListImageSources={handleCopilotListImageSources}
      onSetProductFields={handleCopilotSetProductFields}
      onBulkSetProductFields={handleCopilotBulkSetProductFields}
      onBulkTransformProductNames={handleCopilotBulkTransformProductNames}
      onAssignBrand={handleCopilotAssignBrand}
      onBulkAssignBrand={handleCopilotBulkAssignBrand}
      onCreateBrand={handleCopilotCreateBrand}
      onSetStorePages={handleCopilotSetStorePages}
      onAddStorePages={handleCopilotAddStorePages}
      onRemoveStorePages={handleCopilotRemoveStorePages}
      onBulkUpdateStorePages={handleCopilotBulkUpdateStorePages}
      onReplaceSelectedImages={handleCopilotReplaceSelectedImages}
      onAddSelectedImages={handleCopilotAddSelectedImages}
      onRemoveSelectedImages={handleCopilotRemoveSelectedImages}
      onRestoreSavedDraft={handleCopilotRestoreSavedDraft}
      onSaveDraft={handleCopilotSaveDraft}
      onSaveProducts={handleCopilotSaveProducts}
      onApproveProduct={handleCopilotApproveProduct}
      onApproveProducts={handleCopilotApproveProducts}
      onRejectProduct={handleCopilotRejectProduct}
      onRejectProducts={handleCopilotRejectProducts}
    />
  );

  return (
    <>
      <div className="flex h-full min-h-0 border-4 border-zinc-950 rounded-none bg-white shadow-[8px_8px_0px_rgba(0,0,0,1)] overflow-hidden max-w-full m-1 mr-4 mb-4">
        {/* Left Column: Product List */}
        <ProductListSidebar
          products={sortedProducts}
          selectedSku={selectedSku}
          onSelectProduct={handleSelectProduct}
          scrollContainerRef={scrollContainerRef}
          search={search}
          onSearchChange={onSearchChange}
          filters={filters}
          onFilterChange={onFilterChange}
          availableSources={availableSources}
          showSourceFilter={false}
          groupedProducts={groupedProducts}
          cohortBrands={cohortBrands}
          onEditCohort={onEditCohort}
          selectedSkus={selectedSkus}
          onSelectSku={onSelectSku}
          isLoading={isSearching}
        />

        {/* Right Column: Editing Form */}
        <Sheet open={copilotOpen} onOpenChange={setCopilotOpen}>
          <div className="flex-1 flex flex-col bg-white overflow-hidden">
            {selectedProduct ? (
              <>
                {/* Header */}
                <ProductSaveActions
                  productName={formData.name}
                  originalName={selectedProduct.input?.name || ""}
                  productPrice={formData.price}
                  selectedSku={selectedSku}
                  isDirty={isDirty}
                  hasPendingCopilotReview={hasPendingCopilotReview}
                  saving={saving}
                  publishing={publishing}
                  rejecting={rejecting}
                  onSave={() => {
                    if (pendingCopilotReviewRef.current) {
                      notifyPendingCopilotReview("saving");
                      return;
                    }
                    void persistCurrentDraft();
                  }}
                  onPublish={() => {
                    if (pendingCopilotReviewRef.current) {
                      notifyPendingCopilotReview("approving");
                      return;
                    }
                    void persistCurrentDraft({ andPublish: true });
                  }}
                  onReject={handleReject}
                  copilotTrigger={
                    <SheetTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)] font-black uppercase tracking-tighter text-zinc-950 hover:bg-zinc-100 active:shadow-none active:translate-x-[1px] active:translate-y-[1px] transition-all"
                      >
                        <Sparkles className="mr-2 h-4 w-4 text-violet-500" />
                        Copilot
                      </Button>
                    </SheetTrigger>
                  }
                />

              {hasPendingCopilotReview ? (
                <div className="border-b bg-violet-50/60 px-4 py-3">
                  <Alert className="border-violet-200 bg-violet-50 text-violet-950">
                    <AlertTitle>Copilot changes are staged</AlertTitle>
                    <AlertDescription>
                      Review {pendingCopilotReview?.skus.length ?? 0} product
                      {(pendingCopilotReview?.skus.length ?? 0) === 1 ? "" : "s"}{" "}
                      in the Copilot panel before saving, approving, or
                      switching products.
                    </AlertDescription>
                  </Alert>
                </div>
              ) : null}

            {/* Form Content */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 overflow-y-auto min-h-0 p-2 sm:p-3 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
                  <div className="space-y-2">
                    <ImageCarousel
                      selectedImages={formData.selectedImages}
                      onToggleImage={toggleImage}
                      onReorderImages={(newImages) =>
                        handleInputChange("selectedImages", newImages)
                      }
                    />
                    <div className="flex gap-2">
                      <Input
                        value={formData.customImageUrl}
                        onChange={(e) =>
                          handleInputChange("customImageUrl", e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCustomImage();
                          }
                        }}
                        placeholder="Paste custom product image URL..."
                        className="h-8 border border-zinc-950 rounded-none shadow-[1px_1px_0px_rgba(0,0,0,1)] focus-visible:ring-zinc-950 font-bold text-xs"
                      />
                      <Button
                        onClick={addCustomImage}
                        size="sm"
                        className="h-8 bg-zinc-950 text-white rounded-none shadow-[1px_1px_0px_rgba(0,0,0,1)] hover:bg-zinc-800 font-black uppercase tracking-tighter text-[10px]"
                      >
                        Add
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <ProductInfoForm
                      formData={formData}
                      handleInputChange={handleInputChange}
                      handleNameChange={handleNameChange}
                    />

                    <MerchandisingClassification
                      formData={formData}
                      handleInputChange={handleInputChange}
                      brands={brands}
                      filteredBrands={filteredBrands}
                      brandSearch={brandSearch}
                      setBrandSearch={setBrandSearch}
                      brandPopoverOpen={brandPopoverOpen}
                      setBrandPopoverOpen={setBrandPopoverOpen}
                      creatingBrand={creatingBrand}
                      handleCreateBrand={handleCreateBrand}
                      pageSearch={pageSearch}
                      setPageSearch={setPageSearch}
                      pagePopoverOpen={pagePopoverOpen}
                      setPagePopoverOpen={setPagePopoverOpen}
                      filteredPages={filteredPages}
                      normalizeStorePages={normalizeStorePages}
                      addCustomSource={addCustomSource}
                      removeSource={removeSource}
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <Separator className="mb-4" />
                  <details className="group overflow-hidden rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                    <summary className="flex cursor-pointer items-center justify-between p-4 text-sm font-black uppercase tracking-tighter text-zinc-500 hover:bg-zinc-50 list-none">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        View Raw Scraped Data
                      </div>
                      <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="space-y-4 border-t border-zinc-950 bg-zinc-50 p-4">
                      {Object.entries(selectedProduct.sources || {}).map(
                        ([source, data]) => (
                          <div key={source} className="space-y-2">
                            <div className="text-xs font-black uppercase tracking-tighter text-zinc-950">
                              {source}
                            </div>
                            <pre className="overflow-x-auto rounded-none border border-zinc-950 bg-white p-3 text-[10px] font-bold">
                              {JSON.stringify(data, null, 2)}
                            </pre>
                          </div>
                        ),
                      )}
                    </div>
                  </details>
                </div>
              </div>

            </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-500">
              <Package className="mb-2 h-12 w-12 opacity-20" />
              <h3 className="text-xl font-black uppercase tracking-tighter text-zinc-950">Select a product to review</h3>
              <p className="text-sm font-black uppercase tracking-tighter mt-2">
                Products here have been consolidated by AI and are ready for
                your final check.
              </p>
            </div>
          )}

          {/* Mobile Copilot Panel removed in favor of Sheet */}
          </div>
          <SheetContent
            side="right"
            className="w-[450px] sm:w-[600px] p-0 border-l border-zinc-950 shadow-[-2px_0px_0px_rgba(0,0,0,1)] rounded-none overflow-y-auto"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Copilot</SheetTitle>
            </SheetHeader>
            {renderCopilotPanel()}
          </SheetContent>
        </Sheet>
      </div>

      <ConfirmationDialog
          open={confirmRejectOpen}
          onOpenChange={setConfirmRejectOpen}
          onConfirm={handleConfirmReject}
          title="Reject Product"
          description="Are you sure you want to reject this product and send it back to the scraped stage? This will not clear your edits, but the product will move back to the manual review pipeline."
          confirmLabel="Reject"
        />
    </>
  );
}
