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
} from "lucide-react";
import { toast } from "sonner";
import type { PipelineProduct } from "@/lib/pipeline/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { SHOPSITE_PAGES } from "@/lib/shopsite/constants";
import {
  extractImageCandidatesFromSources,
  normalizeProductSources,
} from "@/lib/product-sources";
import {
  formatSourceLabel,
  isValidCustomImageUrl,
} from "./finalizing/finalizing-utils";
import type { ImageSourceOption } from "./finalizing/finalizing-utils";
import { ProductListSidebar } from "./finalizing/ProductListSidebar";
import { ImageCarousel } from "./finalizing/ImageCarousel";
import { ProductSaveActions } from "./finalizing/ProductSaveActions";
import { FinalizationCopilotPanel } from "./finalizing/FinalizationCopilotPanel";
import { ConfirmationDialog } from "@/components/admin/confirmation-dialog";
import {
  buildConsolidatedPayloadFromDraft,
  buildInitialFinalizationDraft,
  createPersistedFinalizationDraftSnapshot,
  EMPTY_FINALIZATION_DRAFT,
  FINALIZATION_STOCK_STATUS_VALUES,
  toFinalizationImageArray,
  type FinalizationCopilotContext,
  type FinalizationDraft,
} from "@/lib/pipeline/finalization-draft";
import type {
  AddSelectedImagesInput,
  AssignBrandInput,
  CreateBrandInput,
  RemoveSelectedImagesInput,
  RemoveStorePagesInput,
  ReplaceSelectedImagesInput,
  SetProductFieldsInput,
  SetStorePagesInput,
  ToolSummary,
} from "@/lib/tools/finalization-copilot";

interface FinalizingResultsViewProps {
  products: PipelineProduct[];
  onRefresh: (silent?: boolean) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  groupedProducts?: {
    groups: Record<string, PipelineProduct[]>;
    cohortIds: string[];
    names?: Record<string, string>;
  };
  cohortBrands?: Record<string, string>;
  onEditCohort?: (id: string, name: string | null, brandName: string | null) => void;
}

interface Brand {
  id: string;
  name: string;
  slug?: string | null;
}

