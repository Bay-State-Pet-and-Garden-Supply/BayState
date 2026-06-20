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
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { PipelineProduct } from "@/lib/pipeline/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

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
import { formatPipelineSourceSlug } from "./source-view-model";
import { PackagingEvidencePanel } from "./PackagingEvidencePanel";
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
  extractSelectedImageUrls,
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

import type { Brand } from "@/lib/types";
import type { TaxonomyCategoryNode } from "@/lib/taxonomy";
import { adminFetch } from '@/lib/admin/api-client';
import {
  normalizeProductSourcesForReview,
  extractImageCandidatesFromSourcePayload,
} from "@/lib/product-sources";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ReviewingResultsViewProps {
  products: PipelineProduct[];
  onRefresh: (silent?: boolean) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  filters?: PipelineFiltersState;
  onFilterChange?: (filters: PipelineFiltersState) => void;
  availableSources?: string[];
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
  successfulUpcs: string[];
  failedUpcs: string[];
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

function deleteSourceFromRecord(
  sources: Record<string, unknown>,
  sourceKey: string,
): Record<string, unknown> {
  const nextSources = { ...sources };
  const cleanKey = sourceKey.startsWith("enriched:")
    ? sourceKey.replace("enriched:", "")
    : sourceKey;

  if (cleanKey === "enriched") {
    delete nextSources.enriched;
    return nextSources;
  }

  const enriched = nextSources.enriched as Record<string, any> | undefined;
  if (enriched && enriched.approved_sources && typeof enriched.approved_sources === "object" && (cleanKey in enriched.approved_sources)) {
    const nextApproved = { ...enriched.approved_sources };
    delete nextApproved[cleanKey];

    if (Object.keys(nextApproved).length === 0) {
      delete nextSources.enriched;
    } else {
      let nextActive = enriched.active_source_slug;
      if (nextActive === cleanKey) {
        nextActive = Object.keys(nextApproved)[0] || null;
      }

      const activeSnapshot = nextApproved[nextActive];
      nextSources.enriched = {
        ...enriched,
        ...activeSnapshot,
        active_source_slug: nextActive,
        source_slug: nextActive,
        approved_sources: nextApproved,
      };
    }
  } else {
    delete nextSources[sourceKey];
    delete nextSources[cleanKey];
  }

  return nextSources;
}

export function ReviewingResultsView({
  products,
  onRefresh,
  search,
  onSearchChange,
  filters,
  onFilterChange,
  availableSources = [],
  selectedUpcs = new Set(),
  onSelectUpc,
  isSearching = false,
}: ReviewingResultsViewProps) {
  const [copilotOpen, setCopilotOpen] = useState(false);

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => a.upc.localeCompare(b.upc));
  }, [products]);

  const [preferredUpc, setPreferredUpc] = useState<string | null>(
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
  const [selectedSourceByUpc, setSelectedSourceByUpc] = useState<Record<string, string>>({});
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
  const draftsByUpc = draftsState;
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
  const savedDraftsByUpc = savedDraftsState;

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
  const productsByUpc = useMemo(
    () =>
      Object.fromEntries(sortedProducts.map((product) => [product.upc, product])),
    [sortedProducts],
  );
  const productsByUpcRef = useRef<Record<string, PipelineProduct>>(productsByUpc);

  const selectedProduct= useMemo(
    () =>
      sortedProducts.find((product) => product.upc === preferredUpc) ??
      sortedProducts[0] ??
      null,
    [preferredUpc, sortedProducts],
  );
  const selectedProductRef = useRef<PipelineProduct | null>(selectedProduct);

  const selectedUpc = selectedProduct?.upc ?? null;

  useEffect(() => {
    selectedProductRef.current = selectedProduct;
  }, [selectedProduct]);

  useEffect(() => {
    productsByUpcRef.current = productsByUpc;
  }, [productsByUpc]);

  // Intelligent selection: When products change, if the current selection is gone,
  // select the next product that was after it.
  useEffect(() => {
    const prevProducts = prevProductsRef.current;
    if (prevProducts !== sortedProducts) {
      const currentExists = sortedProducts.some((p) => p.upc === preferredUpc);
      if (!currentExists && preferredUpc) {
        // Current UPC was removed (for example, moved into publishing or rejected).
        // Find where it was in the PREVIOUS list.
        const prevIndex = prevProducts.findIndex((p) => p.upc === preferredUpc);
        if (prevIndex !== -1) {
          // Select the product that is now at that same index (or the one before if it was last)
          const nextIndex = Math.min(prevIndex, sortedProducts.length - 1);
          if (nextIndex >= 0) {
            setPreferredUpc(sortedProducts[nextIndex].upc);
          } else {
            setPreferredUpc(null);
          }
        }
      } else if (!preferredUpc && sortedProducts.length > 0) {
        setPreferredUpc(sortedProducts[0].upc);
      }
      prevProductsRef.current = sortedProducts;
    }
  }, [sortedProducts, preferredUpc]);

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

  const formData = selectedUpc
    ? draftsByUpc[selectedUpc] ?? EMPTY_FINALIZATION_DRAFT
    : EMPTY_FINALIZATION_DRAFT;
  const dirtyUpcs = useMemo(
    () =>
      sortedProducts
        .filter((product) => {
          const draft = draftsByUpc[product.upc];
          const saved = savedDraftsByUpc[product.upc];

          return (
            !!draft
            && !!saved
            && JSON.stringify(draft) !== JSON.stringify(saved)
          );
        })
        .map((product) => product.upc),
    [draftsByUpc, savedDraftsByUpc, sortedProducts],
  );
  const isDirty = selectedUpc ? dirtyUpcs.includes(selectedUpc) : false;

  // Get image options for the selected product
  const imageSourceOptions = useMemo(() => {
    if (!selectedProduct) return [];

    const sources = normalizeProductSourcesForReview(selectedProduct.sources || {});

    // 1. Metadata / Selected images (if any exist)
    const metadataSelectedImages = extractSelectedImageUrls(selectedProduct.selected_images);

    // 2. Raw sources images
    const rawOptions = Object.entries(sources).map(([sourceKey, sourcePayload]) => {
      const images = extractImageCandidatesFromSourcePayload(sourcePayload);
      return {
        key: sourceKey,
        label: formatPipelineSourceSlug(sourceKey),
        images,
      };
    }).filter(s => s.images.length > 0);

    return [
      ...(metadataSelectedImages.length > 0 ? [{ key: "metadata", label: "Current Storefront (Selected)", images: metadataSelectedImages }] : []),
      ...rawOptions,
    ];
  }, [selectedProduct]);

  // Determine which source currently matches selectedImages
  const currentImageSource = useMemo(() => {
    if (!selectedProduct || !formData.selectedImages) return "";

    const sortedSelected = [...formData.selectedImages].sort().join(",");

    for (const opt of imageSourceOptions) {
      const sortedOpt = [...opt.images].sort().join(",");
      if (sortedOpt === sortedSelected) {
        return opt.key;
      }
    }

    // Default to the source with the most images if not exactly matched
    let bestOptKey = "";
    let maxCount = -1;
    for (const opt of imageSourceOptions) {
      if (opt.images.length > maxCount) {
        maxCount = opt.images.length;
        bestOptKey = opt.key;
      }
    }
    return bestOptKey || imageSourceOptions[0]?.key || "";
  }, [formData.selectedImages, imageSourceOptions, selectedProduct]);

  // Determine active select dropdown value (preferring manual selection if set)
  const activeImageSource = useMemo(() => {
    if (!selectedUpc) return "";
    return selectedSourceByUpc[selectedUpc] || currentImageSource;
  }, [selectedUpc, selectedSourceByUpc, currentImageSource]);

  const selectOptions = useMemo(() => {
    return [...imageSourceOptions];
  }, [imageSourceOptions]);

  const handleImageSourceChange = (val: string) => {
    if (selectedUpc) {
      setSelectedSourceByUpc((prev) => ({ ...prev, [selectedUpc]: val }));
    }
    const matched = imageSourceOptions.find((opt) => opt.key === val);
    if (matched) {
      handleInputChange("selectedImages", matched.images);
      toast.success(`Imported images from ${matched.label}`);
    }
  };

  const updateDraftForUpc = useCallback(
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
  const hasPendingCopilotReview = false;

  const handleInputChange = useCallback(
    <K extends keyof FinalizationDraft>(
      field: K,
      value: FinalizationDraft[K],
    ) => {
      if (!selectedUpc) {
        return;
      }

      updateDraftForUpc(selectedUpc, (prev) => ({ ...prev, [field]: value }));
    },
    [selectedUpc, updateDraftForUpc],
  );

  const handleBrandChange = useCallback(
    (brandId: string, brandName: string) => {
      if (!selectedUpc) {
        return;
      }
      updateDraftForUpc(selectedUpc, (prev) => ({
        ...prev,
        brandId,
        brandName,
      }));
    },
    [selectedUpc, updateDraftForUpc],
  );

  const handleCreateBrand = async () => {
    if (!brandSearch.trim()) return;
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
    if (!selectedUpc) {
      return;
    }

    updateDraftForUpc(selectedUpc, (prev) => ({ ...prev, name: newName }));
  };



  const addCustomSource = () => {
    if (!selectedUpc) return;
    const url = formData.customSourceUrl.trim();
    if (!url) return;

    try {
      new URL(url);
    } catch {
      toast.error("Enter a valid URL");
      return;
    }

    const hostname = new URL(url).hostname.replace("www.", "");
    const sourceKey = `custom:${hostname}`;

    updateDraftForUpc(selectedUpc, (prev) => ({
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
    if (!selectedUpc) return;

    updateDraftForUpc(selectedUpc, (prev) => {
      return {
        ...prev,
        sources: deleteSourceFromRecord(prev.sources, sourceKey),
      };
    });
    const displayKey = sourceKey.startsWith("enriched:")
      ? sourceKey.replace("enriched:", "")
      : sourceKey;
    toast.success(`Removed source: ${formatPipelineSourceSlug(displayKey)}`);
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
      const targetUpcs = Array.from(
        new Set(upcs.filter((upc) => upc.trim().length > 0)),
      );

      if (targetUpcs.length === 0) {
        throw new Error("No products matched the requested scope.");
      }

      if (andPublish) {
        // Validate all target products first
        for (const upc of targetUpcs) {
          const draft = draftsRef.current[upc];
          if (draft) {
            const validationErrors: string[] = [];
            if (!draft.name?.trim()) {
              validationErrors.push("Product Name is required");
            }
            const priceNum = typeof draft.price === "number" ? draft.price : parseFloat(draft.price);
            if (isNaN(priceNum) || priceNum <= 0) {
              validationErrors.push("Price must be greater than $0.00");
            }
            if (!draft.brandId || draft.brandId === "none") {
              validationErrors.push("Brand selection is required");
            }
            if (!draft.category?.trim()) {
              validationErrors.push("Category classification is required");
            }
            if (!draft.selectedImages || draft.selectedImages.length === 0) {
              validationErrors.push("At least one image must be selected");
            }

            if (validationErrors.length > 0) {
              const errorMsg = `Cannot publish product ${upc}: ${validationErrors.join(", ")}.`;
              if (!silent) {
                toast.error(errorMsg);
              }
              throw new Error(errorMsg);
            }
          }
        }
        setPublishing(true);
      } else {
        setSaving(true);
      }

      try {
        const results = await runWithConcurrency(targetUpcs, 4, async (upc) => {
          const currentProduct = productsByUpcRef.current[upc];
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
        const failedUpcs = results
          .map((result, index) =>
            result.status === "rejected" ? targetUpcs[index] : null,
          )
          .filter((upc): upc is string => upc !== null);

        if (successful.length === 0 && failedUpcs.length > 0) {
          const firstFailure = results.find(
            (result): result is PromiseRejectedResult =>
              result.status === "rejected",
          );

          throw (
            firstFailure?.reason
            ?? new Error(`Failed to update ${failedUpcs.join(", ")}.`)
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

        if (failedUpcs.length > 0) {
          summary += ` ${failedUpcs.length} failed: ${failedUpcs.join(", ")}.`;
        }

        if (!silent) {
          if (failedUpcs.length > 0) {
            toast.error(summary);
          } else {
            toast.success(summary);
          }
        }

        return {
          summary,
          successfulUpcs: successful.map((result) => result.upc),
          failedUpcs,
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
      const currentUpc = selectedProductRef.current?.upc;
      if (!currentUpc) {
        throw new Error("Select a product before saving.");
      }

      return persistProducts({
        upcs: [currentUpc],
        andPublish,
        silent,
      });
    },
    [persistProducts],
  );

  const handleSelectProduct = useCallback(
    async (newUpc: string | null) => {
      if (newUpc === preferredUpc) return;

      if (isDirty && selectedUpc && !saving && !publishing) {
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
      setPreferredUpc(newUpc);
    },
    [isDirty, selectedUpc, preferredUpc, persistCurrentDraft, saving, publishing],
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
        void persistCurrentDraft();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void persistCurrentDraft({ andPublish: true });
        return;
      }

      if (isInput || sortedProducts.length === 0) return;

      // Arrow navigation is now handled by PipelineSidebarTable in the sidebar
      // to ensure consistency with sidebar navigation.
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    persistCurrentDraft,
  ]);

  const handleReject = async () => {
    if (!selectedUpc) return;
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
      const targetUpcs = Array.from(
        new Set(upcs.filter((upc) => upc.trim().length > 0)),
      );

      if (targetUpcs.length === 0) {
        throw new Error("No products matched the requested rejection scope.");
      }

      setRejecting(true);

      try {
        const res =
          targetUpcs.length === 1
            ? await adminFetch(`/api/admin/pipeline/${encodeURIComponent(targetUpcs[0])}`,
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
                  upcs: targetUpcs,
                  toStatus: "processed",
                }),
              });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Failed to reject product");
        }

        const summary =
          targetUpcs.length === 1
            ? "Moved the product back to the processed stage for additional review."
            : `Moved ${targetUpcs.length} products back to the processed stage for additional review.`;

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
      const currentUpc = selectedProductRef.current?.upc;
      if (!currentUpc) {
        throw new Error("Select a product before rejecting it.");
      }

      return rejectProducts({
        upcs: [currentUpc],
        silent,
      });
    },
    [rejectProducts],
  );

  const handleConfirmReject = async () => {
    if (!selectedUpc) return;
    setConfirmRejectOpen(false);
    try {
      await rejectCurrentProduct();
    } catch {
      // rejectCurrentProduct already surfaces the error consistently
    }
  };

  const resolveProductWorkspaceState = useCallback((upc?: string) => {
    const resolvedUpc = upc ?? selectedProductRef.current?.upc;
    if (!resolvedUpc) {
      throw new Error("Select a product or provide a UPC first.");
    }

    const product = productsByUpcRef.current[resolvedUpc];
    const draft = draftsRef.current[resolvedUpc];
    const savedDraft = savedDraftsRef.current[resolvedUpc];

    if (!product || !draft || !savedDraft) {
      throw new Error(`Product ${resolvedUpc} is not available in reviewing.`);
    }

    return {
      upc: resolvedUpc,
      product,
      draft,
      savedDraft,
    };
  }, []);

  const resolveScopeUpcs = useCallback(
    (scope: PreviewProductScopeInput["scope"]) => {
      const matchedUpcs = resolveFinalizationProductScope(
        sortedProducts,
        draftsRef.current,
        savedDraftsRef.current,
        selectedProductRef.current?.upc ?? null,
        scope,
      );

      if (matchedUpcs.length === 0) {
        throw new Error("No products matched the requested scope.");
      }

      return matchedUpcs;
    },
    [sortedProducts],
  );

  const buildScopeSummaries = useCallback((upcs: string[]) => {
    return upcs
      .map((upc) => {
        const product = productsByUpcRef.current[upc];
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
        selectedUpc,
        dirtyUpcs,
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
      selectedDraft: selectedUpc ? draftsRef.current[selectedUpc] ?? null : null,
      selectedSavedDraft: selectedUpc
        ? savedDraftsRef.current[selectedUpc] ?? null
        : null,
    };
  }, [dirtyUpcs, selectedUpc, sortedProducts.length]);

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
      const matchedUpcs = resolveScopeUpcs(scope);
      const products = buildScopeSummaries(matchedUpcs);

      return {
        summary: `Scope matches ${products.length} product${products.length === 1 ? "" : "s"}.`,
        matched: products.length,
        products,
      };
    },
    [buildScopeSummaries, resolveScopeUpcs],
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
      const currentUpc = selectedProductRef.current?.upc;
      if (!currentUpc) {
        throw new Error("Select a product before updating fields.");
      }

      const result = applySetProductFieldsToDraft(
        draftsRef.current[currentUpc] ?? EMPTY_FINALIZATION_DRAFT,
        input,
      );

      updateDraftForUpc(currentUpc, result.draft);

      return {
        summary: `Updated fields: ${result.updatedFields.join(", ")} on ${currentUpc}.`,
      };
    },
    [updateDraftForUpc],
  );

  const handleCopilotBulkSetProductFields = useCallback(
    async ({
      scope,
      changes,
    }: BulkSetProductFieldsInput): Promise<ToolSummary> => {
      const matchedUpcs = resolveScopeUpcs(scope);
      if (matchedUpcs.length > 1 && changes.name !== undefined) {
        throw new Error(
          "Bulk exact name replacement is blocked. Use the name-transform tool for prefix, suffix, or replace operations so existing names are preserved.",
        );
      }
      const updatedFields = new Set<string>();
      const nextDrafts = { ...draftsRef.current };

      matchedUpcs.forEach((upc) => {
        const result = applySetProductFieldsToDraft(
          nextDrafts[upc] ?? EMPTY_FINALIZATION_DRAFT,
          changes,
        );
        nextDrafts[upc] = result.draft;
        result.updatedFields.forEach((field) => updatedFields.add(field));
      });

      setDrafts(nextDrafts);

      return {
        summary: `Updated fields for ${matchedUpcs.length} product${
          matchedUpcs.length === 1 ? "" : "s"
        }: ${Array.from(updatedFields).join(", ")}.`,
      };
    },
    [resolveScopeUpcs, setDrafts],
  );

  const handleCopilotBulkTransformProductNames = useCallback(
    async ({
      scope,
      mode,
      value,
      find,
      skipIfContains,
    }: BulkTransformProductNamesInput): Promise<ToolSummary> => {
      const matchedUpcs = resolveScopeUpcs(scope);
      let changedCount = 0;
      const changedUpcs: string[] = [];
      const nextDrafts = { ...draftsRef.current };

      matchedUpcs.forEach((upc) => {
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
          changedUpcs.push(upc);
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

      return {
        summary: `Applied ${mode} name transform to ${changedCount} product${
          changedCount === 1 ? "" : "s"
        }.`,
      };
    },
    [resolveScopeUpcs, setDrafts],
  );

  const handleCopilotAssignBrand = useCallback(
    async ({ brandId, brandName }: AssignBrandInput): Promise<ToolSummary> => {
      const currentUpc = selectedProductRef.current?.upc;
      if (!currentUpc) {
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

      handleBrandChange(brandId, brandName);

      return {
        summary: brandId === "none"
          ? `Cleared brand assignment for ${currentUpc}.`
          : `Assigned brand ${brandName} to ${currentUpc}.`,
      };
    },
    [handleBrandChange],
  );

  const handleCopilotCreateBrand = useCallback(
    async ({ name }: CreateBrandInput): Promise<ToolSummary> => {
      const brand = await createBrandRecord(name);
      const currentUpc = selectedProductRef.current?.upc;
      if (!currentUpc) {
        throw new Error("Select a product before assigning a brand.");
      }
      handleBrandChange(brand.id, brand.name);

      return {
        summary: `Created and assigned brand ${brand.name} to ${currentUpc}.`,
      };
    },
    [createBrandRecord, handleBrandChange],
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

      const matchedUpcs = resolveScopeUpcs(scope);
      const nextDrafts = { ...draftsRef.current };
      matchedUpcs.forEach((upc) => {
        nextDrafts[upc] = {
          ...(nextDrafts[upc] ?? EMPTY_FINALIZATION_DRAFT),
          brandId,
          brandName,
        };
      });
      setDrafts(nextDrafts);

      return {
        summary: brandId === "none"
          ? `Cleared brand assignments for ${matchedUpcs.length} product${
              matchedUpcs.length === 1 ? "" : "s"
            }.`
          : `Assigned brand ${brandName} to ${matchedUpcs.length} product${
              matchedUpcs.length === 1 ? "" : "s"
            }.`,
      };
    },
    [resolveScopeUpcs, setDrafts],
  );

  const handleCopilotReplaceSelectedImages = useCallback(
    async ({ images }: ReplaceSelectedImagesInput): Promise<ToolSummary> => {
      const currentUpc = selectedProductRef.current?.upc;
      if (!currentUpc) {
        throw new Error("Select a product before updating images.");
      }
      const nextImages = normalizeSelectedImages(images);
      if (nextImages.length === 0) {
        throw new Error("Provide at least one valid image URL.");
      }

      updateDraftForUpc(currentUpc, (prev) => ({
        ...prev,
        selectedImages: nextImages,
      }));
      return {
        summary: `Replaced selected images with ${nextImages.length} images for ${currentUpc}.`,
      };
    },
    [normalizeSelectedImages, updateDraftForUpc],
  );

  const handleCopilotAddSelectedImages = useCallback(
    async ({ images }: AddSelectedImagesInput): Promise<ToolSummary> => {
      if (!selectedUpc) {
        throw new Error("Select a product before updating images.");
      }
      const nextImages = normalizeSelectedImages([
        ...(selectedUpc ? draftsRef.current[selectedUpc]?.selectedImages ?? [] : []),
        ...images,
      ]);
      updateDraftForUpc(selectedUpc, (prev) => ({
        ...prev,
        selectedImages: nextImages,
      }));

      return {
        summary: `Added ${normalizeSelectedImages(images).length} image${
          normalizeSelectedImages(images).length === 1 ? "" : "s"
        } to ${selectedUpc}.`,
      };
    },
    [normalizeSelectedImages, updateDraftForUpc, selectedUpc],
  );

  const handleCopilotRemoveSelectedImages = useCallback(
    async ({ images }: RemoveSelectedImagesInput): Promise<ToolSummary> => {
      if (!selectedUpc) {
        throw new Error("Select a product before updating images.");
      }
      const toRemove = new Set(normalizeSelectedImages(images));
      const nextImages = (
        selectedUpc ? draftsRef.current[selectedUpc]?.selectedImages ?? [] : []
      ).filter(
        (image) => !toRemove.has(image),
      );
      updateDraftForUpc(selectedUpc, (prev) => ({
        ...prev,
        selectedImages: nextImages,
      }));

      return {
        summary: `Removed ${toRemove.size} image${
          toRemove.size === 1 ? "" : "s"
        } from ${selectedUpc}.`,
      };
    },
    [normalizeSelectedImages, updateDraftForUpc, selectedUpc],
  );

  const handleCopilotAddSourceUrl = useCallback(
    async ({ url }: AddSourceUrlInput): Promise<ToolSummary> => {
      const currentUpc = selectedProductRef.current?.upc;
      if (!currentUpc) {
        throw new Error("Select a product before updating sources.");
      }

      let normalizedUrl: string;
      try {
        normalizedUrl = new URL(url).toString();
      } catch {
        throw new Error("Provide a valid source URL.");
      }

      const currentSources = draftsRef.current[currentUpc]?.sources ?? {};
      const existingSourceKey = Object.entries(currentSources).find(([, sourceData]) => {
        if (!sourceData || typeof sourceData !== "object" || Array.isArray(sourceData)) {
          return false;
        }

        return (sourceData as { url?: unknown }).url === normalizedUrl;
      })?.[0];

      if (existingSourceKey) {
        return {
          summary: `Source ${existingSourceKey} is already attached to ${currentUpc}.`,
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

      updateDraftForUpc(currentUpc, (prev) => ({
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

      return {
        summary: `Added source URL for ${currentUpc}: ${normalizedUrl}.`,
      };
    },
    [updateDraftForUpc],
  );

  const handleCopilotRemoveSource = useCallback(
    async ({ sourceKey }: RemoveSourceInput): Promise<ToolSummary> => {
      const currentUpc = selectedProductRef.current?.upc;
      if (!currentUpc) {
        throw new Error("Select a product before updating sources.");
      }

      const currentSources = draftsRef.current[currentUpc]?.sources ?? {};
      const normalizedSources = normalizeProductSourcesForReview(currentSources);
      if (!(sourceKey in normalizedSources)) {
        throw new Error(`Unknown source key: ${sourceKey}`);
      }

      updateDraftForUpc(currentUpc, (prev) => {
        return {
          ...prev,
          sources: deleteSourceFromRecord(prev.sources, sourceKey),
        };
      });

      return {
        summary: `Removed source ${sourceKey} for ${currentUpc}.`,
      };
    },
    [updateDraftForUpc],
  );

  const handleCopilotRestoreSavedDraft = useCallback(
    async (): Promise<ToolSummary> => {
      const currentUpc = selectedProductRef.current?.upc;
      if (!currentUpc) {
        throw new Error("Select a product before restoring its draft.");
      }

      updateDraftForUpc(
        currentUpc,
        savedDraftsRef.current[currentUpc] ?? EMPTY_FINALIZATION_DRAFT,
      );
      return {
        summary: `Restored last saved draft for ${currentUpc}.`,
      };
    },
    [updateDraftForUpc],
  );

  const handleCopilotSaveDraft = useCallback(
    async (): Promise<ToolSummary> => {
      return persistCurrentDraft({ silent: true });
    },
    [persistCurrentDraft],
  );

  const handleCopilotApproveProduct = useCallback(
    async (): Promise<ToolSummary> => {
      return persistCurrentDraft({ andPublish: true, silent: true });
    },
    [persistCurrentDraft],
  );

  const handleCopilotRejectProduct = useCallback(
    async (): Promise<ToolSummary> => {
      return rejectCurrentProduct({ silent: true });
    },
    [rejectCurrentProduct],
  );

  const handleCopilotSaveProducts = useCallback(
    async ({ scope }: ScopedProductActionInput): Promise<ToolSummary> => {
      return persistProducts({
        upcs: resolveScopeUpcs(scope),
        silent: true,
      });
    },
    [persistProducts, resolveScopeUpcs],
  );

  const handleCopilotApproveProducts = useCallback(
    async ({ scope }: ScopedProductActionInput): Promise<ToolSummary> => {
      return persistProducts({
        upcs: resolveScopeUpcs(scope),
        andPublish: true,
        silent: true,
      });
    },
    [persistProducts, resolveScopeUpcs],
  );

  const handleCopilotRejectProducts = useCallback(
    async ({ scope }: ScopedRejectProductInput): Promise<ToolSummary> => {
      return rejectProducts({
        upcs: resolveScopeUpcs(scope),
        silent: true,
      });
    },
    [rejectProducts, resolveScopeUpcs],
  );

  const renderCopilotPanel = () => (
    <ReviewingCopilotPanel
      selectedUpc={selectedUpc}
      workspaceProductCount={sortedProducts.length}
      dirtyProductCount={dirtyUpcs.length}
      getContext={getCopilotContext}
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
          selectedUpc={selectedUpc}
          onSelectProduct={handleSelectProduct}
          scrollContainerRef={scrollContainerRef}
          search={search}
          onSearchChange={onSearchChange}
          filters={filters}
          onFilterChange={onFilterChange}
          availableSources={availableSources}
          showSourceFilter={false}
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
                  selectedUpc={selectedUpc}
                  isDirty={isDirty}
                  hasPendingCopilotReview={hasPendingCopilotReview}
                  saving={saving}
                  publishing={publishing}
                  rejecting={rejecting}
                  onSave={() => {
                    void persistCurrentDraft();
                  }}
                  onPublish={() => {
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

            {/* Form Content */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 overflow-y-auto min-h-0 p-2 sm:p-3 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
                  <div className="space-y-2">
                    <ImageCarousel
                      selectedImages={formData.selectedImages}
                    />

                    {imageSourceOptions.length > 0 && (
                      <div className="flex flex-col gap-1.5 p-2 border border-border bg-muted/20">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Import Images from Source
                        </label>
                        <Select
                          value={activeImageSource}
                          onValueChange={handleImageSourceChange}
                        >
                          <SelectTrigger className="w-full h-8 text-xs font-semibold rounded-none border border-border bg-card">
                            <SelectValue placeholder="Choose image source..." />
                          </SelectTrigger>
                          <SelectContent className="rounded-none border border-border">
                            {selectOptions.map((opt) => (
                              <SelectItem key={opt.key} value={opt.key} className="rounded-none text-xs font-semibold">
                                {opt.label} ({opt.images.length} image{opt.images.length === 1 ? "" : "s"})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
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

                <div className="pt-4 space-y-2">
                  <PackagingEvidencePanel
                    upc={selectedUpc}
                    onTitleApplied={() => {
                      // Refresh the product data to pick up the new title
                      void persistCurrentDraft({ silent: true });
                    }}
                  />

                  <Separator className="bg-border" />
                  <details className="group overflow-hidden rounded-none border border-border">
                    <summary className="flex cursor-pointer items-center justify-between p-4 text-sm font-semibold text-muted-foreground hover:bg-muted/30 list-none">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        View Raw Source Data
                      </div>
                      <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="space-y-4 border-t border-border bg-muted/10 p-4">
                      {Object.entries(normalizeProductSourcesForReview(selectedProduct.sources || {})).map(
                        ([source, data]) => (
                          <div key={source} className="space-y-2">
                            <div className="text-xs font-semibold text-foreground">
                              {formatPipelineSourceSlug(source)}
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
