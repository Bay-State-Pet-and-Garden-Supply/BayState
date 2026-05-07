"use client";

import { Check, Plus, Search, Trash2, X, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import { FINALIZATION_STOCK_STATUS_VALUES } from "@/lib/pipeline/finalization-draft";
import type { FinalizationDraft } from "@/lib/pipeline/finalization-draft";
import type { TaxonomyCategoryNode } from "@/lib/taxonomy";

interface Brand {
  id: string;
  name: string;
}

interface MerchandisingClassificationProps {
  formData: FinalizationDraft;
  handleInputChange: <K extends keyof FinalizationDraft>(field: K, value: FinalizationDraft[K]) => void;
  handleBrandChange: (brandId: string, brandName: string) => void;
  brands: Brand[];
  filteredBrands: Brand[];
  brandSearch: string;
  setBrandSearch: (value: string) => void;
  brandPopoverOpen: boolean;
  setBrandPopoverOpen: (open: boolean) => void;
  creatingBrand: boolean;
  handleCreateBrand: () => Promise<void>;
  pageSearch: string;
  setPageSearch: (value: string) => void;
  pagePopoverOpen: boolean;
  setPagePopoverOpen: (open: boolean) => void;
  filteredPages: string[];
  normalizeStorePages: (pages: string[]) => string[];
  categorySearch: string;
  setCategorySearch: (value: string) => void;
  categoryPopoverOpen: boolean;
  setCategoryPopoverOpen: (open: boolean) => void;
  filteredCategories: TaxonomyCategoryNode[];
  addCustomSource: () => void;
  removeSource: (sourceKey: string) => void;
  showLegacyShopSiteFields?: boolean;
}

export function MerchandisingClassification({
  formData,
  handleInputChange,
  handleBrandChange,
  brands,
  filteredBrands,
  brandSearch,
  setBrandSearch,
  brandPopoverOpen,
  setBrandPopoverOpen,
  creatingBrand,
  handleCreateBrand,
  pageSearch,
  setPageSearch,
  pagePopoverOpen,
  setPagePopoverOpen,
  filteredPages,
  normalizeStorePages,
  categorySearch,
  setCategorySearch,
  categoryPopoverOpen,
  setCategoryPopoverOpen,
  filteredCategories,
  addCustomSource,
  removeSource,
  showLegacyShopSiteFields = false,
}: MerchandisingClassificationProps) {
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);

  const displayedCategories = useMemo(() => {
    if (categorySearch.trim()) {
      return filteredCategories;
    }
    return filteredCategories.filter((c) => c.parent_id === currentParentId);
  }, [filteredCategories, categorySearch, currentParentId]);

  const currentParent = useMemo(() => {
    if (!currentParentId) return null;
    return filteredCategories.find((c) => c.id === currentParentId);
  }, [filteredCategories, currentParentId]);
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-[10px] font-semibold text-foreground">
          Merchandising
        </h3>
        <Separator className="h-1 bg-foreground" />
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="product-brand" className="text-[10px] font-semibold text-foreground">Brand</Label>
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
                className="h-8 w-full justify-between font-semibold rounded-none border border-border text-[10px]"
              >
                {formData.brandId === "none"
                  ? "No Brand"
                  : brands.find((brand) => brand.id === formData.brandId)
                      ?.name || "Select Brand"}
                <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[var(--radix-popover-trigger-width)] p-0 rounded-none border border-border shadow-md"
              align="start"
            >
              <div className="flex flex-col">
                <div className="flex items-center border-b border-border px-3 py-2">
                  <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  <input
                    className="flex h-8 w-full rounded-none bg-transparent text-sm outline-none placeholder:text-muted-foreground font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Search brands..."
                    value={brandSearch}
                    onChange={(e) => setBrandSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-[200px] overflow-y-auto p-1">
                  <button
                    type="button"
                    className={cn(
                      "relative flex cursor-pointer select-none items-center rounded-none px-2 py-1.5 text-sm font-semibold outline-none hover:bg-foreground hover:text-background data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                      formData.brandId === "none"
                        && "bg-foreground text-background",
                    )}
                    onClick={() => {
                      handleBrandChange("none", "");
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
                        "relative flex cursor-pointer select-none items-center rounded-none px-2 py-1.5 text-sm font-semibold outline-none hover:bg-foreground hover:text-background",
                        formData.brandId === brand.id
                          && "bg-foreground text-background",
                      )}
                      onClick={() => {
                        handleBrandChange(brand.id, brand.name);
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
                    <div className="p-2 text-center text-[10px] font-semibold text-muted-foreground italic">
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
                    <div className="border-t border-border p-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-xs font-semibold rounded-none hover:bg-foreground hover:text-background"
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

        <div className="space-y-1.5">
          <Label htmlFor="product-availability" className="text-[10px] font-semibold text-foreground">Availability Text</Label>
          <Input
            id="product-availability"
            value={formData.availability}
            onChange={(e) =>
              handleInputChange("availability", e.target.value)
            }
            placeholder="usually ships in 24 hours"
            className="h-8 border border-border rounded-none focus-visible:ring-primary font-bold tabular-nums text-xs"
          />
        </div>
      </div>

      <div className="space-y-3 border border-border bg-muted/10 p-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <Label className="text-[10px] font-semibold text-foreground uppercase tracking-wider">
            Classification & Placement
          </Label>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="product-category" className="text-[10px] font-semibold text-foreground">
            Category
          </Label>
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
                className="h-8 w-full justify-between font-semibold rounded-none border border-border text-[10px]"
              >
                {formData.category || "Select Category"}
                <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[var(--radix-popover-trigger-width)] p-0 rounded-none border border-border shadow-md"
              align="start"
            >
              <div className="flex flex-col">
                <div className="flex items-center border-b border-border px-3 py-2">
                  <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  <input
                    className="flex h-8 w-full rounded-none bg-transparent text-sm outline-none placeholder:text-muted-foreground font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Search categories..."
                    value={categorySearch}
                    onChange={(e) => {
                      setCategorySearch(e.target.value);
                      if (e.target.value.trim() && currentParentId) {
                        setCurrentParentId(null);
                      }
                    }}
                  />
                </div>
                {!categorySearch.trim() && (
                  <div className="flex items-center justify-between border-b border-border bg-muted/30 px-2 py-1.5">
                    {currentParentId ? (
                      <button
                        type="button"
                        className="flex items-center text-[10px] font-bold text-foreground hover:text-primary transition-colors"
                        onClick={() => setCurrentParentId(currentParent?.parent_id || null)}
                      >
                        <ChevronLeft className="mr-1 h-3 w-3" />
                        Back to {currentParent?.parent_id ? "previous" : "all categories"}
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Categories
                      </span>
                    )}
                  </div>
                )}
                <div className="max-h-[300px] overflow-y-auto p-1">
                  {displayedCategories.map((category) => {
                    const isSelected = formData.category === category.breadcrumb;
                    const hasChildren = !category.is_leaf;

                    return (
                      <div
                        key={category.id}
                        className={cn(
                          "group relative flex cursor-pointer select-none items-center rounded-none px-2 py-1.5 text-[10px] font-semibold outline-none hover:bg-foreground hover:text-background",
                          isSelected && "bg-foreground text-background",
                        )}
                        onClick={() => {
                          if (hasChildren && !categorySearch.trim()) {
                            setCurrentParentId(category.id);
                          } else {
                            handleInputChange("category", category.breadcrumb);
                            setCategoryPopoverOpen(false);
                            setCategorySearch("");
                            setCurrentParentId(null);
                          }
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-3.5 w-3.5",
                            isSelected ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="flex-1">
                          {categorySearch.trim() ? category.breadcrumb : category.name}
                        </span>
                        {hasChildren && !categorySearch.trim() && (
                          <ChevronRight className="ml-2 h-3 w-3 opacity-50 group-hover:opacity-100" />
                        )}
                      </div>
                    );
                  })}
                  {displayedCategories.length === 0 && (
                    <div className="p-2 text-center text-[10px] font-semibold italic text-muted-foreground">
                      No categories found.
                    </div>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {showLegacyShopSiteFields ? (
          <div className="space-y-1.5 pt-2 border-t border-border border-dashed">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] font-semibold text-foreground">
                ShopSite Pages
              </Label>
              <span className="text-[9px] font-semibold text-muted-foreground">
                Legacy / Optional Sink
              </span>
            </div>
            <Popover
              open={pagePopoverOpen}
              onOpenChange={setPagePopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={pagePopoverOpen}
                  className="h-auto min-h-[44px] w-full justify-between font-semibold rounded-none border border-border"
                >
                  <div className="flex flex-wrap gap-1">
                    {formData.productOnPages.length > 0 ? (
                      formData.productOnPages.map((page) => (
                        <div
                          key={page}
                          className="flex items-center gap-1 rounded-none border border-border bg-muted px-2 py-0.5 text-[9px] font-semibold text-foreground"
                        >
                          {page}
                          <X
                            className="h-2 w-2 cursor-pointer hover:text-muted-foreground"
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
                      <span className="text-muted-foreground/50">
                        Select ShopSite Pages
                      </span>
                    )}
                  </div>
                  <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] p-0 rounded-none border border-border shadow-md"
                align="start"
              >
                <div className="flex flex-col">
                  <div className="flex items-center border-b border-border px-3 py-2">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <input
                      className="flex h-8 w-full rounded-none bg-transparent text-sm outline-none placeholder:text-muted-foreground font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="Search ShopSite pages..."
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
                            "relative flex cursor-pointer select-none items-center rounded-none px-2 py-1.5 text-sm font-semibold outline-none hover:bg-foreground hover:text-background",
                            isSelected
                              && "bg-foreground text-background",
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
                      <div className="p-2 text-center text-xs font-semibold italic text-muted-foreground">
                        No pages found.
                      </div>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        ) : (
          <div className="pt-2 border-t border-border border-dashed text-[9px] font-semibold text-muted-foreground italic">
            Enable ShopSite fields in header for legacy page assignments.
          </div>
        )}
      </div>

      <div className="space-y-3 border border-border p-3 bg-muted/10">
        <h4 className="text-[10px] font-semibold text-foreground">
          Product Attributes
        </h4>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="product-gtin" className="text-[10px] font-semibold text-foreground">GTIN / UPC</Label>
            <Input
              id="product-gtin"
              value={formData.gtin}
              onChange={(e) => handleInputChange("gtin", e.target.value)}
              placeholder="e.g. 077234550182"
              className="h-8 border border-border rounded-none focus-visible:ring-primary font-bold tabular-nums text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-stock-status" className="text-[10px] font-semibold text-foreground">Stock Status</Label>
            <Select
              value={formData.stockStatus}
              onValueChange={(value) => handleInputChange("stockStatus", value as FinalizationDraft["stockStatus"])}
            >
              <SelectTrigger
                id="product-stock-status"
                className="h-8 border border-border rounded-none focus-visible:ring-primary font-bold text-xs"
              >
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-border">
                {FINALIZATION_STOCK_STATUS_VALUES.map((status) => (
                  <SelectItem
                    key={status}
                    value={status}
                    className="font-semibold text-xs rounded-none"
                  >
                    {status.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-minimum-quantity" className="text-[10px] font-semibold text-foreground">Min Qty</Label>
            <Input
              id="product-minimum-quantity"
              type="number"
              min="0"
              step="1"
              value={formData.minimumQuantity}
              onChange={(e) => handleInputChange("minimumQuantity", e.target.value)}
              placeholder="0"
              className="h-8 border border-border rounded-none focus-visible:ring-primary font-bold tabular-nums text-xs"
            />
          </div>
        </div>
      </div>

      <details className="group border border-border bg-muted/10">
        <summary className="flex cursor-pointer items-center justify-between p-2 text-[10px] font-semibold text-muted-foreground hover:bg-muted list-none select-none">
          Advanced Settings & Sources
          <Plus className="h-3 w-3 transition-transform group-open:rotate-45" />
        </summary>
        <div className="p-3 space-y-4 border-t border-border">
          <div className="space-y-2">
            <Label className="text-[10px] font-semibold text-foreground">Source URLs</Label>
            <div className="flex gap-2">
              <Input
                value={formData.customSourceUrl}
                onChange={(e) =>
                  handleInputChange("customSourceUrl", e.target.value)
                }
                placeholder="Paste custom source URL..."
                className="h-8 border border-border rounded-none focus-visible:ring-primary font-bold text-xs"
              />
              <Button
                onClick={addCustomSource}
                size="sm"
                className="h-8 bg-foreground text-background rounded-none hover:bg-foreground/90 font-semibold text-[10px]"
              >
                Add
              </Button>
            </div>

            <div className="space-y-1 max-h-[160px] overflow-y-auto p-1 border border-dashed border-border">
              {Object.entries(formData.sources).length > 0 ? (
                Object.entries(formData.sources).map(([key, sourceData]) => {
                  const typedSourceData = sourceData as { url?: string; _is_custom?: boolean };
                  const url = typedSourceData?.url;
                  const isCustom = typedSourceData?._is_custom;
                  
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 border border-border bg-card p-2"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-semibold text-foreground truncate">
                          {key}
                          {isCustom && (
                            <span className="ml-1 text-[8px] text-primary font-bold italic">
                              Custom
                            </span>
                          )}
                        </span>
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] font-bold text-muted-foreground hover:text-foreground truncate flex items-center gap-1"
                          >
                            {url}
                            <ExternalLink className="h-2 w-2" />
                          </a>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-none text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                        onClick={() => removeSource(key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })
              ) : (
                <div className="py-4 text-center text-[10px] font-semibold text-muted-foreground/40 italic">
                  No sources added.
                </div>
              )}
            </div>
          </div>

          {showLegacyShopSiteFields ? (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is-special-order"
                checked={formData.isSpecialOrder}
                onCheckedChange={(checked) =>
                  handleInputChange("isSpecialOrder", checked === true)
                }
                className="h-5 w-5 rounded-none border border-border data-[state=checked]:bg-foreground"
              />
              <Label
                htmlFor="is-special-order"
                className="text-sm font-semibold text-foreground cursor-pointer"
              >
                Special Order
              </Label>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