export function FinalizingResultsView({
  products,
  onRefresh,
  search,
  onSearchChange,
  groupedProducts,
  cohortBrands = {},
  onEditCohort,
}: FinalizingResultsViewProps) {
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
  const [isDirty, setIsDirty] = useState(false);
  const [savedDraftState, setSavedDraftState] =
    useState<FinalizationDraft>(EMPTY_FINALIZATION_DRAFT);
  const savedDraftRef = useRef<FinalizationDraft>(EMPTY_FINALIZATION_DRAFT);
  const setSavedDraft = useCallback((value: SetStateAction<FinalizationDraft>) => {
    setSavedDraftState((prev) => {
      const next =
        typeof value === "function"
          ? (value as (previous: FinalizationDraft) => FinalizationDraft)(prev)
          : value;
      savedDraftRef.current = next;
      return next;
    });
  }, []);
  const savedDraft = savedDraftState;
  const [publishing, setPublishing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  const handleCreateBrand = async () => {
    if (!brandSearch.trim()) return;
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

  // Form state
  const [formDataState, setFormDataState] =
    useState<FinalizationDraft>(EMPTY_FINALIZATION_DRAFT);
  const formDataRef = useRef<FinalizationDraft>(EMPTY_FINALIZATION_DRAFT);
  const setFormData = useCallback(
    (value: SetStateAction<FinalizationDraft>) => {
      setFormDataState((prev) => {
        const next =
          typeof value === "function"
            ? (value as (previous: FinalizationDraft) => FinalizationDraft)(prev)
            : value;
        formDataRef.current = next;
        return next;
      });
    },
    [],
  );
  const formData = formDataState;
  const [selectedImageSourceId, setSelectedImageSourceId] = useState("");

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

  // Initialize form when selected product changes
  useEffect(() => {
    if (selectedProduct) {
      const initialDraft = buildInitialFinalizationDraft(selectedProduct);
      const persistedDraft =
        createPersistedFinalizationDraftSnapshot(initialDraft);

      setFormData(initialDraft);
      setSavedDraft(persistedDraft);
      setIsDirty(false);
      setSelectedImageSourceId("");
    }
  }, [selectedProduct, setFormData, setSavedDraft]);

  // Track dirtiness
  useEffect(() => {
    setIsDirty(JSON.stringify(formData) !== JSON.stringify(savedDraft));
  }, [formData, savedDraft]);

  const handleNameChange = (newName: string) => {
    setFormData((prev) => ({ ...prev, name: newName }));
  };

  // Scroll active item into view
  useEffect(() => {
    if (preferredSku && scrollContainerRef.current) {
      const activeElement = scrollContainerRef.current.querySelector(
        `[data-sku="${preferredSku}"]`,
      );
      if (activeElement) {
        activeElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [preferredSku]);

  const handleInputChange = useCallback(
    <K extends keyof FinalizationDraft>(
      field: K,
      value: FinalizationDraft[K],
    ) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    [setFormData],
  );

  const toggleImage = (url: string) => {
    setFormData((prev) => {
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
    if (!formData.customImageUrl.trim()) return;
    const url = formData.customImageUrl.trim();

    if (!isValidCustomImageUrl(url)) {
      toast.error("Enter a valid image URL");
      return;
    }

    if (!formData.selectedImages.includes(url)) {
      setFormData((prev) => ({
        ...prev,
        selectedImages: [...prev.selectedImages, url],
        customImageUrl: "",
      }));
    } else {
      setFormData((prev) => ({ ...prev, customImageUrl: "" }));
    }
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

  const persistCurrentDraft = useCallback(
    async ({
      andPublish = false,
      silent = false,
    }: {
      andPublish?: boolean;
      silent?: boolean;
    } = {}): Promise<ToolSummary> => {
      const currentProduct = selectedProductRef.current;
      if (!currentProduct?.sku) {
        throw new Error("Select a product before saving.");
      }

      const currentDraft = formDataRef.current;
      const persistedSnapshot =
        createPersistedFinalizationDraftSnapshot(currentDraft);
      const hasPersistableChanges =
        JSON.stringify(persistedSnapshot) !== JSON.stringify(savedDraftRef.current);

      if (!andPublish && !hasPersistableChanges) {
        return { summary: "Draft already matches the saved finalizing state." };
      }

      if (andPublish) {
        setPublishing(true);
      } else {
        setSaving(true);
      }

      try {
        if (hasPersistableChanges) {
          const patchRes = await fetch(
            `/api/admin/pipeline/${encodeURIComponent(currentProduct.sku)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                consolidated: buildConsolidatedPayloadFromDraft(currentDraft),
              }),
            },
          );

          if (!patchRes.ok) {
            const data = await patchRes.json().catch(() => null);
            throw new Error(data?.error || "Failed to save changes");
          }

          setSavedDraft(persistedSnapshot);
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

          if (!silent) {
            toast.success("Product moved to exporting");
          }
        } else if (!silent) {
          toast.success("Changes saved successfully");
        }

        onRefresh(!andPublish);

        return {
          summary: andPublish
            ? "Saved the draft and moved the product into exporting."
            : hasPersistableChanges
              ? "Saved the current draft changes."
              : "Draft was already up to date.",
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
    [onRefresh, setSavedDraft],
  );

  const handleSelectProduct = useCallback(
    async (newSku: string | null) => {
      if (newSku === preferredSku) return;

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
        void persistCurrentDraft();
        return;
      }

      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        activeElement?.tagName !== "TEXTAREA" &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        if (!isInput || activeElement?.id === "product-name") {
          e.preventDefault();
          void persistCurrentDraft({ andPublish: true });
          return;
        }
      }

      if (isInput || sortedProducts.length === 0) return;

      const currentIndex = sortedProducts.findIndex(
        (p) => p.sku === preferredSku,
      );

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = Math.min(currentIndex + 1, sortedProducts.length - 1);
        void handleSelectProduct(sortedProducts[nextIndex].sku);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const nextIndex = Math.max(currentIndex - 1, 0);
        void handleSelectProduct(sortedProducts[nextIndex].sku);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [persistCurrentDraft, preferredSku, sortedProducts, handleSelectProduct]);

  const handleReject = async () => {
    if (!selectedSku) return;
    setConfirmRejectOpen(true);
  };

  const rejectCurrentProduct = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}): Promise<ToolSummary> => {
      const currentProduct = selectedProductRef.current;
      if (!currentProduct?.sku) {
        throw new Error("Select a product before rejecting it.");
      }

      setRejecting(true);

      try {
        const res = await fetch(
          `/api/admin/pipeline/${encodeURIComponent(currentProduct.sku)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pipeline_status: "scraped" }),
          },
        );

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Failed to reject product");
        }

        if (!silent) {
          toast.success("Product rejected and sent back to scraped stage.");
        }

        onRefresh(false);

        return {
          summary:
            "Moved the product back to the scraped stage for additional review.",
        };
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

  const handleConfirmReject = async () => {
    if (!selectedSku) return;
    setConfirmRejectOpen(false);
    try {
      await rejectCurrentProduct();
    } catch {
      // rejectCurrentProduct already surfaces the error consistently
    }
  };

  const imageSourceOptions = useMemo<ImageSourceOption[]>(() => {
    if (!selectedProduct) return [];

    const sourceOptions: ImageSourceOption[] = [];

    const normalizedSources = normalizeProductSources(
      selectedProduct.sources || {},
    );
    Object.entries(normalizedSources).forEach(([sourceKey, sourcePayload]) => {
      const sourceCandidates = extractImageCandidatesFromSources(
        { [sourceKey]: sourcePayload },
        48,
      );
      if (sourceCandidates.length === 0) return;

      sourceOptions.push({
        id: `source:${sourceKey}`,
        label: formatSourceLabel(sourceKey),
        candidates: sourceCandidates,
      });
    });

    sourceOptions.sort((a, b) => a.label.localeCompare(b.label));

    return [
      ...sourceOptions,
      {
        id: "custom",
        label: "Custom Images",
        candidates: [],
      },
    ];
  }, [selectedProduct]);

  useEffect(() => {
    if (imageSourceOptions.length === 0) {
      setSelectedImageSourceId("");
      return;
    }

    const foundOption = imageSourceOptions.find(
      (option) => option.id === selectedImageSourceId,
    );
    if (!foundOption) {
      const preferredOption = imageSourceOptions
        .filter((option) => option.id !== "custom")
        .reduce((best, option) => {
          if (!best || option.candidates.length > best.candidates.length) {
            return option;
          }
          return best;
        }, imageSourceOptions[0]);

      setSelectedImageSourceId(preferredOption.id);
    }
  }, [imageSourceOptions, selectedImageSourceId]);

  const activeImageSourceOption = useMemo(
    () =>
      imageSourceOptions.find(
        (option) => option.id === selectedImageSourceId,
      ) ??
      imageSourceOptions[0] ??
      null,
    [imageSourceOptions, selectedImageSourceId],
  );

  // Filter out already-selected images from candidates to prevent duplication
  const imageCandidates = useMemo(() => {
    const candidates = activeImageSourceOption?.candidates ?? [];
    const selectedSet = new Set(formData.selectedImages);
    return candidates.filter((url) => !selectedSet.has(url));
  }, [activeImageSourceOption?.candidates, formData.selectedImages]);
  const isCustomImageSource = activeImageSourceOption?.id === "custom";

  const getCopilotContext = useCallback((): FinalizationCopilotContext | null => {
    const currentProduct = selectedProductRef.current;
    if (!currentProduct) {
      return null;
    }

    const input =
      currentProduct.input
      && typeof currentProduct.input === "object"
      && !Array.isArray(currentProduct.input)
        ? (currentProduct.input as Record<string, unknown>)
        : null;

    const consolidated =
      currentProduct.consolidated
      && typeof currentProduct.consolidated === "object"
      && !Array.isArray(currentProduct.consolidated)
        ? (currentProduct.consolidated as Record<string, unknown>)
        : null;

    return {
      product: {
        sku: currentProduct.sku,
        input,
        consolidated,
        sources: currentProduct.sources || {},
        selected_images: currentProduct.selected_images,
        confidence_score: currentProduct.confidence_score ?? null,
      },
      draft: formDataRef.current,
      savedDraft: savedDraftRef.current,
    };
  }, []);

  const handleCopilotSetProductFields = useCallback(
    async (input: SetProductFieldsInput): Promise<ToolSummary> => {
      const updatedFields: string[] = [];

      const next = { ...formDataRef.current };

      if (input.name !== undefined) {
        next.name = input.name.trim();
        updatedFields.push("name");
      }
      if (input.description !== undefined) {
        next.description = input.description.trim();
        updatedFields.push("description");
      }
      if (input.longDescription !== undefined) {
        next.longDescription = input.longDescription.trim();
        updatedFields.push("long description");
      }
      if (input.price !== undefined) {
        next.price = String(input.price);
        updatedFields.push("price");
      }
      if (input.weight !== undefined) {
        next.weight = input.weight.trim();
        updatedFields.push("weight");
      }
      if (input.stockStatus !== undefined) {
        next.stockStatus = input.stockStatus;
        updatedFields.push("stock status");
      }
      if (input.availability !== undefined) {
        next.availability = input.availability.trim();
        updatedFields.push("availability");
      }
      if (input.minimumQuantity !== undefined) {
        next.minimumQuantity = String(input.minimumQuantity);
        updatedFields.push("minimum quantity");
      }
      if (input.searchKeywords !== undefined) {
        next.searchKeywords = input.searchKeywords.trim();
        updatedFields.push("search keywords");
      }
      if (input.gtin !== undefined) {
        next.gtin = input.gtin.trim();
        updatedFields.push("GTIN");
      }
      if (input.isSpecialOrder !== undefined) {
        next.isSpecialOrder = input.isSpecialOrder;
        updatedFields.push("special order");
      }

      setFormData(next);

      return {
        summary: `Updated ${updatedFields.join(", ")}.`,
      };
    },
    [setFormData],
  );

  const handleCopilotAssignBrand = useCallback(
    async ({ brandId, brandName }: AssignBrandInput): Promise<ToolSummary> => {
      if (
        brandId !== "none"
        && !brandsRef.current.some((brand) => brand.id === brandId)
      ) {
        throw new Error(
          `Brand "${brandName}" is not available. Search for the brand first.`,
        );
      }

      handleInputChange("brandId", brandId);

      return {
        summary:
          brandId === "none"
            ? "Cleared the brand assignment."
            : `Assigned the brand to ${brandName}.`,
      };
    },
    [handleInputChange],
  );

  const handleCopilotCreateBrand = useCallback(
    async ({ name }: CreateBrandInput): Promise<ToolSummary> => {
      const brand = await createBrandRecord(name);
      handleInputChange("brandId", brand.id);

      return {
        summary: `Created and assigned the brand ${brand.name}.`,
      };
    },
    [createBrandRecord, handleInputChange],
  );

  const handleCopilotSetStorePages = useCallback(
    async ({ pages }: SetStorePagesInput): Promise<ToolSummary> => {
      const nextPages = normalizeStorePages(pages);
      if (nextPages.length === 0) {
        throw new Error("Provide at least one valid ShopSite page.");
      }

      handleInputChange("productOnPages", nextPages);
      return {
        summary: `Set ShopSite pages to ${nextPages.join(", ")}.`,
      };
    },
    [normalizeStorePages, handleInputChange],
  );

  const handleCopilotAddStorePages = useCallback(
    async ({ pages }: SetStorePagesInput): Promise<ToolSummary> => {
      const nextPages = normalizeStorePages([
        ...formDataRef.current.productOnPages,
        ...pages,
      ]);
      handleInputChange("productOnPages", nextPages);

      return {
        summary: `Added ShopSite pages: ${normalizeStorePages(pages).join(", ")}.`,
      };
    },
    [normalizeStorePages, handleInputChange],
  );

  const handleCopilotRemoveStorePages = useCallback(
    async ({ pages }: RemoveStorePagesInput): Promise<ToolSummary> => {
      const pagesToRemove = new Set(
        normalizeStorePages(pages).map((page) => page.trim()),
      );
      const nextPages = formDataRef.current.productOnPages.filter(
        (page) => !pagesToRemove.has(page),
      );
      handleInputChange("productOnPages", nextPages);

      return {
        summary: `Removed ShopSite pages: ${Array.from(pagesToRemove).join(", ")}.`,
      };
    },
    [normalizeStorePages, handleInputChange],
  );

  const handleCopilotReplaceSelectedImages = useCallback(
    async ({ images }: ReplaceSelectedImagesInput): Promise<ToolSummary> => {
      const nextImages = normalizeSelectedImages(images);
      if (nextImages.length === 0) {
        throw new Error("Provide at least one valid image URL.");
      }

      handleInputChange("selectedImages", nextImages);
      return {
        summary: `Replaced the selected image set with ${nextImages.length} images.`,
      };
    },
    [normalizeSelectedImages, handleInputChange],
  );

  const handleCopilotAddSelectedImages = useCallback(
    async ({ images }: AddSelectedImagesInput): Promise<ToolSummary> => {
      const nextImages = normalizeSelectedImages([
        ...formDataRef.current.selectedImages,
        ...images,
      ]);
      handleInputChange("selectedImages", nextImages);

      return {
        summary: `Added ${normalizeSelectedImages(images).length} images to the selection.`,
      };
    },
    [normalizeSelectedImages, handleInputChange],
  );

  const handleCopilotRemoveSelectedImages = useCallback(
    async ({ images }: RemoveSelectedImagesInput): Promise<ToolSummary> => {
      const toRemove = new Set(normalizeSelectedImages(images));
      const nextImages = formDataRef.current.selectedImages.filter(
        (image) => !toRemove.has(image),
      );
      handleInputChange("selectedImages", nextImages);

      return {
        summary: `Removed ${toRemove.size} images from the selection.`,
      };
    },
    [normalizeSelectedImages, handleInputChange],
  );

  const handleCopilotRestoreSavedDraft = useCallback(
    async (): Promise<ToolSummary> => {
      setFormData(savedDraftRef.current);
      return {
        summary: "Restored the draft to the last saved state.",
      };
    },
    [setFormData],
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

  return (
    <div className="flex h-full min-h-0 border rounded-lg overflow-hidden bg-background shadow-sm">
      {/* Left Column: Product List */}
      <ProductListSidebar
        products={sortedProducts}
        selectedSku={selectedSku}
        onSelectProduct={handleSelectProduct}
        scrollContainerRef={scrollContainerRef}
        search={search}
        onSearchChange={onSearchChange}
        groupedProducts={groupedProducts}
        cohortBrands={cohortBrands}
        onEditCohort={onEditCohort}
      />

      {/* Right Column: Editing Form */}
      <div className="flex-1 flex flex-col bg-background overflow-hidden">
        {selectedProduct ? (
          <>
            {/* Header */}
            <ProductSaveActions
              productName={formData.name}
              originalName={selectedProduct.input?.name || ""}
              productPrice={formData.price}
              selectedSku={selectedSku}
              isDirty={isDirty}
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
            />

            {/* Form Content */}
            <div className="flex-1 min-h-0 grid xl:grid-cols-[minmax(0,1fr)_24rem]">
              <div className="overflow-y-auto p-6 space-y-8">
                <div className="grid grid-cols-1 gap-8 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
                  <div className="space-y-6">
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Product Info
                      </h3>
                      <Separator />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="product-name">Product Name</Label>
                      <Input
                        id="product-name"
                        value={formData.name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        placeholder="e.g. Life Protection Formula Adult Chicken & Brown Rice Recipe 30 lb."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="product-description">Description</Label>
                      <Textarea
                        id="product-description"
                        value={formData.description}
                        onChange={(e) =>
                          handleInputChange("description", e.target.value)
                        }
                        placeholder="Short storefront description"
                        className="min-h-28"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="product-long-description">
                        Long Description
                      </Label>
                      <Textarea
                        id="product-long-description"
                        value={formData.longDescription}
                        onChange={(e) =>
                          handleInputChange("longDescription", e.target.value)
                        }
                        placeholder="Extended product copy, feeding notes, ingredients, or selling points"
                        className="min-h-40"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="product-price">Price</Label>
                        <Input
                          id="product-price"
                          type="number"
                          min="0"
                          step="0.01"
                          value={formData.price}
                          onChange={(e) =>
                            handleInputChange("price", e.target.value)
                          }
                          placeholder="e.g. 24.99"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="product-weight">Weight (lbs)</Label>
                        <Input
                          id="product-weight"
                          value={formData.weight}
                          onChange={(e) =>
                            handleInputChange("weight", e.target.value)
                          }
                          placeholder="e.g. 30"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 pt-4">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Merchandising
                      </h3>
                      <Separator />
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="product-brand">Brand</Label>
                        <Popover
                          open={brandPopoverOpen}
                          onOpenChange={setBrandPopoverOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              id="product-brand"
                              variant="outline"
                              role="combobox"
                              aria-expanded={brandPopoverOpen}
                              className="w-full justify-between font-normal"
                            >
                              {formData.brandId === "none"
                                ? "No Brand"
                                : brands.find((brand) => brand.id === formData.brandId)
                                    ?.name || "Select Brand"}
                              <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-[var(--radix-popover-trigger-width)] p-0"
                            align="start"
                          >
                            <div className="flex flex-col">
                              <div className="flex items-center border-b px-3 py-2">
                                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                                <input
                                  className="flex h-8 w-full rounded-md bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                  placeholder="Search brands..."
                                  value={brandSearch}
                                  onChange={(e) => setBrandSearch(e.target.value)}
                                />
                              </div>
                              <div className="max-h-[200px] overflow-y-auto p-1">
                                <button
                                  type="button"
                                  className={cn(
                                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                                    formData.brandId === "none"
                                      && "bg-accent text-accent-foreground",
                                  )}
                                  onClick={() => {
                                    handleInputChange("brandId", "none");
                                    setBrandPopoverOpen(false);
                                    setBrandSearch("");
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.brandId === "none"
                                        ? "opacity-100"
                                        : "opacity-0",
                                    )}
                                  />
                                  No Brand
                                </button>
                                {filteredBrands.map((brand) => (
                                  <button
                                    type="button"
                                    key={brand.id}
                                    className={cn(
                                      "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                                      formData.brandId === brand.id
                                        && "bg-accent text-accent-foreground",
                                    )}
                                    onClick={() => {
                                      handleInputChange("brandId", brand.id);
                                      setBrandPopoverOpen(false);
                                      setBrandSearch("");
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        formData.brandId === brand.id
                                          ? "opacity-100"
                                          : "opacity-0",
                                      )}
                                    />
                                    {brand.name}
                                  </button>
                                ))}
                                {filteredBrands.length === 0 && brandSearch && (
                                  <div className="p-2 text-xs text-muted-foreground italic">
                                    No brands found.
                                  </div>
                                )}
                              </div>
                              {brandSearch.trim()
                                && !brands.find(
                                  (brand) =>
                                    brand.name.toLowerCase()
                                    === brandSearch.toLowerCase().trim(),
                                ) && (
                                  <div className="border-t p-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="w-full justify-start text-xs font-normal"
                                      onClick={handleCreateBrand}
                                      disabled={creatingBrand}
                                    >
                                      <Plus className="mr-2 h-3 w-3" />
                                      {creatingBrand
                                        ? "Creating..."
                                        : `Create "${brandSearch.trim()}"`}
                                    </Button>
                                  </div>
                                )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="product-stock-status">Stock Status</Label>
                        <Select
                          value={formData.stockStatus}
                          onValueChange={(value) =>
                            handleInputChange(
                              "stockStatus",
                              value as (typeof FINALIZATION_STOCK_STATUS_VALUES)[number],
                            )
                          }
                        >
                          <SelectTrigger id="product-stock-status" className="w-full">
                            <SelectValue placeholder="Select stock status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="in_stock">In Stock</SelectItem>
                            <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                            <SelectItem value="pre_order">Pre-Order</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="product-availability">Availability Text</Label>
                        <Input
                          id="product-availability"
                          value={formData.availability}
                          onChange={(e) =>
                            handleInputChange("availability", e.target.value)
                          }
                          placeholder="e.g. usually ships in 24 hours"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="product-minimum-quantity">
                          Minimum Quantity
                        </Label>
                        <Input
                          id="product-minimum-quantity"
                          type="number"
                          min="0"
                          step="1"
                          value={formData.minimumQuantity}
                          onChange={(e) =>
                            handleInputChange("minimumQuantity", e.target.value)
                          }
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="product-gtin">GTIN / UPC</Label>
                        <Input
                          id="product-gtin"
                          value={formData.gtin}
                          onChange={(e) =>
                            handleInputChange("gtin", e.target.value)
                          }
                          placeholder="Barcode"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="product-search-keywords">
                          Search Keywords
                        </Label>
                        <Input
                          id="product-search-keywords"
                          value={formData.searchKeywords}
                          onChange={(e) =>
                            handleInputChange("searchKeywords", e.target.value)
                          }
                          placeholder="comma-separated terms"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 pt-4">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Classification
                      </h3>
                      <Separator />
                    </div>

                    <div className="space-y-2">
                      <Label>Store Pages</Label>
                      <Popover
                        open={pagePopoverOpen}
                        onOpenChange={setPagePopoverOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={pagePopoverOpen}
                            className="h-auto min-h-[40px] w-full justify-between font-normal"
                          >
                            <div className="flex flex-wrap gap-1">
                              {formData.productOnPages.length > 0 ? (
                                formData.productOnPages.map((page) => (
                                  <div
                                    key={page}
                                    className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
                                  >
                                    {page}
                                    <X
                                      className="h-2 w-2 cursor-pointer hover:text-destructive"
                                      onPointerDown={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                      }}
                                      onMouseDown={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleInputChange(
                                          "productOnPages",
                                          normalizeStorePages(
                                            formData.productOnPages.filter(
                                              (entry) => entry !== page,
                                            ),
                                          ),
                                        );
                                      }}
                                    />
                                  </div>
                                ))
                              ) : (
                                <span className="text-muted-foreground">
                                  Select Store Pages
                                </span>
                              )}
                            </div>
                            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[var(--radix-popover-trigger-width)] p-0"
                          align="start"
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center border-b px-3 py-2">
                              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                              <input
                                className="flex h-8 w-full rounded-md bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="Search pages..."
                                value={pageSearch}
                                onChange={(e) => setPageSearch(e.target.value)}
                              />
                            </div>
                            <div className="max-h-[300px] overflow-y-auto p-1">
                              {filteredPages.map((page) => {
                                const isSelected =
                                  formData.productOnPages.includes(page);
                                return (
                                  <button
                                    type="button"
                                    key={page}
                                    className={cn(
                                      "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                                      isSelected
                                        && "bg-accent text-accent-foreground",
                                    )}
                                    onClick={() => {
                                      const pages = isSelected
                                        ? formData.productOnPages.filter(
                                            (entry) => entry !== page,
                                          )
                                        : [...formData.productOnPages, page];
                                      handleInputChange(
                                        "productOnPages",
                                        normalizeStorePages(pages),
                                      );
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        isSelected ? "opacity-100" : "opacity-0",
                                      )}
                                    />
                                    {page}
                                  </button>
                                );
                              })}
                              {filteredPages.length === 0 && (
                                <div className="p-2 text-center text-xs italic text-muted-foreground">
                                  No pages found.
                                </div>
                              )}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-1 pt-4">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Settings
                      </h3>
                      <Separator />
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="is-special-order"
                        checked={formData.isSpecialOrder}
                        onCheckedChange={(checked) =>
                          handleInputChange("isSpecialOrder", !!checked)
                        }
                      />
                      <Label
                        htmlFor="is-special-order"
                        className="cursor-pointer"
                      >
                        Special Order
                      </Label>
                    </div>
                  </div>

                  <ImageCarousel
                    selectedImages={formData.selectedImages}
                    onToggleImage={toggleImage}
                    imageSourceOptions={imageSourceOptions}
                    selectedImageSourceId={selectedImageSourceId}
                    onSelectImageSource={setSelectedImageSourceId}
                    isCustomImageSource={isCustomImageSource}
                    customImageUrl={formData.customImageUrl}
                    onCustomImageUrlChange={(value) =>
                      handleInputChange("customImageUrl", value)
                    }
                    onAddCustomImage={addCustomImage}
                    imageCandidates={imageCandidates}
                    activeSourceLabel={activeImageSourceOption?.label ?? "Image"}
                  />
                </div>

                <div className="pt-8">
                  <Separator className="mb-8" />
                  <details className="group overflow-hidden rounded-xl border">
                    <summary className="flex cursor-pointer items-center justify-between p-4 text-sm font-bold uppercase tracking-wider text-muted-foreground hover:bg-muted/30 list-none">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        View Raw Scraped Data
                      </div>
                      <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="space-y-4 border-t bg-muted/20 p-4">
                      {Object.entries(selectedProduct.sources || {}).map(
                        ([source, data]) => (
                          <div key={source} className="space-y-2">
                            <div className="text-xs font-bold uppercase text-primary">
                              {source}
                            </div>
                            <pre className="overflow-x-auto rounded border bg-card p-3 text-[10px]">
                              {JSON.stringify(data, null, 2)}
                            </pre>
                          </div>
                        ),
                      )}
                    </div>
                  </details>
                </div>
              </div>

              <div className="border-t xl:border-t-0 xl:border-l">
                <FinalizationCopilotPanel
                  key={selectedSku ?? "finalization-copilot-empty"}
                  productSku={selectedSku}
                  getContext={getCopilotContext}
                  onSetProductFields={handleCopilotSetProductFields}
                  onAssignBrand={handleCopilotAssignBrand}
                  onCreateBrand={handleCopilotCreateBrand}
                  onSetStorePages={handleCopilotSetStorePages}
                  onAddStorePages={handleCopilotAddStorePages}
                  onRemoveStorePages={handleCopilotRemoveStorePages}
                  onReplaceSelectedImages={handleCopilotReplaceSelectedImages}
                  onAddSelectedImages={handleCopilotAddSelectedImages}
                  onRemoveSelectedImages={handleCopilotRemoveSelectedImages}
                  onRestoreSavedDraft={handleCopilotRestoreSavedDraft}
                  onSaveDraft={handleCopilotSaveDraft}
                  onApproveProduct={handleCopilotApproveProduct}
                  onRejectProduct={handleCopilotRejectProduct}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <Package className="h-16 w-16 mb-4 opacity-10" />
            <h3 className="text-xl font-medium">Select a product to review</h3>
            <p>
              Products here have been consolidated by AI and are ready for your
              final check.
            </p>
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={confirmRejectOpen}
        onOpenChange={setConfirmRejectOpen}
        onConfirm={handleConfirmReject}
        title="Reject Product"
        description="Are you sure you want to reject this product and send it back to the scraped stage? This will not clear your edits, but the product will move back to the manual review pipeline."
        confirmLabel="Reject"
      />
    </div>
  );
}
