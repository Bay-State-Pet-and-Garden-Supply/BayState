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
} from "lucide-react";
import { toast } from "sonner";
import type { PipelineProduct } from "@/lib/pipeline/types";
import { Button } from "@/components/ui/button";
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
  onRefresh: () => void;
}

interface Brand {
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
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
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
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandSearch, setBrandSearch] = useState("");
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [brandPopoverOpen, setBrandPopoverOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const filteredBrands = useMemo(() => {
    if (!brandSearch.trim()) return brands;
    const search = brandSearch.toLowerCase();
    return brands.filter((b) => b.name.toLowerCase().includes(search));
  }, [brands, brandSearch]);

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
        setBrands((prev) => [...prev, brand].sort((a, b) => a.name.localeCompare(b.name)));
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

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    longDescription: "",
    price: "",
    weight: "",
    brandId: "none",
    category: "",
    productType: "",
    stockStatus: "in_stock",
    searchKeywords: "",
    productOnPages: [] as string[],
    isFeatured: false,
    isSpecialOrder: false,
    isTaxable: true,
    customImageUrl: "",
    selectedImages: [] as string[],
  });
  const [selectedImageSourceId, setSelectedImageSourceId] = useState("all");

  const selectedProduct = useMemo(
    () =>
      sortedProducts.find((product) => product.sku === preferredSku) ??
      sortedProducts[0] ??
      null,
    [preferredSku, sortedProducts],
  );

  const selectedSku = selectedProduct?.sku ?? null;

  // Fetch brands
  useEffect(() => {
    async function fetchBrands() {
      try {
        const res = await fetch("/api/admin/brands");
        if (res.ok) {
          const data = await res.json();
          setBrands(data.brands || []);
        }
      } catch (err) {
        console.error("Failed to fetch brands:", err);
      }
    }
    fetchBrands();
  }, []);

  // Initialize form when selected product changes
  useEffect(() => {
    if (selectedProduct) {
      const consolidated = selectedProduct.consolidated || {};
      const input = selectedProduct.input || {};

      const cons = selectedProduct.consolidated || {} as Record<string, unknown>;
      const consolidatedImages = toStringArray(consolidated.images);
      const selectedImagesFromMetadata = extractSelectedImageUrls(
        selectedProduct.selected_images,
      );
      const initialSelectedImages = Array.from(new Set(
        consolidatedImages.length > 0
          ? consolidatedImages
          : selectedImagesFromMetadata
      ));

      const name = consolidated.name || input.name || "";

      setFormData({
        name,
        description: consolidated.description || name,
        longDescription: (cons as Record<string, unknown>).long_description as string || name,
        price: String(consolidated.price ?? input.price ?? ""),
        weight: (cons as Record<string, unknown>).weight as string || "",
        brandId: consolidated.brand_id || "none",
        category: (cons as Record<string, unknown>).category as string || "",
        productType: (cons as Record<string, unknown>).product_type as string || "",
        stockStatus: (consolidated as Record<string, unknown>).stock_status as string || "in_stock",
        searchKeywords: (cons as Record<string, unknown>).search_keywords as string || "",
        productOnPages: Array.isArray((cons as Record<string, unknown>).product_on_pages)
          ? (cons as Record<string, unknown>).product_on_pages as string[]
          : typeof (cons as Record<string, unknown>).product_on_pages === "string"
            ? ((cons as Record<string, unknown>).product_on_pages as string).split("|").filter(Boolean)
            : [],
        isFeatured: consolidated.is_featured || false,
        isSpecialOrder: !!(cons as Record<string, unknown>).is_special_order,
        isTaxable: (cons as Record<string, unknown>).is_taxable !== false,
        customImageUrl: "",
        selectedImages: initialSelectedImages,
      });
      setSelectedImageSourceId("all");
    }
  }, [selectedProduct]);

  // Handle name change and auto-populate descriptions if they match name
  const handleNameChange = (newName: string) => {
    setFormData(prev => {
      const updates: any = { name: newName };
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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA" ||
        activeElement?.getAttribute("contenteditable") === "true"
      ) {
        return;
      }

      if (sortedProducts.length === 0) return;

      const currentIndex = sortedProducts.findIndex((p) => p.sku === preferredSku);

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
  }, [preferredSku, sortedProducts]);

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

  const handleInputChange = (field: string, value: string | boolean | string[]) => {
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

  const handleSave = async (andPublish = false) => {
    if (!selectedSku) return;

    const isSaveAction = !andPublish;
    if (isSaveAction) setSaving(true);
    else setPublishing(true);

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
        is_taxable: formData.isTaxable,
        weight: formData.weight.trim() || null,
        category: formData.category.trim() || null,
        product_type: formData.productType.trim() || null,
        search_keywords: formData.searchKeywords.trim() || null,
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

        toast.success("Product finalized and published to website!");
      } else {
        toast.success("Changes saved successfully");
      }

      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
      setPublishing(false);
    }
  };

  const imageSourceOptions = useMemo<ImageSourceOption[]>(() => {
    if (!selectedProduct) return [];

    const allCandidates = new Set<string>();
    const sourceOptions: ImageSourceOption[] = [];
    let savedCandidatesOption: ImageSourceOption | null = null;

    const pipelineCandidates = toStringArray(selectedProduct.image_candidates);
    if (pipelineCandidates.length > 0) {
      pipelineCandidates.forEach((url) => allCandidates.add(url));
      savedCandidatesOption = {
        id: "saved",
        label: "Saved Candidates",
        candidates: pipelineCandidates,
      };
    }

    const normalizedSources = normalizeProductSources(selectedProduct.sources || {});
    Object.entries(normalizedSources).forEach(([sourceKey, sourcePayload]) => {
      const sourceCandidates = extractImageCandidatesFromSources(
        { [sourceKey]: sourcePayload },
        48,
      );
      if (sourceCandidates.length === 0) return;

      sourceCandidates.forEach((url) => allCandidates.add(url));
      sourceOptions.push({
        id: `source:${sourceKey}`,
        label: formatSourceLabel(sourceKey),
        candidates: sourceCandidates,
      });
    });

    sourceOptions.sort((a, b) => a.label.localeCompare(b.label));

    formData.selectedImages.forEach((url) => allCandidates.add(url));

    return [
      {
        id: "all",
        label: "All Sources",
        candidates: Array.from(allCandidates),
      },
      ...(savedCandidatesOption ? [savedCandidatesOption] : []),
      ...sourceOptions,
      {
        id: "custom",
        label: "Custom Images",
        candidates: [],
      },
    ];
  }, [selectedProduct, formData.selectedImages]);

  useEffect(() => {
    if (imageSourceOptions.length === 0) {
      setSelectedImageSourceId("all");
      return;
    }

    if (!imageSourceOptions.some((option) => option.id === selectedImageSourceId)) {
      setSelectedImageSourceId(imageSourceOptions[0].id);
    }
  }, [imageSourceOptions, selectedImageSourceId]);

  const activeImageSourceOption = useMemo(
    () =>
      imageSourceOptions.find((option) => option.id === selectedImageSourceId) ??
      imageSourceOptions[0] ??
      null,
    [imageSourceOptions, selectedImageSourceId],
  );

  const imageCandidates = activeImageSourceOption?.candidates ?? [];
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
              </div>
              <div className="flex items-center gap-2">
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
                      <CheckCircle className="h-4 w-4 mr-2" /> Finalize &
                      Publish
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
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Product Info</h3>
                    <Separator />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="product-name">Product Name</Label>
                    <Input
                      id="product-name"
                      value={formData.name}
                      onChange={(e) =>
                        handleNameChange(e.target.value)
                      }
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
                      <Popover open={brandPopoverOpen} onOpenChange={setBrandPopoverOpen}>
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
                              : brands.find((b) => b.id === formData.brandId)?.name || "Select Brand"}
                            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
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
                                  formData.brandId === "none" && "bg-accent text-accent-foreground"
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
                                    formData.brandId === "none" ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                No Brand
                              </div>
                              {filteredBrands.map((brand) => (
                                <div
                                  key={brand.id}
                                  className={cn(
                                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                                    formData.brandId === brand.id && "bg-accent text-accent-foreground"
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
                                      formData.brandId === brand.id ? "opacity-100" : "opacity-0"
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
                            {brandSearch.trim() && !brands.find(b => b.name.toLowerCase() === brandSearch.toLowerCase().trim()) && (
                              <div className="border-t p-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full justify-start text-xs font-normal"
                                  onClick={handleCreateBrand}
                                  disabled={creatingBrand}
                                >
                                  <Plus className="mr-2 h-3 w-3" />
                                  {creatingBrand ? "Creating..." : `Create "${brandSearch.trim()}"`}
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
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Descriptions</h3>
                    <Separator />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="product-description">Short Description <span className="text-muted-foreground font-normal">(listing page)</span></Label>
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
                    <Label htmlFor="product-long-description">Long Description <span className="text-muted-foreground font-normal">(detail page)</span></Label>
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
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Classification</h3>
                    <Separator />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="product-category">Category</Label>
                      <Input
                        id="product-category"
                        value={formData.category}
                        onChange={(e) =>
                          handleInputChange("category", e.target.value)
                        }
                        placeholder="e.g. Dog|Cat"
                      />
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
                    <Label htmlFor="search-keywords">Search Keywords</Label>
                    <Input
                      id="search-keywords"
                      value={formData.searchKeywords}
                      onChange={(e) =>
                        handleInputChange("searchKeywords", e.target.value)
                      }
                      placeholder="dog food, dry kibble, chicken recipe..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Store Pages</Label>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 border rounded-lg p-3 bg-muted/20">
                      {SHOPSITE_PAGES.map((page) => (
                        <div key={page} className="flex items-center space-x-2">
                          <Checkbox
                            id={`page-${page}`}
                            checked={formData.productOnPages.includes(page)}
                            onCheckedChange={(checked) => {
                              const pages = checked
                                ? [...formData.productOnPages, page]
                                : formData.productOnPages.filter((p) => p !== page);
                              handleInputChange("productOnPages", pages);
                            }}
                          />
                          <Label htmlFor={`page-${page}`} className="text-sm cursor-pointer">
                            {page}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Settings Group */}
                  <div className="space-y-1 pt-4">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Settings</h3>
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
                        id="is-taxable"
                        checked={formData.isTaxable}
                        onCheckedChange={(checked) =>
                          handleInputChange("isTaxable", !!checked)
                        }
                      />
                      <Label htmlFor="is-taxable" className="cursor-pointer">
                        Taxable
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
                      <Label htmlFor="is-special-order" className="cursor-pointer">
                        Special Order
                      </Label>
                    </div>
                  </div>
                </div>

                {/* Media Management */}
                <div className="space-y-6">
                  <div className="space-y-4">
                    <Label>Product Images</Label>

                    <div className="space-y-2">
                      <Label htmlFor="image-source">Image Source</Label>
                      <Select
                        value={selectedImageSourceId}
                        onValueChange={setSelectedImageSourceId}
                      >
                        <SelectTrigger id="image-source">
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

                    {/* Selected Images Grid */}
                    <div className="grid grid-cols-3 gap-2 border rounded-lg p-3 bg-muted/20 min-h-[100px]">
                      {formData.selectedImages.map((url) => (
                        <div
                          key={url}
                          className="relative aspect-square rounded border overflow-hidden bg-card group"
                        >
                          <img
                            src={url}
                            alt=""
                            className="w-full h-full object-contain"
                          />
                          <button
                            onClick={() => toggleImage(url)}
                            className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {formData.selectedImages.length === 0 && (
                        <div className="col-span-3 flex flex-col items-center justify-center text-muted-foreground text-xs py-4">
                          <ImageIcon className="h-6 w-6 mb-1 opacity-20" />
                          No images selected
                        </div>
                      )}
                    </div>

                    {/* Custom Image URL */}
                    {isCustomImageSource && (
                      <div className="space-y-2">
                        <Label htmlFor="custom-image-url">Custom Image URL</Label>
                        <div className="flex gap-2">
                          <Input
                            id="custom-image-url"
                            value={formData.customImageUrl}
                            onChange={(e) =>
                              handleInputChange("customImageUrl", e.target.value)
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
