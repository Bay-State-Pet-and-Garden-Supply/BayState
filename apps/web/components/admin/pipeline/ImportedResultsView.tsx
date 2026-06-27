"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Database,
  Package,
  AlertCircle,
  Globe,
  Tags,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import type { PipelineProduct } from "@/lib/pipeline/types";
import type { Brand } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, formatExternalUrl } from "@/lib/utils";
import { PipelineFilters, type PipelineFiltersState } from "./PipelineFilters";
import { PipelineSearchField } from "./PipelineSearchField";
import { ManagementPanel } from "./management/ManagementPanel";
import { BulkAssignBrandDialog } from "./BulkAssignBrandDialog";
import { adminFetch } from "@/lib/admin/api-client";
import { BrandSourceSetupDrawer } from "@/components/admin/brands/BrandSourceSetupDrawer";

const NO_BRAND_GROUP_ID = "no_brand";

type CascadeReadiness = "ready" | "not_configured" | "no_brand" | "unknown";

interface BrandProductGroup {
  id: string;
  name: string;
  brand: Brand | null;
  products: PipelineProduct[];
}

interface ImportedResultsViewProps {
  products: PipelineProduct[];
  onRefresh: (silent?: boolean) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  filters?: PipelineFiltersState;
  onFilterChange?: (filters: PipelineFiltersState) => void;
  availableSources?: string[];
  isSearching?: boolean;
  onImportCsv?: () => void;
  onManualAdd?: () => void;
  isLoading?: boolean;
}

function getDisplayPrice(product: PipelineProduct): string {
  const value = product.input?.price;
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? `$${numeric.toFixed(2)}` : "—";
}

function getProductName(product: PipelineProduct): string {
  return product.input?.name || product.consolidated?.core?.name || product.consolidated?.name || "Unnamed product";
}

function sortByUpc(products: PipelineProduct[]): PipelineProduct[] {
  return [...products].sort((a, b) => a.upc.localeCompare(b.upc));
}

