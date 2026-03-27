"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import {
  Package,
  Image as ImageIcon,
  Save,
  CheckCircle,
  Plus,
  X,
  ChevronRight,
  Search,
  Check,
  RotateCcw,
  Maximize2,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import type { PipelineProduct } from "@/lib/pipeline/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { SHOPSITE_PAGES } from "@/lib/shopsite/constants";
import {
  extractImageCandidatesFromSources,
  normalizeProductSources,
  normalizeImageUrl,
} from "@/lib/product-sources";

interface FinalizingResultsViewProps {
  products: PipelineProduct[];
  onRefresh: (silent?: boolean) => void;
}

interface Brand {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface ImageSourceOption {
  id: string;
  label: string;
  candidates: string[];
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const urls = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((url) => normalizeImageUrl(url))
    .filter((url) => url.length > 0);

  return Array.from(new Set(urls));
}

function extractSelectedImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const urls = value
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && "url" in entry) {
        const url = (entry as { url?: unknown }).url;
        return typeof url === "string" ? url : null;
      }
      return null;
    })
    .filter((url): url is string => typeof url === "string")
    .map((url) => normalizeImageUrl(url))
    .filter((url) => url.length > 0);

  return Array.from(new Set(urls));
}

function formatSourceLabel(sourceKey: string): string {
  return sourceKey
    .replace(/^source:/i, "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isValidCustomImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;

  if (/^data:image\//i.test(trimmed)) return true;
  if (trimmed.startsWith("/")) return true;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return false;
  } catch {
    return false;
  }

  if (/\.(png|jpe?g|webp|gif|bmp|svg)(\?|#|$)/i.test(trimmed)) {
    return true;
  }

  return /(?:image|img|photo|picture|thumbnail|cdn)/i.test(trimmed);
}

export function FinalizingResultsView({
  products,
  onRefresh,
}: FinalizingResultsViewProps) {
  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => a.sku.localeCompare(b.sku));
  }, [products]);

  const [preferredSku, setPreferredSku] = useState<string | null>(
    sortedProducts.length > 0 ? sortedProducts[0].sku : null,
  );

  // track previous products to detect when a product is removed (published/rejected)
  const prevProductsRef = useRef<PipelineProduct[]>(sortedProducts);

  // Carousel state
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Brand state
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandSearch, setBrandSearch] = useState("");
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [brandPopoverOpen, setBrandPopoverOpen] = useState(false);

  // Category state
  const [categories, setCategories] = useState<Category[]>([]);
  const [categorySearch, setCategorySearch] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);

  // Store Pages (Product Pages) state
  const [pageSearch, setPageSearch] = useState("");
  const [pagePopoverOpen, setPagePopoverOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedData, setLastSavedData] = useState<string>("");
  const [publishing, setPublishing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const filteredBrands = useMemo(() => {
    if (!brandSearch.trim()) return brands;
    const search = brandSearch.toLowerCase();
    return brands.filter((b) => b.name.toLowerCase().includes(search));
  }, [brands, brandSearch]);

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    const search = categorySearch.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(search));
  }, [categories, categorySearch]);

  const filteredPages = useMemo(() => {
    if (!pageSearch.trim()) return SHOPSITE_PAGES;
    const search = pageSearch.toLowerCase();
    return SHOPSITE_PAGES.filter((p) => p.toLowerCase().includes(search));
  }, [pageSearch]);

  const handleCreateBrand = async () => {
    if (!brandSearch.trim()) return;
    setCreatingBrand(true);
    try {
      const res = await fetch("/api/admin/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: brandSearch.trim() }),
      });
      if (res.ok) {
        const { brand } = await res.json();
        setBrands((prev) =>
          [...prev, brand].sort((a, b) => a.name.localeCompare(b.name)),
        );
        handleInputChange("brandId", brand.id);
        setBrandSearch("");
        setBrandPopoverOpen(false);
        toast.success(`Brand "${brand.name}" created`);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create brand");
      }
    } catch {
      toast.error("An error occurred while creating brand");
    } finally {
      setCreatingBrand(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!categorySearch.trim()) return;
    setCreatingCategory(true);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: categorySearch.trim() }),
      });
      if (res.ok) {
        const { category } = await res.json();
        setCategories((prev) =>
          [...prev, category].sort((a, b) => a.name.localeCompare(b.name)),
        );
        handleInputChange("category", [...formData.category, category.name]);
        setCategorySearch("");
        setCategoryPopoverOpen(false);
        toast.success(`Category "${category.name}" created`);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create category");
      }
    } catch {
      toast.error("An error occurred while creating category");
    } finally {
      setCreatingCategory(false);
    }
  };

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    longDescription: "",
    price: "",
    weight: "",
    brandId: "none",
    category: [] as string[],
    productType: "",
    stockStatus: "in_stock",
    productOnPages: [] as string[],
    isFeatured: false,
    isSpecialOrder: false,
    customImageUrl: "",
    selectedImages: [] as string[],
  });
  const [selectedImageSourceId, setSelectedImageSourceId] = useState("");

  // Track carousel index
  useEffect(() => {
    if (!carouselApi) return;

    setCurrentImageIndex(carouselApi.selectedScrollSnap());

    carouselApi.on("select", () => {
      setCurrentImageIndex(carouselApi.selectedScrollSnap());
    });
  }, [carouselApi]);

  const selectedProduct = useMemo(
    () =>
      sortedProducts.find((product) => product.sku === preferredSku) ??
      sortedProducts[0] ??
      null,
    [preferredSku, sortedProducts],
  );

  const selectedSku = selectedProduct?.sku ?? null;

  // Intelligent selection: When products change, if the current selection is gone,
  // select the next product that was after it.
  useEffect(() => {
    const prevProducts = prevProductsRef.current;
    if (prevProducts !== sortedProducts) {
      const currentExists = sortedProducts.some((p) => p.sku === preferredSku);
      if (!currentExists && preferredSku) {
        // Current SKU was removed (published or rejected).
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

  // Fetch brands and categories
  useEffect(() => {
    async function fetchData() {
      try {
        const [brandsRes, categoriesRes] = await Promise.all([
          fetch("/api/admin/brands"),
          fetch("/api/admin/categories"),
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
  }, []);

  // Initialize form when selected product changes
  useEffect(() => {
    if (selectedProduct) {
      const consolidated = selectedProduct.consolidated || {};
      const input = selectedProduct.input || {};

      const cons =
        selectedProduct.consolidated || ({} as Record<string, unknown>);
      const consolidatedImages = toStringArray(consolidated.images);
      const selectedImagesFromMetadata = extractSelectedImageUrls(
        selectedProduct.selected_images,
      );
      const initialSelectedImages = Array.from(
        new Set(
          consolidatedImages.length > 0
            ? consolidatedImages
            : selectedImagesFromMetadata,
        ),
      );

      const name = consolidated.name || input.name || "";

      const initialData = {
        name,
        description: consolidated.description || name,
        longDescription:
          ((cons as Record<string, unknown>).long_description as string) ||
          name,
        price: String(consolidated.price ?? input.price ?? ""),
        weight: ((cons as Record<string, unknown>).weight as string) || "",
        brandId: consolidated.brand_id || "none",
        category: Array.isArray((cons as Record<string, unknown>).category)
          ? ((cons as Record<string, unknown>).category as string[])
          : typeof (cons as Record<string, unknown>).category === "string" &&
              (cons as Record<string, unknown>).category
            ? ((cons as Record<string, unknown>).category as string)
                .split("|")
                .map((c) => c.trim())
                .filter(Boolean)
            : [],
        productType:
          ((cons as Record<string, unknown>).product_type as string) || "",
        stockStatus:
          ((consolidated as Record<string, unknown>).stock_status as string) ||
          "in_stock",
        productOnPages: Array.isArray(
          (cons as Record<string, unknown>).product_on_pages,
        )
          ? ((cons as Record<string, unknown>).product_on_pages as string[])
          : typeof (cons as Record<string, unknown>).product_on_pages ===
              "string"
            ? ((cons as Record<string, unknown>).product_on_pages as string)
                .split("|")
                .filter(Boolean)
            : [],
        isFeatured: consolidated.is_featured || false,
        isSpecialOrder: !!(cons as Record<string, unknown>).is_special_order,
        customImageUrl: "",
        selectedImages: initialSelectedImages,
      };

      setFormData(initialData);
      setLastSavedData(JSON.stringify(initialData));
      setIsDirty(false);
      setSelectedImageSourceId("");
    }
  }, [selectedProduct]);

  // Track dirtiness
  useEffect(() => {
    const currentData = JSON.stringify(formData);
    setIsDirty(currentData !== lastSavedData);
  }, [formData, lastSavedData]);

  // Handle name change and auto-populate descriptions if they match name
  const handleNameChange = (newName: string) => {
    setFormData((prev) => {
      const updates: Partial<typeof prev> = { name: newName };
      // If description was empty or matched previous name, update it
      if (!prev.description || prev.description === prev.name) {
        updates.description = newName;
      }
      // If long description was empty or matched previous name, update it
      if (!prev.longDescription || prev.longDescription === prev.name) {
        updates.longDescription = newName;
      }
      return { ...prev, ...updates };
    });
  };

  // Keyboard navigation and shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInput =
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA" ||
        activeElement?.getAttribute("contenteditable") === "true";

      // Ctrl+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave(false);
        return;
      }

      // Enter to finalize (only if not in a textarea)
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        activeElement?.tagName !== "TEXTAREA" &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        // Only if we are not in an input that handles Enter differently
        if (!isInput || activeElement?.id === "product-name") {
          e.preventDefault();
          handleSave(true);
          return;
        }
      }

      if (isInput) return;

      if (sortedProducts.length === 0) return;

      const currentIndex = sortedProducts.findIndex(
        (p) => p.sku === preferredSku,
      );

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = Math.min(currentIndex + 1, sortedProducts.length - 1);
        setPreferredSku(sortedProducts[nextIndex].sku);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const nextIndex = Math.max(currentIndex - 1, 0);
        setPreferredSku(sortedProducts[nextIndex].sku);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [preferredSku, sortedProducts, isDirty, formData]);

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

  const handleInputChange = (
    field: string,
    value: string | boolean | string[],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

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

  const handleSave = async (andPublish = false, silent = false) => {
    if (!selectedSku) return;

    const isSaveAction = !andPublish;
    if (isSaveAction && !silent) setSaving(true);
    else if (andPublish) setPublishing(true);

    try {
      const consolidated = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        long_description: formData.longDescription.trim(),
        price: parseFloat(formData.price) || 0,
        brand_id: formData.brandId === "none" ? null : formData.brandId,
        stock_status: formData.stockStatus,
        is_featured: formData.isFeatured,
        is_special_order: formData.isSpecialOrder,
        weight: formData.weight.trim() || null,
        category: formData.category,
        product_type: formData.productType.trim() || null,
        product_on_pages: formData.productOnPages,
        images: formData.selectedImages,
      };

      // 1. Save changes to ingestion table
      const patchRes = await fetch(
        `/api/admin/pipeline/${encodeURIComponent(selectedSku)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consolidated }),
        },
      );

      if (!patchRes.ok) {
        const data = await patchRes.json();
        throw new Error(data.error || "Failed to save changes");
      }

      setLastSavedData(JSON.stringify(formData));
      setIsDirty(false);

      if (andPublish) {
        // 2. Trigger publishing to storefront
        const publishRes = await fetch(`/api/admin/pipeline/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sku: selectedSku }),
        });

        if (!publishRes.ok) {
          const data = await publishRes.json();
          throw new Error(data.error || "Failed to publish to storefront");
        }

        // 3. Update status to 'published'
        const statusRes = await fetch(
          `/api/admin/pipeline/${encodeURIComponent(selectedSku)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pipeline_status: "published" }),
          },
        );

        if (!statusRes.ok) {
          console.warn(
            "Product published but failed to update pipeline status",
          );
        }

        toast.success(
          selectedProduct?.pipeline_status === "published"
            ? "Published product updated successfully!"
            : "Product finalized and published to website!",
        );
      } else if (!silent) {
        toast.success("Changes saved successfully");
      }

      // If we published, we need to refresh (silent refresh if possible)
      // If we just saved, we can silent refresh to update the parent's data
      onRefresh(isSaveAction); 
    } catch (err) {
      if (!silent) {
        toast.error(err instanceof Error ? err.message : "An error occurred");
      }
    } finally {
      setSaving(false);
      setPublishing(false);
    }
  };

  // Debounced auto-save
  useEffect(() => {
    if (!isDirty || !selectedSku || saving || publishing) return;

    const timer = setTimeout(() => {
      handleSave(false, true);
    }, 2000); // Auto-save after 2 seconds of inactivity

    return () => clearTimeout(timer);
  }, [formData, isDirty, selectedSku]);

  const handleReject = async () => {
    if (!selectedSku) return;

    const confirmed = window.confirm(
      "Are you sure you want to reject this product and send it back to the scraped stage? This will not clear your edits, but the product will move back to the manual review pipeline.",
    );
    if (!confirmed) return;

    setRejecting(true);
    try {
      const res = await fetch(
        `/api/admin/pipeline/${encodeURIComponent(selectedSku)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pipeline_status: "scraped" }),
        },
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reject product");
      }

      toast.success("Product rejected and sent back to scraped stage.");
      onRefresh(false); // full refresh for reject as it moves out
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setRejecting(false);
    }
  };

  const imageSourceOptions = useMemo<ImageSourceOption[]>(() => {
    if (!selectedProduct) return [];

    const sourceOptions: ImageSourceOption[] = [];
    let savedCandidatesOption: ImageSourceOption | null = null;

    const pipelineCandidates = toStringArray(selectedProduct.image_candidates);
    if (pipelineCandidates.length > 0) {
      savedCandidatesOption = {
        id: "saved",
        label: "Saved Candidates",
        candidates: pipelineCandidates,
      };
    }

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
      ...(savedCandidatesOption ? [savedCandidatesOption] : []),
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

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-0 border rounded-lg overflow-hidden bg-background shadow-sm">
      {/* Left Column: Product List */}
      <div className="w-1/3 border-r flex flex-col min-w-[320px] bg-muted/5 overflow-hidden">
        <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
          <div className="divide-y">
            {sortedProducts.map((product) => {
              const name =
                product.consolidated?.name || product.input?.name || "Unknown";
              const price = product.consolidated?.price ?? product.input?.price;
              const isSelected = selectedSku === product.sku;

              return (
                <div
                  key={product.sku}
                  data-sku={product.sku}
                  className={`group p-3 cursor-pointer hover:bg-muted/50 transition-colors relative ${
                    isSelected
                      ? "bg-primary/5 shadow-[inset_3px_0_0_0_#008850]"
                      : ""
                  }`}
                  onClick={() => setPreferredSku(product.sku)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <div className="font-mono text-[10px] text-muted-foreground truncate flex-1 uppercase tracking-tight">
                          {product.sku}
                        </div>
                        {price !== undefined && (
                          <div className="text-sm font-bold text-primary">
                            ${Number(price).toFixed(2)}
                          </div>
                        )}
                      </div>
                      <div
                        className={`text-sm font-medium line-clamp-2 mt-0.5 ${isSelected ? "text-primary" : ""}`}
                      >
                        {name}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Column: Editing Form */}
      <div className="flex-1 flex flex-col bg-background overflow-hidden">
        {selectedProduct ? (
          <>
            {/* Header */}
            <div className="p-4 border-b flex justify-between items-center bg-card flex-shrink-0 z-10">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-muted-foreground" />
                <div>
                  <h2 className="text-lg font-bold tracking-tight line-clamp-1">
                    {formData.name || "Untitled Product"}
                  </h2>
                  <div className="text-xs text-muted-foreground font-mono">
                    {selectedSku}
                  </div>
                </div>
                {isDirty && (
                  <Badge variant="outline" className="ml-2 h-5 text-[10px] font-normal border-amber-200 bg-amber-50 text-amber-700 animate-pulse">
                    Unsaved Changes
                  </Badge>
                )}
                {saving && (
                  <Badge variant="outline" className="ml-2 h-5 text-[10px] font-normal border-primary/20 bg-primary/5 text-primary">
                    Saving...
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReject}
                  disabled={saving || publishing || rejecting}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                >
                  {rejecting ? (
                    "Rejecting..."
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4 mr-2" /> Reject to Scraped
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSave(false)}
                  disabled={saving || publishing}
                >
                  {saving ? (
                    "Saving..."
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" /> Save
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  className="bg-[#008850] hover:bg-[#008850]/90"
                  onClick={() => handleSave(true)}
                  disabled={saving || publishing}
                >
                  {publishing ? (
                    "Publishing..."
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      {selectedProduct?.pipeline_status === "published"
                        ? "Update Published Product"
                        : "Finalize & Publish"}
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Form Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Core Details */}
                <div className="space-y-6">
                  {/* Product Info Group */}
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

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="product-price">Price ($)</Label>
                      <Input
                        id="product-price"
                        type="number"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) =>
                          handleInputChange("price", e.target.value)
                        }
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="product-weight">Weight</Label>
                      <Input
                        id="product-weight"
                        value={formData.weight}
                        onChange={(e) =>
                          handleInputChange("weight", e.target.value)
                        }
                        placeholder="e.g. 30"
                      />
                    </div>
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
                              : brands.find((b) => b.id === formData.brandId)
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
                              <div
                                className={cn(
                                  "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                                  formData.brandId === "none" &&
                                    "bg-accent text-accent-foreground",
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
                              </div>
                              {filteredBrands.map((brand) => (
                                <div
                                  key={brand.id}
                                  className={cn(
                                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                                    formData.brandId === brand.id &&
                                      "bg-accent text-accent-foreground",
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
                                </div>
                              ))}
                              {filteredBrands.length === 0 && brandSearch && (
                                <div className="p-2 text-xs text-muted-foreground italic">
                                  No brands found.
                                </div>
                              )}
                            </div>
                            {brandSearch.trim() &&
                              !brands.find(
                                (b) =>
                                  b.name.toLowerCase() ===
                                  brandSearch.toLowerCase().trim(),
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
                  </div>

                  {/* Descriptions Group */}
                  <div className="space-y-1 pt-4">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Descriptions
                    </h3>
                    <Separator />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="product-description">
                      Short Description{" "}
                      <span className="text-muted-foreground font-normal">
                        (listing page)
                      </span>
                    </Label>
                    <Textarea
                      id="product-description"
                      value={formData.description}
                      onChange={(e) =>
                        handleInputChange("description", e.target.value)
                      }
                      placeholder="1-2 concise sentences for category/listing pages..."
                      className="min-h-[100px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="product-long-description">
                      Long Description{" "}
                      <span className="text-muted-foreground font-normal">
                        (detail page)
                      </span>
                    </Label>
                    <Textarea
                      id="product-long-description"
                      value={formData.longDescription}
                      onChange={(e) =>
                        handleInputChange("longDescription", e.target.value)
                      }
                      placeholder="3-5 detailed sentences for the product detail page..."
                      className="min-h-[200px]"
                    />
                  </div>

                  {/* Classification Group */}
                  <div className="space-y-1 pt-4">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Classification
                    </h3>
                    <Separator />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="product-category">Category</Label>
                      <Popover
                        open={categoryPopoverOpen}
                        onOpenChange={setCategoryPopoverOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            id="product-category"
                            variant="outline"
                            role="combobox"
                            aria-expanded={categoryPopoverOpen}
                            className="w-full justify-between font-normal"
                          >
                            <div className="flex flex-wrap gap-1">
                              {formData.category.length > 0 ? (
                                formData.category.map((cat) => (
                                  <div
                                    key={cat}
                                    className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1"
                                  >
                                    {cat}
                                    <X
                                      className="h-2 w-2 cursor-pointer hover:text-destructive"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const cats = formData.category.filter(
                                          (c) => c !== cat,
                                        );
                                        handleInputChange("category", cats);
                                      }}
                                    />
                                  </div>
                                ))
                              ) : (
                                <span className="text-muted-foreground">
                                  Select Categories
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
                                placeholder="Search categories..."
                                value={categorySearch}
                                onChange={(e) =>
                                  setCategorySearch(e.target.value)
                                }
                              />
                            </div>
                            <div className="max-h-[200px] overflow-y-auto p-1">
                              <div
                                className={cn(
                                  "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                                  !formData.category &&
                                    "bg-accent text-accent-foreground",
                                )}
                                onClick={() => {
                                  handleInputChange("category", "");
                                  setCategoryPopoverOpen(false);
                                  setCategorySearch("");
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    !formData.category
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                No Category
                              </div>
                              {filteredCategories.map((cat) => {
                                const isSelected = formData.category.includes(
                                  cat.name,
                                );
                                return (
                                  <div
                                    key={cat.id}
                                    className={cn(
                                      "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                                      isSelected &&
                                        "bg-accent text-accent-foreground",
                                    )}
                                    onClick={() => {
                                      const cats = isSelected
                                        ? formData.category.filter(
                                            (c) => c !== cat.name,
                                          )
                                        : [...formData.category, cat.name];
                                      handleInputChange("category", cats);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        isSelected
                                          ? "opacity-100"
                                          : "opacity-0",
                                      )}
                                    />
                                    {cat.name}
                                  </div>
                                );
                              })}
                              {filteredCategories.length === 0 &&
                                categorySearch && (
                                  <div className="p-2 text-xs text-muted-foreground italic">
                                    No categories found.
                                  </div>
                                )}
                            </div>
                            {categorySearch.trim() &&
                              !categories.find(
                                (c) =>
                                  c.name.toLowerCase() ===
                                  categorySearch.toLowerCase().trim(),
                              ) && (
                                <div className="border-t p-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full justify-start text-xs font-normal"
                                    onClick={handleCreateCategory}
                                    disabled={creatingCategory}
                                  >
                                    <Plus className="mr-2 h-3 w-3" />
                                    {creatingCategory
                                      ? "Creating..."
                                      : `Create "${categorySearch.trim()}"`}
                                  </Button>
                                </div>
                              )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="product-type">Product Type</Label>
                      <Input
                        id="product-type"
                        value={formData.productType}
                        onChange={(e) =>
                          handleInputChange("productType", e.target.value)
                        }
                        placeholder="e.g. Dry Dog Food"
                      />
                    </div>
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
                          className="w-full justify-between font-normal min-h-[40px] h-auto"
                        >
                          <div className="flex flex-wrap gap-1">
                            {formData.productOnPages.length > 0 ? (
                              formData.productOnPages.map((page) => (
                                <div
                                  key={page}
                                  className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1"
                                >
                                  {page}
                                  <X
                                    className="h-2 w-2 cursor-pointer hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const pages =
                                        formData.productOnPages.filter(
                                          (p) => p !== page,
                                        );
                                      handleInputChange(
                                        "productOnPages",
                                        pages,
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
                                <div
                                  key={page}
                                  className={cn(
                                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                                    isSelected &&
                                      "bg-accent text-accent-foreground",
                                  )}
                                  onClick={() => {
                                    const pages = isSelected
                                      ? formData.productOnPages.filter(
                                          (p) => p !== page,
                                        )
                                      : [...formData.productOnPages, page];
                                    handleInputChange("productOnPages", pages);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      isSelected ? "opacity-100" : "opacity-0",
                                    )}
                                  />
                                  {page}
                                </div>
                              );
                            })}
                            {filteredPages.length === 0 && (
                              <div className="p-2 text-xs text-muted-foreground italic text-center">
                                No pages found.
                              </div>
                            )}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Settings Group */}
                  <div className="space-y-1 pt-4">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Settings
                    </h3>
                    <Separator />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="is-featured"
                        checked={formData.isFeatured}
                        onCheckedChange={(checked) =>
                          handleInputChange("isFeatured", !!checked)
                        }
                      />
                      <Label htmlFor="is-featured" className="cursor-pointer">
                        Feature this product on the home page
                      </Label>
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
                </div>

                {/* Media Management */}
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                        Product Media
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        {formData.selectedImages.length > 0
                          ? `${currentImageIndex + 1} of ${formData.selectedImages.length} selected`
                          : "No images selected"}
                      </span>
                    </div>

                    {/* Large Image Carousel */}
                    <div className="relative group rounded-xl border bg-card overflow-hidden shadow-sm">
                      {formData.selectedImages.length > 0 ? (
                        <Carousel
                          setApi={setCarouselApi}
                          className="w-full"
                          opts={{
                            loop: true,
                          }}
                        >
                          <CarouselContent>
                            {formData.selectedImages.map((url, index) => (
                              <CarouselItem key={url}>
                                <div className="relative aspect-square flex items-center justify-center p-4 bg-white">
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <div className="relative w-full h-full cursor-zoom-in group/image">
                                        <img
                                          src={url}
                                          alt={`Product image ${index + 1}`}
                                          className="w-full h-full object-contain"
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/5 transition-colors flex items-center justify-center opacity-0 group-hover/image:opacity-100">
                                          <div className="bg-white/90 p-2 rounded-full shadow-lg">
                                            <Maximize2 className="h-5 w-5 text-primary" />
                                          </div>
                                        </div>
                                      </div>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden bg-white/95 backdrop-blur-sm border-none shadow-2xl">
                                      <div className="relative w-full h-[90vh] flex items-center justify-center p-8">
                                        <img
                                          src={url}
                                          alt={`Product image ${index + 1} (Zoomed)`}
                                          className="max-w-full max-h-full object-contain drop-shadow-2xl"
                                        />
                                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/80 backdrop-blur px-4 py-2 rounded-full border shadow-sm">
                                          <span className="text-xs font-mono font-bold text-primary truncate max-w-[300px]">
                                            {url.split("/").pop()}
                                          </span>
                                        </div>
                                      </div>
                                    </DialogContent>
                                  </Dialog>
                                  <button
                                    onClick={() => toggleImage(url)}
                                    className="absolute top-4 right-4 bg-destructive text-destructive-foreground rounded-full p-1.5 shadow-md hover:scale-110 transition-transform z-20"
                                    title="Remove this image"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              </CarouselItem>
                            ))}
                          </CarouselContent>
                          {formData.selectedImages.length > 1 && (
                            <>
                              <CarouselPrevious className="left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80" />
                              <CarouselNext className="right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80" />
                            </>
                          )}
                        </Carousel>
                      ) : (
                        <div className="aspect-square flex flex-col items-center justify-center text-muted-foreground bg-muted/10 border-2 border-dashed rounded-xl m-2">
                          <ImageIcon className="h-12 w-12 mb-2 opacity-20" />
                          <p className="text-sm font-medium">
                            No images selected
                          </p>
                          <p className="text-xs opacity-60 mt-1">
                            Select from candidates below
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Thumbnails of selected images */}
                    {formData.selectedImages.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1">
                        {formData.selectedImages.map((url, index) => (
                          <div
                            key={`thumb-${url}`}
                            onClick={() => carouselApi?.scrollTo(index)}
                            className={cn(
                              "relative flex-shrink-0 w-16 h-16 rounded-md border-2 overflow-hidden cursor-pointer transition-all",
                              currentImageIndex === index
                                ? "border-primary ring-2 ring-primary/20 scale-105"
                                : "border-transparent opacity-60 hover:opacity-100",
                            )}
                          >
                            <img
                              src={url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2 pt-2">
                      <Label
                        htmlFor="image-source"
                        className="text-xs uppercase font-bold text-muted-foreground"
                      >
                        Candidate Sources
                      </Label>
                      <Select
                        value={selectedImageSourceId}
                        onValueChange={setSelectedImageSourceId}
                      >
                        <SelectTrigger id="image-source" className="h-9">
                          <SelectValue placeholder="Select image source" />
                        </SelectTrigger>
                        <SelectContent>
                          {imageSourceOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Custom Image URL */}
                    {isCustomImageSource && (
                      <div className="space-y-2">
                        <Label htmlFor="custom-image-url">
                          Custom Image URL
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="custom-image-url"
                            value={formData.customImageUrl}
                            onChange={(e) =>
                              handleInputChange(
                                "customImageUrl",
                                e.target.value,
                              )
                            }
                            placeholder="Paste image URL..."
                            onKeyDown={(e) =>
                              e.key === "Enter" && addCustomImage()
                            }
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={addCustomImage}
                            type="button"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    <Separator />

                    {/* Image Candidates */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                        {isCustomImageSource
                          ? "Custom Source"
                          : `${activeImageSourceOption?.label ?? "Image"} Candidates`}
                      </Label>
                      {imageCandidates.length > 0 ? (
                        <div className="grid grid-cols-4 gap-2">
                          {imageCandidates.map((url) => {
                            const isSelected =
                              formData.selectedImages.includes(url);
                            return (
                              <div
                                key={url}
                                onClick={() => toggleImage(url)}
                                className={cn(
                                  "relative aspect-square rounded border overflow-hidden bg-card cursor-pointer hover:border-primary/50 transition-all",
                                  isSelected
                                    ? "ring-2 ring-primary border-primary"
                                    : "opacity-60 grayscale hover:grayscale-0",
                                )}
                              >
                                <img
                                  src={url}
                                  alt=""
                                  className="w-full h-full object-contain"
                                />
                                {isSelected && (
                                  <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                                    <CheckCircle className="h-5 w-5 text-primary" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="border rounded-lg p-4 text-xs text-muted-foreground bg-muted/20">
                          {isCustomImageSource
                            ? "Paste a URL above and add it to selected images."
                            : "No image candidates found for this source."}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Source Comparison */}
              <div className="pt-8">
                <Separator className="mb-8" />
                <details className="group border rounded-xl overflow-hidden">
                  <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 list-none font-bold text-sm uppercase tracking-wider text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      View Raw Scraped Data
                    </div>
                    <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="p-4 bg-muted/20 border-t space-y-4">
                    {Object.entries(selectedProduct.sources || {}).map(
                      ([source, data]) => (
                        <div key={source} className="space-y-2">
                          <div className="text-xs font-bold text-primary uppercase">
                            {source}
                          </div>
                          <pre className="text-[10px] bg-card p-3 rounded border overflow-x-auto">
                            {JSON.stringify(data, null, 2)}
                          </pre>
                        </div>
                      ),
                    )}
                  </div>
                </details>
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
    </div>
  );
}
