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

import {
  isValidCustomImageUrl,
} from "./reviewing/reviewing-utils";
import { ProductListSidebar } from "./reviewing/ProductListSidebar";
import { ImageCarousel } from "./reviewing/ImageCarousel";
import { ProductSaveActions } from "./reviewing/ProductSaveActions";
import { ReviewingCopilotPanel } from "./reviewing/ReviewingCopilotPanel";
import { ProductInfoForm } from "./reviewing/ProductInfoForm";
import { MerchandisingClassification } from "./reviewing/MerchandisingClassification";
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
} from "@/lib/pipeline/reviewing-copilot-workspace";
import {
  buildConsolidatedPayloadFromDraft,
  buildInitialFinalizationDraft,
  createPersistedFinalizationDraftSnapshot,
  EMPTY_FINALIZATION_DRAFT,
  toFinalizationImageArray,
  type FinalizationDraft,
} from "@/lib/pipeline/reviewing-draft";
import type {
  AddSelectedImagesInput,
  AddSourceUrlInput,
  AssignBrandInput,
  BulkAssignBrandInput,
  BulkTransformProductNamesInput,
  BulkSetProductFieldsInput,
  CreateBrandInput,
  InspectSourceDataInput,
  ListImageSourcesInput,
  ListWorkspaceProductsInput,
  PreviewProductScopeInput,
  ProductSnapshotInput,
  RemoveSelectedImagesInput,
  RemoveSourceInput,
  ReplaceSelectedImagesInput,
  ScopedProductActionInput,
  ScopedRejectProductInput,
  SetProductFieldsInput,
  ToolSummary,
} from "@/lib/tools/reviewing-copilot";
import { filterPendingCopilotDraftReview, restorePendingCopilotDraftReview, stagePendingCopilotDraftReview, type PendingCopilotDraftReview } from "@/lib/pipeline/reviewing-copilot-review";
import type { Brand } from "@/lib/types";
import type { TaxonomyCategoryNode } from "@/lib/taxonomy";
import { adminFetch } from '@/lib/admin/api-client';

