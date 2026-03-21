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
} from "lucide-react";
import { toast } from "sonner";
import type {
  PipelineProduct,
  PipelineStatus,
  SelectedImage,
} from "@/lib/pipeline/types";
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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface FinalizingResultsViewProps {
  products: PipelineProduct[];
  onRefresh: () => void;
}

interface Brand {
  id: string;
  name: string;
}

export function FinalizingResultsView({
  products,
  onRefresh,
}: FinalizingResultsViewProps) {
  const [preferredSku, setPreferredSku] = useState<string | null>(
    products.length > 0 ? products[0].sku : null,
  );
  const [brands, setBrands] = useState<Brand[]>([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    brandId: "none",
    stockStatus: "in_stock",
    isFeatured: false,
    customImageUrl: "",
    selectedImages: [] as string[],
  });

  const selectedProduct = useMemo(
    () =>
      products.find((product) => product.sku === preferredSku) ??
      products[0] ??
      null,
    [preferredSku, products],
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

      setFormData({
        name: consolidated.name || input.name || "",
        description: consolidated.description || "",
        price: String(consolidated.price ?? input.price ?? ""),
        brandId: consolidated.brand_id || "none",
        stockStatus: (consolidated as any).stock_status || "in_stock",
        isFeatured: consolidated.is_featured || false,
        customImageUrl: "",
        selectedImages: consolidated.images || [],
      });
    }
  }, [selectedProduct]);

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

      if (products.length === 0) return;

      const currentIndex = products.findIndex((p) => p.sku === preferredSku);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = Math.min(currentIndex + 1, products.length - 1);
        setPreferredSku(products[nextIndex].sku);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const nextIndex = Math.max(currentIndex - 1, 0);
        setPreferredSku(products[nextIndex].sku);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [preferredSku, products]);

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

  const handleInputChange = (field: string, value: any) => {
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
        price: parseFloat(formData.price) || 0,
        brand_id: formData.brandId === "none" ? null : formData.brandId,
        stock_status: formData.stockStatus,
        is_featured: formData.isFeatured,
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

  const imageCandidates = useMemo(() => {
    if (!selectedProduct) return [];
    const candidates = selectedProduct.image_candidates || [];
    // Also include images already selected that might not be in candidates
    const selected = formData.selectedImages;
    return Array.from(new Set([...selected, ...candidates]));
  }, [selectedProduct, formData.selectedImages]);

  return (
    <div className="flex h-full min-h-0 border rounded-lg overflow-hidden bg-background shadow-sm">
      {/* Left Column: Product List */}
      <div className="w-1/3 border-r flex flex-col min-w-[320px] bg-muted/5 overflow-hidden">
        <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
          <div className="divide-y">
            {products.map((product, index) => {
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
            <div className="p-4 border-b flex justify-between items-center bg-white sticky top-0 z-10">
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
                  <div className="space-y-2">
                    <Label htmlFor="product-name">Product Name</Label>
                    <Input
                      id="product-name"
                      value={formData.name}
                      onChange={(e) =>
                        handleInputChange("name", e.target.value)
                      }
                      placeholder="e.g. Science Diet Adult Dog Food 30lb"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
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
                      <Label htmlFor="product-brand">Brand</Label>
                      <Select
                        value={formData.brandId}
                        onValueChange={(v) => handleInputChange("brandId", v)}
                      >
                        <SelectTrigger id="product-brand">
                          <SelectValue placeholder="Select Brand" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Brand</SelectItem>
                          {brands.map((brand) => (
                            <SelectItem key={brand.id} value={brand.id}>
                              {brand.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="product-description">Description</Label>
                    <Textarea
                      id="product-description"
                      value={formData.description}
                      onChange={(e) =>
                        handleInputChange("description", e.target.value)
                      }
                      placeholder="Enter full product description..."
                      className="min-h-[200px]"
                    />
                  </div>

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
                </div>

                {/* Media Management */}
                <div className="space-y-6">
                  <div className="space-y-4">
                    <Label>Product Images</Label>

                    {/* Selected Images Grid */}
                    <div className="grid grid-cols-3 gap-2 border rounded-lg p-3 bg-muted/20 min-h-[100px]">
                      {formData.selectedImages.map((url, i) => (
                        <div
                          key={i}
                          className="relative aspect-square rounded border overflow-hidden bg-white group"
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
                    <div className="flex gap-2">
                      <Input
                        value={formData.customImageUrl}
                        onChange={(e) =>
                          handleInputChange("customImageUrl", e.target.value)
                        }
                        placeholder="Paste image URL..."
                        onKeyDown={(e) => e.key === "Enter" && addCustomImage()}
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

                    <Separator />

                    {/* Image Candidates */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                        Scraped Candidates
                      </Label>
                      <div className="grid grid-cols-4 gap-2">
                        {imageCandidates.map((url, i) => {
                          const isSelected =
                            formData.selectedImages.includes(url);
                          return (
                            <div
                              key={i}
                              onClick={() => toggleImage(url)}
                              className={cn(
                                "relative aspect-square rounded border overflow-hidden bg-white cursor-pointer hover:border-primary/50 transition-all",
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
                          <pre className="text-[10px] bg-white p-3 rounded border overflow-x-auto">
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
