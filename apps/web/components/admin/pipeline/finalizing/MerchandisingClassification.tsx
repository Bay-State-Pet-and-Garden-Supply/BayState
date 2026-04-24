"use client";

import { Check, Plus, Search, Trash2, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { FinalizationDraft } from "@/lib/pipeline/finalization-draft";

interface Brand {
  id: string;
  name: string;
}

interface MerchandisingClassificationProps {
  formData: FinalizationDraft;
  handleInputChange: <K extends keyof FinalizationDraft>(field: K, value: FinalizationDraft[K]) => void;
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
  addCustomSource: () => void;
  removeSource: (sourceKey: string) => void;
}

export function MerchandisingClassification({
  formData,
  handleInputChange,
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
  addCustomSource,
  removeSource,
}: MerchandisingClassificationProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-[10px] font-black uppercase tracking-tighter text-zinc-950">
          Merchandising
        </h3>
        <Separator className="h-1 bg-zinc-950" />
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="product-brand" className="text-[10px] font-black uppercase tracking-tighter text-zinc-950">Brand</Label>
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
                className="h-8 w-full justify-between font-black uppercase tracking-tighter rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)] text-[10px]"
              >
                {formData.brandId === "none"
                  ? "No Brand"
                  : brands.find((brand) => brand.id === formData.brandId)
                      ?.name || "Select Brand"}
                <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[var(--radix-popover-trigger-width)] p-0 rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
              align="start"
            >
              <div className="flex flex-col">
                <div className="flex items-center border-b border-zinc-950 px-3 py-2">
                  <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  <input
                    className="flex h-8 w-full rounded-none bg-transparent text-sm outline-none placeholder:text-zinc-500 font-black uppercase tracking-tighter disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Search brands..."
                    value={brandSearch}
                    onChange={(e) => setBrandSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-[200px] overflow-y-auto p-1">
                  <button
                    type="button"
                    className={cn(
                      "relative flex cursor-pointer select-none items-center rounded-none px-2 py-1.5 text-sm font-black uppercase tracking-tighter outline-none hover:bg-zinc-950 hover:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                      formData.brandId === "none"
                        && "bg-zinc-950 text-white",
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
                        "relative flex cursor-pointer select-none items-center rounded-none px-2 py-1.5 text-sm font-black uppercase tracking-tighter outline-none hover:bg-zinc-950 hover:text-white",
                        formData.brandId === brand.id
                          && "bg-zinc-950 text-white",
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
                    <div className="p-2 text-center text-[10px] font-black uppercase tracking-tighter text-zinc-500 italic">
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
                    <div className="border-t border-zinc-950 p-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-xs font-black uppercase tracking-tighter rounded-none hover:bg-zinc-950 hover:text-white"
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
          <Label htmlFor="product-availability" className="text-[10px] font-black uppercase tracking-tighter text-zinc-950">Availability Text</Label>
          <Input
            id="product-availability"
            value={formData.availability}
            onChange={(e) =>
              handleInputChange("availability", e.target.value)
            }
            placeholder="usually ships in 24 hours"
            className="h-8 border border-zinc-950 rounded-none shadow-[1px_1px_0px_rgba(0,0,0,1)] focus-visible:ring-zinc-950 font-bold text-xs"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] font-black uppercase tracking-tighter text-zinc-950">Store Pages</Label>
        <Popover
          open={pagePopoverOpen}
          onOpenChange={setPagePopoverOpen}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={pagePopoverOpen}
              className="h-auto min-h-[44px] w-full justify-between font-black uppercase tracking-tighter rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
            >
              <div className="flex flex-wrap gap-1">
                {formData.productOnPages.length > 0 ? (
                  formData.productOnPages.map((page) => (
                    <div
                      key={page}
                      className="flex items-center gap-1 rounded-none border border-zinc-950 bg-zinc-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-tighter text-zinc-950"
                    >
                      {page}
                      <X
                        className="h-2 w-2 cursor-pointer hover:text-zinc-500"
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
                  <span className="text-zinc-400">
                    Select Store Pages
                  </span>
                )}
              </div>
              <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0 rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
            align="start"
          >
            <div className="flex flex-col">
              <div className="flex items-center border-b border-zinc-950 px-3 py-2">
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <input
                  className="flex h-8 w-full rounded-none bg-transparent text-sm outline-none placeholder:text-zinc-500 font-black uppercase tracking-tighter disabled:cursor-not-allowed disabled:opacity-50"
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
                        "relative flex cursor-pointer select-none items-center rounded-none px-2 py-1.5 text-sm font-black uppercase tracking-tighter outline-none hover:bg-zinc-950 hover:text-white",
                        isSelected
                          && "bg-zinc-950 text-white",
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
                  <div className="p-2 text-center text-xs font-black uppercase tracking-tighter italic text-zinc-500">
                    No pages found.
                  </div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <details className="group border border-zinc-950 bg-zinc-50/30 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
        <summary className="flex cursor-pointer items-center justify-between p-2 text-[10px] font-black uppercase tracking-tighter text-zinc-500 hover:bg-zinc-100 list-none select-none">
          Advanced Settings & Sources
          <Plus className="h-3 w-3 transition-transform group-open:rotate-45" />
        </summary>
        <div className="p-3 space-y-4 border-t border-zinc-950">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-tighter text-zinc-950">Source URLs</Label>
            <div className="flex gap-2">
              <Input
                value={formData.customSourceUrl}
                onChange={(e) =>
                  handleInputChange("customSourceUrl", e.target.value)
                }
                placeholder="Paste custom source URL..."
                className="h-8 border border-zinc-950 rounded-none shadow-[1px_1px_0px_rgba(0,0,0,1)] focus-visible:ring-zinc-950 font-bold text-xs"
              />
              <Button
                onClick={addCustomSource}
                size="sm"
                className="h-8 bg-zinc-950 text-white rounded-none shadow-[1px_1px_0px_rgba(0,0,0,1)] hover:bg-zinc-800 font-black uppercase tracking-tighter text-[10px]"
              >
                Add
              </Button>
            </div>

            <div className="space-y-1 max-h-[160px] overflow-y-auto p-1 border border-dashed border-zinc-300">
              {Object.entries(formData.sources).length > 0 ? (
                Object.entries(formData.sources).map(([key, sourceData]) => {
                  const typedSourceData = sourceData as { url?: string; _is_custom?: boolean };
                  const url = typedSourceData?.url;
                  const isCustom = typedSourceData?._is_custom;
                  
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 border border-zinc-950 bg-white p-2 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-tighter text-zinc-950 truncate">
                          {key}
                          {isCustom && (
                            <span className="ml-1 text-[8px] text-violet-600 font-black italic">
                              Custom
                            </span>
                          )}
                        </span>
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] font-bold text-zinc-500 hover:text-zinc-950 truncate flex items-center gap-1"
                          >
                            {url}
                            <ExternalLink className="h-2 w-2" />
                          </a>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded-none text-red-950 hover:text-red-700 hover:bg-red-100"
                        onClick={() => removeSource(key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })
              ) : (
                <div className="py-4 text-center text-[10px] font-black uppercase tracking-tighter text-zinc-400 italic">
                  No sources added.
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is-special-order"
              checked={formData.isSpecialOrder}
              onCheckedChange={(checked) =>
                handleInputChange("isSpecialOrder", checked === true)
              }
              className="h-5 w-5 rounded-none border border-zinc-950 shadow-[1px_1px_0px_rgba(0,0,0,1)] data-[state=checked]:bg-zinc-950"
            />
            <Label
              htmlFor="is-special-order"
              className="text-sm font-black uppercase tracking-tighter text-zinc-950 cursor-pointer"
            >
              Special Order
            </Label>
          </div>
        </div>
      </details>
    </div>
  );
}