interface ReviewingResultsViewProps {
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
  cohortBrandObjects?: Record<string, Brand>;
  onEditCohort?: (id: string, name: string | null, brandName: string | null) => void;
  selectedUpcs?: Set<string>;
  onSelectUpc?: (
    upc: string,
    selected: boolean,
    index?: number,
    isShift?: boolean,
  ) => void;
  isSearching?: boolean;
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

export function ReviewingResultsView({
  products,
  onRefresh,
  search,
  onSearchChange,
  filters,
  onFilterChange,
  availableSources = [],
  groupedProducts,
  cohortBrands = {},
  cohortBrandObjects = {},
  onEditCohort,
  selectedUpcs = new Set(),
  onSelectUpc,
  isSearching = false,
}: ReviewingResultsViewProps) {
  const [copilotOpen, setCopilotOpen] = useState(false);

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => a.upc.localeCompare(b.upc));
  }, [products]);

  const [preferredSku, setPreferredSku] = useState<string | null>(
    sortedProducts.length > 0 ? sortedProducts[0].upc : null,
  );

  // track previous products to detect when a product is removed (moved to publishing/rejected)
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


  // Categories state
  const [categories, setCategories] = useState<TaxonomyCategoryNode[]>([]);
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);

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


  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    const search = categorySearch.toLowerCase();
    return categories.filter((c) =>
      c.name.toLowerCase().includes(search)
      || c.breadcrumb.toLowerCase().includes(search)
    );
  }, [categories, categorySearch]);

  const createBrandRecord = useCallback(async (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error("Brand name is required");
    }

    const res = await adminFetch("/api/admin/brands", {
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
      Object.fromEntries(sortedProducts.map((product) => [product.upc, product])),
    [sortedProducts],
  );
  const productsBySkuRef = useRef<Record<string, PipelineProduct>>(productsBySku);

  const selectedProduct= useMemo(
    () =>
      sortedProducts.find((product) => product.upc === preferredSku) ??
      sortedProducts[0] ??
      null,
    [preferredSku, sortedProducts],
  );
  const selectedProductRef = useRef<PipelineProduct | null>(selectedProduct);

  const selectedSku = selectedProduct?.upc ?? null;

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
      const currentExists = sortedProducts.some((p) => p.upc === preferredSku);
      if (!currentExists && preferredSku) {
        // Current SKU was removed (for example, moved into publishing or rejected).
        // Find where it was in the PREVIOUS list.
        const prevIndex = prevProducts.findIndex((p) => p.upc === preferredSku);
        if (prevIndex !== -1) {
          // Select the product that is now at that same index (or the one before if it was last)
          const nextIndex = Math.min(prevIndex, sortedProducts.length - 1);
          if (nextIndex >= 0) {
            setPreferredSku(sortedProducts[nextIndex].upc);
          } else {
            setPreferredSku(null);
          }
        }
      } else if (!preferredSku && sortedProducts.length > 0) {
        setPreferredSku(sortedProducts[0].upc);
      }
      prevProductsRef.current = sortedProducts;
    }
  }, [sortedProducts, preferredSku]);

  // Fetch brands and categories
  useEffect(() => {
    async function fetchData() {
      try {
        const [brandsRes, categoriesRes] = await Promise.all([
          adminFetch("/api/admin/brands"),
          adminFetch("/api/admin/categories"),
        ]);

        if (brandsRes.ok) {
          const data = await brandsRes.json();
          setBrands(data.brands || []);
        }

        if (categoriesRes.ok) {
          const data = await categoriesRes.json();
          setCategories(data.categories || []);
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
      const existingDraft = draftsRef.current[product.upc];
      const existingSavedDraft = savedDraftsRef.current[product.upc];
      const preserveExistingDraft =
        existingDraft
        && existingSavedDraft
        && JSON.stringify(existingDraft) !== JSON.stringify(existingSavedDraft);

      nextDrafts[product.upc] = preserveExistingDraft
        ? existingDraft
        : initialDraft;
      nextSavedDrafts[product.upc] = preserveExistingDraft
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
          const draft = draftsBySku[product.upc];
          const saved = savedDraftsBySku[product.upc];

          return (
            !!draft
            && !!saved
            && JSON.stringify(draft) !== JSON.stringify(saved)
          );
        })
        .map((product) => product.upc),
    [draftsBySku, savedDraftsBySku, sortedProducts],
  );
  const isDirty = selectedSku ? dirtySkus.includes(selectedSku) : false;

  const updateDraftForSku = useCallback(
    (upc: string, value: SetStateAction<FinalizationDraft>) => {
      setDrafts((prev) => {
        const current = prev[upc] ?? EMPTY_FINALIZATION_DRAFT;
        const nextDraft =
          typeof value === "function"
            ? (value as (previous: FinalizationDraft) => FinalizationDraft)(
                current,
              )
            : value;

        return {
          ...prev,
          [upc]: nextDraft,
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
    (upcs: string[], summary: string): ToolSummary => {
      const nextPendingReview = stagePendingCopilotDraftReview({
        pendingReview: pendingCopilotReviewRef.current,
        draftsBySku: draftsRef.current,
        targetUpcs: upcs,
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

  const handleBrandChange = useCallback(
    (brandId: string, brandName: string) => {
      if (!selectedSku) {
        return;
      }
      if (pendingCopilotReviewRef.current) {
        notifyPendingCopilotReview("editing the draft manually");
        return;
      }
      updateDraftForSku(selectedSku, (prev) => ({
        ...prev,
        brandId,
        brandName,
      }));
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
      handleBrandChange(brand.id, brand.name);
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


  const normalizeSelectedImages = useCallback((images: string[]) => {
    return toFinalizationImageArray(
      images.filter((image) => isValidCustomImageUrl(image)),
    );
  }, []);

  const persistProducts = useCallback(
    async ({
      upcs,
      andPublish = false,
      silent = false,
    }: {
      upcs: string[];
      andPublish?: boolean;
      silent?: boolean;
    }): Promise<PersistProductsResult> => {
      const targetSkus = Array.from(
        new Set(upcs.filter((upc) => upc.trim().length > 0)),
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
        const results = await runWithConcurrency(targetSkus, 4, async (upc) => {
          const currentProduct = productsBySkuRef.current[upc];
          const currentDraft = draftsRef.current[upc];
          const currentSavedDraft = savedDraftsRef.current[upc];

          if (!currentProduct || !currentDraft || !currentSavedDraft) {
            throw new Error(`Missing draft state for ${upc}.`);
          }

          const persistedSnapshot =
            createPersistedFinalizationDraftSnapshot(currentDraft);
          const hasPersistableChanges =
            JSON.stringify(persistedSnapshot)
            !== JSON.stringify(currentSavedDraft);

          if (hasPersistableChanges) {
            const patchRes = await adminFetch(`/api/admin/pipeline/${encodeURIComponent(currentProduct.upc)}`,
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
            const publishRes = await adminFetch(`/api/admin/pipeline/publish`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ upc: currentProduct.upc }),
            });

            if (!publishRes.ok) {
              const data = await publishRes.json().catch(() => null);
              throw new Error(
                data?.error || "Failed to publish product to storefront",
              );
            }
          }

          return {
            upc,
            hasPersistableChanges,
            persistedSnapshot,
          };
        });

        const successful = results
          .filter(
            (
              result,
            ): result is PromiseFulfilledResult<{
              upc: string;
              hasPersistableChanges: boolean;
              persistedSnapshot: FinalizationDraft;
            }> => result.status === "fulfilled",
          )
          .map((result) => result.value);
        const failedSkus = results
          .map((result, index) =>
            result.status === "rejected" ? targetSkus[index] : null,
          )
          .filter((upc): upc is string => upc !== null);

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
          successful.map((result) => [result.upc, result.persistedSnapshot]),
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
          ? `Published ${successful.length} ${noun} to the storefront.`
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
          successfulSkus: successful.map((result) => result.upc),
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
      const currentSku = selectedProductRef.current?.upc;
      if (!currentSku) {
        throw new Error("Select a product before saving.");
      }

      return persistProducts({
        upcs: [currentSku],
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
        upcs: currentPendingReview.upcs,
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
      `Rejected staged copilot changes for ${currentPendingReview.upcs.length} product${
        currentPendingReview.upcs.length === 1 ? "" : "s"
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
      upcs,
      silent = false,
    }: {
      upcs: string[];
      silent?: boolean;
    }): Promise<ToolSummary> => {
      const targetSkus = Array.from(
        new Set(upcs.filter((upc) => upc.trim().length > 0)),
      );

      if (targetSkus.length === 0) {
        throw new Error("No products matched the requested rejection scope.");
      }

      setRejecting(true);

      try {
        const res =
          targetSkus.length === 1
            ? await adminFetch(`/api/admin/pipeline/${encodeURIComponent(targetSkus[0])}`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ pipeline_status: "processed" }),
                },
              )
            : await adminFetch(`/api/admin/pipeline/bulk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  upcs: targetSkus,
                  toStatus: "processed",
                }),
              });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Failed to reject product");
        }

        const summary =
          targetSkus.length === 1
            ? "Moved the product back to the processed stage for additional review."
            : `Moved ${targetSkus.length} products back to the processed stage for additional review.`;

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
      const currentSku = selectedProductRef.current?.upc;
      if (!currentSku) {
        throw new Error("Select a product before rejecting it.");
      }

      return rejectProducts({
        upcs: [currentSku],
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

  const resolveProductWorkspaceState = useCallback((upc?: string) => {
    const resolvedSku = upc ?? selectedProductRef.current?.upc;
    if (!resolvedSku) {
      throw new Error("Select a product or provide a SKU first.");
    }

    const product = productsBySkuRef.current[resolvedSku];
    const draft = draftsRef.current[resolvedSku];
    const savedDraft = savedDraftsRef.current[resolvedSku];

    if (!product || !draft || !savedDraft) {
      throw new Error(`Product ${resolvedSku} is not available in reviewing.`);
    }

    return {
      upc: resolvedSku,
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
        selectedProductRef.current?.upc ?? null,
        scope,
      );

      if (matchedSkus.length === 0) {
        throw new Error("No products matched the requested scope.");
      }

      return matchedSkus;
    },
    [sortedProducts],
  );

  const buildScopeSummaries = useCallback((upcs: string[]) => {
    return upcs
      .map((upc) => {
        const product = productsBySkuRef.current[upc];
        const draft = draftsRef.current[upc];
        const savedDraft = savedDraftsRef.current[upc];

        if (!product || !draft || !savedDraft) {
          return null;
        }

        return buildWorkspaceProductSummary(
          product,
          draft,
          savedDraft,
          selectedProductRef.current?.upc ?? null,
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
            upc: currentProduct.upc,
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
        selectedProductRef.current?.upc ?? null,
        input,
      );

      return {
        ...result,
        summary: input.query
          ? `Found ${result.matched} matching products in reviewing (showing ${result.products.length}).`
          : `Loaded ${result.total} products in reviewing (showing ${result.products.length}).`,
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
    async ({ upc }: ProductSnapshotInput) => {
      const { product, draft, savedDraft } = resolveProductWorkspaceState(upc);
      return buildFinalizationProductSnapshot(product, draft, savedDraft);
    },
    [resolveProductWorkspaceState],
  );

  const handleCopilotInspectSourceData = useCallback(
    async ({ upc, sourceKey, focus }: InspectSourceDataInput) => {
      const { product } = resolveProductWorkspaceState(upc);
      return inspectFinalizationProductSource(product, sourceKey, focus);
    },
    [resolveProductWorkspaceState],
  );

  const handleCopilotListImageSources = useCallback(
    async ({ upc }: ListImageSourcesInput) => {
      const { product, draft } = resolveProductWorkspaceState(upc);
      return listFinalizationProductImageSources(product, draft);
    },
    [resolveProductWorkspaceState],
  );

  const handleCopilotSetProductFields = useCallback(
    async (input: SetProductFieldsInput): Promise<ToolSummary> => {
      const currentSku = selectedProductRef.current?.upc;
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

      matchedSkus.forEach((upc) => {
        const result = applySetProductFieldsToDraft(
          nextDrafts[upc] ?? EMPTY_FINALIZATION_DRAFT,
          changes,
        );
        nextDrafts[upc] = result.draft;
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

      matchedSkus.forEach((upc) => {
        const result = applyProductNameTransform(
          nextDrafts[upc] ?? EMPTY_FINALIZATION_DRAFT,
          {
            mode,
            value,
            find,
            skipIfContains,
          },
        );
        if (result.changed) {
          changedCount += 1;
          changedSkus.push(upc);
          nextDrafts[upc] = result.draft;
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
      const currentSku = selectedProductRef.current?.upc;
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
      const currentSku = selectedProductRef.current?.upc;
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
      matchedSkus.forEach((upc) => {
        nextDrafts[upc] = {
          ...(nextDrafts[upc] ?? EMPTY_FINALIZATION_DRAFT),
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


  const handleCopilotReplaceSelectedImages = useCallback(
    async ({ images }: ReplaceSelectedImagesInput): Promise<ToolSummary> => {
      const currentSku = selectedProductRef.current?.upc;
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

  const handleCopilotAddSourceUrl = useCallback(
    async ({ url }: AddSourceUrlInput): Promise<ToolSummary> => {
      const currentSku = selectedProductRef.current?.upc;
      if (!currentSku) {
        throw new Error("Select a product before updating sources.");
      }

      let normalizedUrl: string;
      try {
        normalizedUrl = new URL(url).toString();
      } catch {
        throw new Error("Provide a valid source URL.");
      }

      const currentSources = draftsRef.current[currentSku]?.sources ?? {};
      const existingSourceKey = Object.entries(currentSources).find(([, sourceData]) => {
        if (!sourceData || typeof sourceData !== "object" || Array.isArray(sourceData)) {
          return false;
        }

        return (sourceData as { url?: unknown }).url === normalizedUrl;
      })?.[0];

      if (existingSourceKey) {
        return {
          summary: `Source ${existingSourceKey} is already attached to ${currentSku}.`,
        };
      }

      const hostname = new URL(normalizedUrl).hostname.replace(/^www\./, "");
      const baseSourceKey = `custom:${hostname}`;
      let sourceKey = baseSourceKey;
      let collisionIndex = 2;
      while (sourceKey in currentSources) {
        sourceKey = `${baseSourceKey}-${collisionIndex}`;
        collisionIndex += 1;
      }

      const review = stageCopilotDraftReview(
        [currentSku],
        `Prepared a custom source URL for ${currentSku}: ${normalizedUrl}.`,
      );

      updateDraftForSku(currentSku, (prev) => ({
        ...prev,
        sources: {
          ...prev.sources,
          [sourceKey]: {
            url: normalizedUrl,
            scraped_at: new Date().toISOString(),
            _is_custom: true,
          },
        },
        customSourceUrl: "",
      }));

      return review;
    },
    [stageCopilotDraftReview, updateDraftForSku],
  );

  const handleCopilotRemoveSource = useCallback(
    async ({ sourceKey }: RemoveSourceInput): Promise<ToolSummary> => {
      const currentSku = selectedProductRef.current?.upc;
      if (!currentSku) {
        throw new Error("Select a product before updating sources.");
      }

      const currentSources = draftsRef.current[currentSku]?.sources ?? {};
      if (!(sourceKey in currentSources)) {
        throw new Error(`Unknown source key: ${sourceKey}`);
      }

      const review = stageCopilotDraftReview(
        [currentSku],
        `Prepared removal of source ${sourceKey} for ${currentSku}.`,
      );

      updateDraftForSku(currentSku, (prev) => {
        const nextSources = { ...prev.sources };
        delete nextSources[sourceKey];
        return {
          ...prev,
          sources: nextSources,
        };
      });

      return review;
    },
    [stageCopilotDraftReview, updateDraftForSku],
  );

  const handleCopilotRestoreSavedDraft = useCallback(
    async (): Promise<ToolSummary> => {
      const currentSku = selectedProductRef.current?.upc;
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
        upcs: resolveScopeSkus(scope),
        silent: true,
      });
    },
    [ensureNoPendingCopilotReview, persistProducts, resolveScopeSkus],
  );

  const handleCopilotApproveProducts = useCallback(
    async ({ scope }: ScopedProductActionInput): Promise<ToolSummary> => {
      ensureNoPendingCopilotReview("approving");
      return persistProducts({
        upcs: resolveScopeSkus(scope),
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
        upcs: resolveScopeSkus(scope),
        silent: true,
      });
    },
    [ensureNoPendingCopilotReview, rejectProducts, resolveScopeSkus],
  );

  const renderCopilotPanel = () => (
    <ReviewingCopilotPanel
      selectedSku={selectedSku}
      workspaceProductCount={sortedProducts.length}
      dirtyProductCount={dirtySkus.length}
      hasPendingCopilotReview={hasPendingCopilotReview}
      pendingCopilotReviewCount={pendingCopilotReview?.upcs.length ?? 0}
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
      onReplaceSelectedImages={handleCopilotReplaceSelectedImages}
      onAddSelectedImages={handleCopilotAddSelectedImages}
      onRemoveSelectedImages={handleCopilotRemoveSelectedImages}
      onAddSourceUrl={handleCopilotAddSourceUrl}
      onRemoveSource={handleCopilotRemoveSource}
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
      <div className="flex flex-1 min-h-0 border border-border rounded-none bg-card overflow-hidden max-w-full">
        {/* Left Column: Product List */}
        <ProductListSidebar
          products={sortedProducts}
          selectedUpc={selectedSku}
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
          cohortBrandObjects={cohortBrandObjects}
          onEditCohort={onEditCohort}

          selectedUpcs={selectedUpcs}
          onSelectUpc={onSelectUpc}
          isLoading={isSearching}
        />

        {/* Right Column: Editing Form */}
        <Sheet open={copilotOpen} onOpenChange={setCopilotOpen}>
          <div className="flex-1 flex flex-col bg-card overflow-hidden">
            {selectedProduct ? (
              <>
                {/* Header */}
                <ProductSaveActions
                  productName={formData.name}
                  originalName={selectedProduct.input?.name || ""}
                  productPrice={formData.price}
                  selectedUpc={selectedSku}
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
                        className="rounded-none border border-border font-semibold text-foreground hover:bg-muted/50 transition-all"
                      >
                        <Sparkles className="mr-2 h-4 w-4 text-primary" />
                        Copilot
                      </Button>
                    </SheetTrigger>
                  }
                />

              {hasPendingCopilotReview ? (
                <div className="border-b bg-primary/[0.02] px-4 py-3">
                  <Alert className="border-primary/20 bg-card text-foreground rounded-none">
                    <AlertTitle className="font-semibold text-xs">Copilot changes are staged</AlertTitle>
                    <AlertDescription className="font-semibold text-[10px] text-muted-foreground">
                      Review {pendingCopilotReview?.upcs.length ?? 0} product
                      {(pendingCopilotReview?.upcs.length ?? 0) === 1 ? "" : "s"}{" "}
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
                        className="h-8 border border-border rounded-none focus-visible:ring-border font-bold text-xs"
                      />
                      <Button
                        onClick={addCustomImage}
                        size="sm"
                        className="h-8 bg-foreground text-background rounded-none hover:bg-foreground/90 font-semibold text-[10px]"
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
                      handleBrandChange={handleBrandChange}
                      brands={brands}
                      filteredBrands={filteredBrands}
                      brandSearch={brandSearch}
                      setBrandSearch={setBrandSearch}
                      brandPopoverOpen={brandPopoverOpen}
                      setBrandPopoverOpen={setBrandPopoverOpen}
                      creatingBrand={creatingBrand}
                      handleCreateBrand={handleCreateBrand}
                      categorySearch={categorySearch}
                      setCategorySearch={setCategorySearch}
                      categoryPopoverOpen={categoryPopoverOpen}
                      setCategoryPopoverOpen={setCategoryPopoverOpen}
                      filteredCategories={filteredCategories}
                      addCustomSource={addCustomSource}
                      removeSource={removeSource}
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <Separator className="mb-4 bg-border" />
                  <details className="group overflow-hidden rounded-none border border-border">
                    <summary className="flex cursor-pointer items-center justify-between p-4 text-sm font-semibold text-muted-foreground hover:bg-muted/30 list-none">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        View Raw Scraped Data
                      </div>
                      <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="space-y-4 border-t border-border bg-muted/10 p-4">
                      {Object.entries(selectedProduct.sources || {}).map(
                        ([source, data]) => (
                          <div key={source} className="space-y-2">
                            <div className="text-xs font-semibold text-foreground">
                              {source}
                            </div>
                            <pre className="overflow-x-auto rounded-none border border-border bg-card p-3 text-[10px] font-bold">
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
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
              <Package className="mb-2 h-12 w-12 opacity-20" />
              <h3 className="text-xl font-semibold text-foreground">Select a product to review</h3>
              <p className="text-sm font-semibold mt-2">
                Products here have been consolidated by AI and are ready for
                your final check.
              </p>
            </div>
          )}

          {/* Mobile Copilot Panel removed in favor of Sheet */}
          </div>
          <SheetContent
            side="right"
            className="w-[450px] sm:w-[600px] p-0 border-l border-border rounded-none overflow-y-auto"
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
          description="Are you sure you want to reject this product and send it back to the processed stage? This will not clear your edits, but the product will move back to the manual review pipeline."
          confirmLabel="Reject"
        />
    </>
  );
}