export function ImportedResultsView({
  products,
  onRefresh,
  search,
  onSearchChange,
  filters,
  onFilterChange,
  availableSources = [],
  isSearching = false,
  onImportCsv,
  onManualAdd,
  isLoading = false,
}: ImportedResultsViewProps) {
  const sortedProducts = useMemo(() => sortByUpc(products), [products]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [selectedProductUpcs, setSelectedProductUpcs] = useState<Set<string>>(new Set());
  const [isAssignBrandOpen, setIsAssignBrandOpen] = useState(false);
  const [isSetupDrawerOpen, setIsSetupDrawerOpen] = useState(false);
  const [readinessNonce, setReadinessNonce] = useState(0);
  const [readiness, setReadiness] = useState<Record<string, CascadeReadiness>>({});

  const groups = useMemo<BrandProductGroup[]>(() => {
    const grouped = new Map<string, BrandProductGroup>();

    for (const product of sortedProducts) {
      const brand = product.brand ?? null;
      const groupId = product.brand_id || NO_BRAND_GROUP_ID;
      const groupName = brand?.name || (groupId === NO_BRAND_GROUP_ID ? "No Brand" : "Unknown Brand");

      if (!grouped.has(groupId)) {
        grouped.set(groupId, {
          id: groupId,
          name: groupName,
          brand,
          products: [],
        });
      }

      const group = grouped.get(groupId)!;
      if (!group.brand && brand) {
        group.brand = brand;
        group.name = brand.name;
      }
      group.products.push(product);
    }

    return Array.from(grouped.values()).sort((a, b) => {
      if (a.id === NO_BRAND_GROUP_ID) return -1;
      if (b.id === NO_BRAND_GROUP_ID) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [sortedProducts]);

  const defaultReadiness = useMemo<Record<string, CascadeReadiness>>(() => {
    const initial: Record<string, CascadeReadiness> = {};
    for (const group of groups) {
      initial[group.id] = group.brand?.id ? "unknown" : "no_brand";
    }
    return initial;
  }, [groups]);

  const effectiveReadiness = useMemo(() => ({
    ...defaultReadiness,
    ...readiness,
  }), [defaultReadiness, readiness]);

  useEffect(() => {
    const brandIds = groups
      .map((group) => group.brand?.id)
      .filter((id): id is string => Boolean(id));

    if (brandIds.length === 0) return;

    let active = true;
    async function loadReadiness() {
      try {
        const res = await fetch("/api/admin/brands/source-cascade/readiness", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandIds }),
        });
        if (!res.ok) throw new Error("Failed to load cascade readiness");
        const data = await res.json();
        if (!active) return;

        const readinessByBrand = data.readiness as Record<string, { configured: boolean }> | undefined;
        const updated: Record<string, CascadeReadiness> = {};
        for (const group of groups) {
          const brandId = group.brand?.id;
          if (!brandId) {
            updated[group.id] = "no_brand";
          } else if (readinessByBrand?.[brandId]?.configured === true) {
            updated[group.id] = "ready";
          } else {
            updated[group.id] = "not_configured";
          }
        }
        setReadiness(updated);
      } catch {
        if (active) {
          console.warn("[ImportedResultsView] Failed to preload cascade readiness");
        }
      }
    }

    const id = window.setTimeout(() => {
      void loadReadiness();
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(id);
    };
  }, [groups, readinessNonce]);

  const activeGroup = useMemo(() => {
    return groups.find((group) => group.id === activeGroupId) ?? groups[0] ?? null;
  }, [activeGroupId, groups]);

  const activeProducts = useMemo(() => activeGroup?.products ?? [], [activeGroup]);
  const activeUpcs = useMemo(() => activeProducts.map((product) => product.upc), [activeProducts]);
  const activeAllSelected = activeUpcs.length > 0 && activeUpcs.every((upc) => selectedProductUpcs.has(upc));

  const handleSelectProduct = (upc: string, selected: boolean) => {
    setSelectedProductUpcs((prev) => {
      const next = new Set(prev);
      if (selected) next.add(upc);
      else next.delete(upc);
      return next;
    });
  };

  const handleToggleActiveGroupSelection = () => {
    setSelectedProductUpcs((prev) => {
      const next = new Set(prev);
      if (activeAllSelected) {
        activeUpcs.forEach((upc) => next.delete(upc));
      } else {
        activeUpcs.forEach((upc) => next.add(upc));
      }
      return next;
    });
  };

  const handleAssignBrand = async (brandId: string | null) => {
    const upcs = Array.from(selectedProductUpcs);
    if (upcs.length === 0) return;

    try {
      const res = await adminFetch("/api/admin/pipeline/bulk/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upcs, brandId }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to assign brand");
      }

      toast.success(
        `Updated brand for ${upcs.length} product${upcs.length === 1 ? "" : "s"}`,
      );
      setSelectedProductUpcs(new Set());
      onRefresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assign brand");
    }
  };

  const readinessLabel = (state: CascadeReadiness) => {
    if (state === "ready") return <Badge variant="outline" className="rounded-none border-brand-forest-green text-brand-forest-green bg-brand-forest-green/10 text-[9px]">Ready</Badge>;
    if (state === "not_configured") return <Badge variant="outline" className="rounded-none border-destructive/60 text-destructive bg-destructive/5 text-[9px]">No config</Badge>;
    if (state === "no_brand") return <Badge variant="outline" className="rounded-none border-amber-500/60 text-amber-700 dark:text-amber-400 bg-amber-500/10 text-[9px]">Needs brand</Badge>;
    return <Badge variant="outline" className="rounded-none text-[9px]">Checking</Badge>;
  };

  return (
    <div data-testid="product-table" className="flex max-w-full flex-1 min-h-0 flex-col overflow-hidden rounded-[var(--surface-admin-radius)] border border-border bg-card xl:flex-row">
      <div className="flex min-h-[260px] w-full shrink-0 flex-col overflow-x-hidden border-b border-border bg-background xl:w-80 xl:min-w-[320px] xl:max-w-[320px] xl:border-b-0 xl:border-r">
        <div className="flex flex-col border-b border-border bg-card">
          <div className="flex flex-col gap-2 p-2 sm:flex-row sm:items-center">
            <PipelineSearchField
              value={search || ""}
              onChange={(value) => onSearchChange?.(value)}
              className="flex-1"
              isLoading={isSearching}
            />
            {filters && onFilterChange ? (
              <PipelineFilters
                filters={filters}
                onFilterChange={onFilterChange}
                availableSources={availableSources}
                showSourceFilter={false}
                className="h-9 w-full shrink-0 justify-center border border-border p-0 sm:w-9"
              />
            ) : null}
          </div>

          {(onImportCsv || onManualAdd) && (
            <div className="flex flex-col gap-2 px-2 pb-2 sm:flex-row sm:items-center">
              {onImportCsv && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onImportCsv}
                  disabled={isLoading}
                  className="flex-1 h-8 border border-border text-foreground hover:bg-muted text-[10px] font-semibold transition-all"
                >
                  <Database className="mr-1.5 h-3.5 w-3.5" />
                  Import Integra
                </Button>
              )}
              {onManualAdd && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onManualAdd}
                  disabled={isLoading}
                  className="flex-1 h-8 border border-border text-foreground hover:bg-muted text-[10px] font-semibold transition-all"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Product
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border">
          {groups.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <Package className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-sm font-semibold">No imported products</p>
            </div>
          ) : (
            groups.map((group) => {
              const isActive = activeGroup?.id === group.id;
              const state = effectiveReadiness[group.id] ?? "unknown";
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActiveGroupId(group.id)}
                  className={cn(
                    "w-full p-3 text-left transition-colors hover:bg-muted/30",
                    isActive ? "bg-primary/15 border-l-4 border-primary" : "border-l-4 border-transparent",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {group.id === NO_BRAND_GROUP_ID ? (
                          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                        ) : (
                          <Tags className="h-4 w-4 shrink-0 text-brand-forest-green" />
                        )}
                        <span className="truncate text-[11px] font-bold uppercase tracking-widest text-foreground">
                          {group.name}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] font-semibold text-muted-foreground">
                        <span>{group.products.length} product{group.products.length === 1 ? "" : "s"}</span>
                        {group.brand?.official_domains?.[0] ? (
                          <span className="truncate">• {group.brand.official_domains[0]}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="shrink-0">{readinessLabel(state)}</div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden bg-card xl:flex-row">
        {activeGroup ? (
          <>
            <div className="flex min-h-[320px] flex-1 flex-col overflow-hidden border-b border-border xl:border-b-0 xl:border-r">
              <div className="bg-card border-b border-border flex-shrink-0 z-10">
                <div className="flex flex-col gap-3 p-4 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2">
                        <Tags className="h-5 w-5 text-primary shrink-0" />
                        <h2 className="text-xl font-semibold text-foreground line-clamp-1" title={activeGroup.name}>
                          {activeGroup.name}
                        </h2>
                      </div>
                      {activeGroup.brand?.official_domains?.[0] ? (
                        <Link
                          href={formatExternalUrl(activeGroup.brand.official_domains[0])}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-brand-forest-green hover:underline font-semibold bg-muted/30 px-2 py-0.5 border border-border"
                        >
                          <Globe className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[150px]">{activeGroup.brand.official_domains[0]}</span>
                        </Link>
                      ) : null}
                      {activeGroup.brand?.id && (
                        <button
                          type="button"
                          onClick={() => setIsSetupDrawerOpen(true)}
                          className={cn(
                            "inline-flex items-center gap-1 text-[10px] hover:underline font-bold bg-muted/30 px-2 py-0.5 border border-border cursor-pointer",
                            effectiveReadiness[activeGroup.id] === "not_configured"
                              ? "text-brand-burgundy"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <Settings2 className="h-3 w-3" />
                          Brand Setup
                        </button>
                      )}
                    </div>
                    <div className="text-[10px] font-semibold text-muted-foreground flex items-center gap-2">
                      <span>{activeProducts.length} Product{activeProducts.length !== 1 ? "s" : ""}</span>
                      <span>•</span>
                      <span>Sorted by UPC</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 relative">
                <div className="max-w-4xl mx-auto space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <h3 className="text-xs font-semibold text-foreground">
                      {activeGroup.id === NO_BRAND_GROUP_ID ? "Products needing brand assignment" : "Products in brand"}
                    </h3>
                    {activeProducts.length > 0 && (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={handleToggleActiveGroupSelection}
                        className="h-auto p-0 text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground"
                      >
                        {activeAllSelected ? "Deselect All" : "Select All"}
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {activeProducts.map((product) => {
                      const isSelected = selectedProductUpcs.has(product.upc);
                      return (
                        <div
                          key={product.upc}
                          onClick={() => {
                            const selection = typeof window !== 'undefined' ? window.getSelection()?.toString() : '';
                            if (selection) return;
                            handleSelectProduct(product.upc, !isSelected);
                          }}
                          className={cn(
                            "p-3 bg-card border flex flex-col gap-2 transition-all group relative cursor-pointer",
                            isSelected
                              ? "border-brand-forest-green bg-brand-forest-green/[0.03] shadow-sm"
                              : "border-border hover:border-muted-foreground/30 hover:bg-muted/10",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => handleSelectProduct(product.upc, checked === true)}
                                className={cn(
                                  "border-muted-foreground/40",
                                  isSelected && "border-brand-forest-green bg-brand-forest-green text-white",
                                )}
                              />
                              <div className="text-[9px] font-semibold text-muted-foreground bg-background px-1 py-0.5 rounded-none border border-border shrink-0">
                                {product.upc}
                              </div>
                            </div>
                            <div className="text-[10px] font-semibold text-brand-forest-green shrink-0">
                              {getDisplayPrice(product)}
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-foreground line-clamp-2 leading-tight" title={getProductName(product)}>
                            {getProductName(product)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {selectedProductUpcs.size > 0 && (
                  <div className="sticky bottom-0 left-0 right-0 z-20 flex items-center justify-between gap-4 p-4 border border-border bg-card/95 backdrop-blur shadow-lg mt-4 animate-in fade-in-50 slide-in-from-bottom-5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-brand-forest-green animate-pulse" />
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                        {selectedProductUpcs.size} Product{selectedProductUpcs.size > 1 ? "s" : ""} Selected
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedProductUpcs(new Set())}
                        className="h-8 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        Clear
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setIsAssignBrandOpen(true)}
                        className="h-8 rounded-none bg-brand-forest-green hover:bg-brand-forest-green/90 text-white font-bold uppercase text-[10px] tracking-wider px-3"
                      >
                        Assign Brand
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <ManagementPanel
              key={activeGroup.id}
              groupName={activeGroup.name}
              products={activeProducts}
              brand={activeGroup.brand}
              onSuccess={() => onRefresh()}
              readinessNonce={readinessNonce}
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <Package className="h-12 w-12 mb-2 opacity-20" />
            <h3 className="text-lg font-semibold text-foreground">No products</h3>
            <p className="mt-1 text-sm text-muted-foreground">Imported products appear here grouped by brand.</p>
          </div>
        )}
      </div>

      <BulkAssignBrandDialog
        open={isAssignBrandOpen}
        onOpenChange={setIsAssignBrandOpen}
        selectedCount={selectedProductUpcs.size}
        onConfirm={handleAssignBrand}
      />

      {activeGroup?.brand && (
        <BrandSourceSetupDrawer
          brand={activeGroup.brand}
          brandGroupId={activeGroup.id}
          open={isSetupDrawerOpen}
          onClose={() => setIsSetupDrawerOpen(false)}
          onSetupComplete={() => {
            setReadinessNonce((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
