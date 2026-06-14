"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Database,
  Layers,
  Edit2,
  AlertCircle,
  Globe,
  X,
} from "lucide-react";
import type { PipelineProduct } from "@/lib/pipeline/types";
import type { Brand } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatExternalUrl } from "@/lib/utils";
import { PipelineFilters } from "./PipelineFilters";
import { PipelineSearchField } from "./PipelineSearchField";
import { PipelineSidebarTable } from "./PipelineSidebarTable";
import { ManagementPanel } from "./management/ManagementPanel";
import { BulkManagementPanel } from "./management/BulkManagementPanel";
import { CohortBrandPicker } from "../cohorts/CohortBrandPicker";
import { toast } from "sonner";
import {
  updateProductsBatch,
  updateCohortBatch,
} from "@/app/admin/pipeline/batch-actions";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkAssignBrandDialog } from "./BulkAssignBrandDialog";
import { adminFetch } from "@/lib/admin/api-client";

interface ImportedResultsViewProps {
  products: PipelineProduct[];
  onRefresh: (silent?: boolean) => void;
  // Filter props
  search?: string;
  onSearchChange?: (value: string) => void;
  filters?: {
    source?: string;
    product_line?: string;
    cohort_id?: string;
  };
  onFilterChange?: (filters: {
    source?: string;
    product_line?: string;
    cohort_id?: string;
  }) => void;
  availableSources?: string[];
  isSearching?: boolean;
  // Cohort grouping props
  groupedProducts?: {
    groups: Record<string, PipelineProduct[]>;
    cohortIds: string[];
    names?: Record<string, string>;
  };
  cohortBrands?: Record<string, string>;
  cohortBrandObjects?: Record<string, Brand>;
  onEditCohort?: (id: string, name: string | null, brandName: string | null) => void;
  onImportCsv?: () => void;
  onManualAdd?: () => void;
  isLoading?: boolean;
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
  groupedProducts,
  cohortBrands = {},
  cohortBrandObjects = {},
  onEditCohort,
  onImportCsv,
  onManualAdd,
  isLoading = false,
}: ImportedResultsViewProps) {


  // 1. Data Transformation & Memoized State
  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => a.upc.localeCompare(b.upc));
  }, [products]);

  // 2. Primary Selection State
  const [preferredCohortId, setPreferredCohortId] = useState<string | null>(null);
  const [selectedCohortIds, setSelectedCohortIds] = useState<Set<string>>(new Set());
  const [selectedProductUpcs, setSelectedProductUpcs] = useState<Set<string>>(new Set());

  // 3. Cascade Readiness Preloading
  const [cohortReadiness, setCohortReadiness] = useState<Record<string, 'ready' | 'not_configured' | 'no_brand' | 'unknown'>>({});

  // Preload cascade readiness for visible cohorts whenever groupedProducts changes
  useEffect(() => {
    if (!groupedProducts || groupedProducts.cohortIds.length === 0) {
      setCohortReadiness({});
      return;
    }

    // Collect unique brand IDs from cohortBrandObjects
    const brandIds = new Set<string>();
    const cohortToBrandMap: Record<string, string | null> = {};

    for (const cohortId of groupedProducts.cohortIds) {
      const brand = cohortBrandObjects[cohortId];
      if (brand?.id) {
        brandIds.add(brand.id);
        cohortToBrandMap[cohortId] = brand.id;
      } else {
        cohortToBrandMap[cohortId] = null;
      }
    }

    // Initialize with no_brand for brandless cohorts
    const initialReadiness: Record<string, 'ready' | 'not_configured' | 'no_brand' | 'unknown'> = {};
    for (const cohortId of groupedProducts.cohortIds) {
      initialReadiness[cohortId] = cohortToBrandMap[cohortId] ? 'unknown' : 'no_brand';
    }
    setCohortReadiness(initialReadiness);

    if (brandIds.size === 0) return;

    let active = true;

    async function loadReadiness() {
      try {
        const res = await fetch('/api/admin/brands/source-cascade/readiness', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandIds: Array.from(brandIds) }),
        });
        if (!res.ok) throw new Error('Failed to load cascade readiness');
        const data = await res.json();
        if (!active) return;

        const readiness = data.readiness as Record<string, { configured: boolean }> | undefined;
        if (!readiness || !groupedProducts) return;

        const updated: Record<string, 'ready' | 'not_configured' | 'no_brand' | 'unknown'> = {};
        for (const cohortId of groupedProducts.cohortIds) {
          const brandId = cohortToBrandMap[cohortId];
          if (!brandId) {
            updated[cohortId] = 'no_brand';
          } else if (readiness[brandId]?.configured === true) {
            updated[cohortId] = 'ready';
          } else {
            updated[cohortId] = 'not_configured';
          }
        }
        setCohortReadiness(updated);
      } catch {
        // Non-critical: sidebar badges just stay at initial state
        if (active) {
          console.warn('[ImportedResultsView] Failed to preload cascade readiness');
        }
      }
    }

    void loadReadiness();
    return () => { active = false; };
  }, [groupedProducts, cohortBrandObjects]);

  const handleSelectCohort = (cohortId: string, isSelected: boolean) => {
    setSelectedCohortIds((prev) => {
      const next = new Set(prev);
      if (isSelected) {
        next.add(cohortId);
      } else {
        next.delete(cohortId);
      }
      return next;
    });
  };
  const [isSplitBrandOpen, setIsSplitBrandOpen] = useState(false);

  // Clear product selection when cohort changes
  useEffect(() => {
    const id = setTimeout(() => {
      setSelectedProductUpcs(new Set());
    }, 0);
    return () => clearTimeout(id);
  }, [preferredCohortId]);

  // Handle split and brand assignment confirmation
  const handleSplitBrandConfirm = async (brandId: string | null) => {
    const upcs = Array.from(selectedProductUpcs);
    if (upcs.length === 0) return;

    try {
      const res = await adminFetch("/api/admin/pipeline/bulk/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upcs,
          brandId,
        }),
      });

      if (res.ok) {
        toast.success(
          `Split and assigned brand to ${upcs.length} product${upcs.length > 1 ? "s" : ""}`,
          { description: "Products have been split into the brand-specific cohort." }
        );
        setSelectedProductUpcs(new Set());
        onRefresh(true);
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to split products");
      }
    } catch {
      toast.error("Failed to split products");
    }
  };

  // Initialize preferredCohortId when groupedProducts becomes available
  useEffect(() => {
    if (groupedProducts && groupedProducts.cohortIds.length > 0 && !preferredCohortId) {
      const id = setTimeout(() => {
        setPreferredCohortId(groupedProducts.cohortIds[0]);
      }, 0);
      return () => clearTimeout(id);
    }
  }, [groupedProducts, preferredCohortId]);

  const activeCohortId = useMemo(() => {
    return preferredCohortId;
  }, [preferredCohortId]);

  const cohortProducts = useMemo(() => {
    if (!activeCohortId) return [];
    if (groupedProducts && groupedProducts.groups[activeCohortId]) {
      return groupedProducts.groups[activeCohortId];
    }
    return sortedProducts.filter(p => (p.cohort_id || "ungrouped") === activeCohortId);
  }, [activeCohortId, groupedProducts, sortedProducts]);

  const activeCohortName = activeCohortId && groupedProducts?.names?.[activeCohortId] ? groupedProducts.names[activeCohortId] : activeCohortId === "ungrouped" ? "Ungrouped Products" : `Cohort ${activeCohortId?.slice(0, 8)}`;

  const activeCohortBrand = activeCohortId ? cohortBrands[activeCohortId] : null;
  const activeCohortBrandObject = activeCohortId ? cohortBrandObjects[activeCohortId] : null;
  const hasConfiguredDomains = Boolean(activeCohortBrandObject?.official_domains && activeCohortBrandObject.official_domains.length > 0);

  // Handle brand assignment inline
  const handleAssignBrand = async (brand: Brand | null) => {
    if (!activeCohortId || activeCohortId === "ungrouped") return;

    try {
      const upcs = cohortProducts.map((p) => p.upc);

      // 1. Update the cohort batch
      const cohortResult = await updateCohortBatch(activeCohortId, {
        brand_id: brand?.id || null,
        brand_name: brand?.name || null,
      });
      if (!cohortResult.success) throw new Error(cohortResult.error);

      // 2. Update the products batch
      const productResult = await updateProductsBatch(upcs, {
        brand_id: brand?.id || null,
      });
      if (!productResult.success) throw new Error(productResult.error);

      toast.success(brand ? `Brand assigned: ${brand.name}` : "Brand assignment cleared");
      onRefresh(true); // reload state
    } catch (error) {
      console.error("Failed to assign brand:", error);
      toast.error(error instanceof Error ? error.message : "Failed to assign brand");
    }
  };



  // Handle cohort change from sidebar
  const handleCohortChange = (cohortId: string) => {
    setPreferredCohortId(cohortId);
  };

  // 5. Render logic
  return (
    <div data-testid="product-table" className="flex max-w-full flex-1 min-h-0 flex-col overflow-hidden rounded-[var(--surface-admin-radius)] border border-border bg-card xl:flex-row">
      {/* Left Column: Product List */}
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

        <PipelineSidebarTable
          products={sortedProducts}
          groupedProducts={groupedProducts}
          cohortBrands={cohortBrands}
          cohortBrandObjects={cohortBrandObjects}
          selectedUpcs={new Set()}
          preferredUpc={null}
          preferredCohortId={preferredCohortId}
          onSelectUpc={() => {}}
          onSelectAll={() => {}}
          onDeselectAll={() => {}}
          onPreferredUpcChange={() => { }}
          onPreferredCohortChange={handleCohortChange}
          selectedCohortIds={selectedCohortIds}
          onSelectCohort={handleSelectCohort}
          variant="imported"
          cohortReadiness={cohortReadiness}
        />
      </div>

      {/* Right Column: Master-Detail Area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-card xl:flex-row">
        {selectedCohortIds.size > 0 ? (
          <>
            {/* Center: Bulk Selection Summary */}
            <div className="flex min-h-[320px] flex-1 flex-col overflow-hidden border-b border-border xl:border-b-0 xl:border-r">
              <div className="bg-card border-b border-border flex-shrink-0 z-10">
                <div className="flex flex-col gap-3 p-4 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex items-center gap-2">
                      <Layers className="h-5 w-5 text-primary shrink-0" />
                      <h2 className="text-xl font-semibold text-foreground">
                        Bulk Cohort Action
                      </h2>
                    </div>
                    <div className="text-[10px] font-semibold text-muted-foreground flex items-center gap-2">
                      <span>{selectedCohortIds.size} Cohort{selectedCohortIds.size !== 1 ? 's' : ''} Selected</span>
                      <span>•</span>
                      <span>{
                        Array.from(selectedCohortIds).reduce((acc, id) => acc + (groupedProducts?.groups[id]?.length || 0), 0)
                      } Total Products</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedCohortIds(new Set())}
                    className="h-8 rounded-none border border-border hover:bg-muted text-xs font-semibold self-start"
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-background p-4 sm:p-6">
                <div className="max-w-4xl mx-auto space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                    Selected Batches Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-300">
                    {Array.from(selectedCohortIds).map((cohortId) => {
                      const groupProducts = groupedProducts?.groups[cohortId] || [];
                      const cohortName = groupedProducts?.names?.[cohortId] || (cohortId === 'ungrouped' ? 'Ungrouped Products' : `Cohort ${cohortId.slice(0, 8)}`);
                      const brand = cohortBrandObjects[cohortId] || null;
                      return (
                        <div
                          key={cohortId}
                          className="p-4 bg-card border border-border hover:border-muted-foreground/30 transition-all flex flex-col justify-between group relative"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <h4 className="text-sm font-semibold text-foreground line-clamp-1 truncate" title={cohortName}>
                                {cohortName}
                              </h4>
                              <button
                                onClick={() => handleSelectCohort(cohortId, false)}
                                className="text-muted-foreground hover:text-destructive p-1 transition-colors rounded-none"
                                title="Remove cohort"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5 items-center mb-2">
                              {brand ? (
                                <Badge variant="outline" className="h-4 text-[9px] px-1 font-semibold rounded-none border-brand-forest-green text-brand-forest-green bg-brand-forest-green/5">
                                  {brand.name}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="h-4 text-[9px] px-1 font-semibold rounded-none border-muted-foreground/30 text-muted-foreground bg-muted/5">
                                  No Brand Assigned
                                </Badge>
                              )}
                              {brand?.official_domains && brand.official_domains.length > 0 && (
                                <span className="text-[9px] text-muted-foreground bg-muted/20 border border-border px-1">
                                  {brand.official_domains[0]}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-[10px] font-semibold text-muted-foreground pt-2 border-t border-border/50 flex justify-between items-center">
                            <span>Products: {groupProducts.length}</span>
                            <span className="font-mono text-[9px] opacity-60">{cohortId}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Bulk Management Panel */}
            <BulkManagementPanel
              selectedCohortIds={selectedCohortIds}
              groupedProducts={groupedProducts}
              cohortBrandObjects={cohortBrandObjects}
              onClearSelection={() => setSelectedCohortIds(new Set())}
              onSuccess={() => {
                setSelectedCohortIds(new Set());
                onRefresh();
              }}
            />
          </>
        ) : activeCohortId && cohortProducts.length > 0 ? (
          <>
            {/* Center: Product List/Preview (Master) */}
            <div className="flex min-h-[320px] flex-1 flex-col overflow-hidden border-b border-border xl:border-b-0 xl:border-r">
              {/* Header */}
              <div className="bg-card border-b border-border flex-shrink-0 z-10">
                <div className="flex flex-col gap-3 p-4 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2">
                        <Layers className="h-5 w-5 text-primary shrink-0" />
                        <h2 className="text-xl font-semibold text-foreground line-clamp-1" title={activeCohortName}>
                          {activeCohortName}
                        </h2>
                        {activeCohortId && activeCohortId !== "ungrouped" && onEditCohort && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                            onClick={() =>
                              onEditCohort(
                                activeCohortId,
                                groupedProducts?.names?.[activeCohortId] || null,
                                activeCohortBrand || null
                              )
                            }
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      {activeCohortId && activeCohortId !== "ungrouped" && (
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <CohortBrandPicker
                             value={activeCohortBrandObject}
                             onAssign={handleAssignBrand}
                             triggerClassName="h-7 rounded-none border border-border bg-background py-0 text-[11px]"
                          />
                          {activeCohortBrandObject?.official_domains && activeCohortBrandObject.official_domains.length > 0 && (
                            <a
                              href={formatExternalUrl(activeCohortBrandObject.official_domains[0])}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-brand-forest-green hover:underline font-semibold bg-muted/30 px-2 py-0.5 border border-border"
                            >
                              <Globe className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[150px]">{activeCohortBrandObject.official_domains[0]}</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] font-semibold text-muted-foreground flex items-center gap-2">
                      <span>{cohortProducts.length} Product{cohortProducts.length !== 1 ? 's' : ''}</span>
                      {activeCohortId !== "ungrouped" && (
                        <>
                          <span>•</span>
                          <span className="font-mono">{activeCohortId}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>


              {/* Details Content (Product Preview Grid) */}
              <div className="flex-1 overflow-y-auto bg-background p-4 sm:p-6 relative">
                <div className="max-w-4xl mx-auto space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <h3 className="text-xs font-semibold text-foreground">Products in Cohort</h3>
                    {cohortProducts.length > 0 && (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => {
                          const allUpcs = cohortProducts.map(p => p.upc);
                          const allSelected = allUpcs.every(upc => selectedProductUpcs.has(upc));
                          if (allSelected) {
                            setSelectedProductUpcs(new Set());
                          } else {
                            setSelectedProductUpcs(new Set(allUpcs));
                          }
                        }}
                        className="h-auto p-0 text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground"
                      >
                        {cohortProducts.every(p => selectedProductUpcs.has(p.upc)) ? "Deselect All" : "Select All"}
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {cohortProducts.map(product => {
                      const isSelected = selectedProductUpcs.has(product.upc);
                      return (
                        <div
                          key={product.upc}
                          onClick={() => {
                            setSelectedProductUpcs(prev => {
                              const next = new Set(prev);
                              if (next.has(product.upc)) {
                                next.delete(product.upc);
                              } else {
                                next.add(product.upc);
                              }
                              return next;
                            });
                          }}
                          className={cn(
                            "p-3 bg-card border flex flex-col gap-2 transition-all group relative cursor-pointer select-none",
                            isSelected
                              ? "border-brand-forest-green bg-brand-forest-green/[0.03] shadow-sm"
                              : "border-border hover:border-muted-foreground/30 hover:bg-muted/10"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => {
                                  setSelectedProductUpcs(prev => {
                                    const next = new Set(prev);
                                    if (checked) {
                                      next.add(product.upc);
                                    } else {
                                      next.delete(product.upc);
                                    }
                                    return next;
                                  });
                                }}
                                className={cn(
                                  "border-muted-foreground/40",
                                  isSelected && "border-brand-forest-green bg-brand-forest-green text-white"
                                )}
                              />
                              <div className="text-[9px] font-semibold text-muted-foreground bg-background px-1 py-0.5 rounded-none border border-border shrink-0">
                                {product.upc}
                              </div>
                            </div>
                            <div className="text-[10px] font-semibold text-brand-forest-green shrink-0">
                              ${Number(product.input?.price || 0).toFixed(2)}
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-foreground line-clamp-2 leading-tight" title={product.input?.name}>
                            {product.input?.name}
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
                        {selectedProductUpcs.size} Product{selectedProductUpcs.size > 1 ? 's' : ''} Selected
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
                        onClick={() => setIsSplitBrandOpen(true)}
                        className="h-8 rounded-none bg-brand-forest-green hover:bg-brand-forest-green/90 text-white font-bold uppercase text-[10px] tracking-wider px-3"
                      >
                        Split & Assign Brand
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Management Panel (Detail) */}
            <ManagementPanel
              cohortId={activeCohortId}
              products={cohortProducts}
              cohortBrandObjects={cohortBrandObjects}
              onSuccess={() => onRefresh()}
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <Layers className="h-12 w-12 mb-2 opacity-20" />
            <h3 className="text-lg font-semibold text-foreground">Select a cohort</h3>
            <p className="mt-1 text-sm text-muted-foreground">Choose a cohort from the list to view its contents.</p>
          </div>
        )}
      </div>
      <BulkAssignBrandDialog
        open={isSplitBrandOpen}
        onOpenChange={setIsSplitBrandOpen}
        selectedCount={selectedProductUpcs.size}
        onConfirm={handleSplitBrandConfirm}
      />
    </div>
  );
}
