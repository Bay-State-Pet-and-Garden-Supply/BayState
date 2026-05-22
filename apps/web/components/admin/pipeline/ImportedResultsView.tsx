"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PipelineFilters } from "./PipelineFilters";
import { PipelineSearchField } from "./PipelineSearchField";
import { PipelineSidebarTable } from "./PipelineSidebarTable";
import { ManagementPanel } from "./management/ManagementPanel";
import { CohortBrandPicker } from "../cohorts/CohortBrandPicker";
import { toast } from "sonner";
import {
  updateProductsBatch,
  updateCohortBatch,
} from "@/app/admin/pipeline/batch-actions";

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
        enrichment_config: {
          official_domains: brand?.official_domains || [],
          // preserve existing enabled sources
          enabled_sources: cohortProducts[0]?.enrichment_config?.enabled_sources || [],
        },
      });
      if (!productResult.success) throw new Error(productResult.error);

      toast.success(brand ? `Brand assigned: ${brand.name}` : "Brand assignment cleared");
      onRefresh(true); // reload state
    } catch (error: any) {
      console.error("Failed to assign brand:", error);
      toast.error(error.message || "Failed to assign brand");
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
      <div className="flex min-h-[260px] w-full shrink-0 flex-col overflow-x-hidden border-b border-border bg-background xl:w-96 xl:min-w-[384px] xl:max-w-[384px] xl:border-b-0 xl:border-r">
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
          variant="imported"
        />
      </div>

      {/* Right Column: Master-Detail Area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-card xl:flex-row">
        {activeCohortId && cohortProducts.length > 0 ? (
          <>
            {/* Center: Product List/Preview (Master) */}
            <div className="flex min-h-[320px] flex-1 flex-col overflow-hidden border-b border-border xl:border-b-0 xl:border-r">
              {/* Header */}
              <div className="bg-card border-b border-border flex-shrink-0 z-10">
                <div className="flex flex-col gap-3 p-4 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex items-center gap-2">
                      <Layers className="h-5 w-5 text-primary shrink-0" />
                      <h2 className="text-xl font-semibold text-foreground line-clamp-1" title={activeCohortName}>
                        {activeCohortName}
                      </h2>
                      <div className="flex items-center gap-1">
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
                        {(!activeCohortBrand || !hasConfiguredDomains) && activeCohortId !== "ungrouped" && (
                          <div className="inline-flex items-center gap-1.5 bg-brand-gold/10 border border-brand-gold px-2 py-0.5">
                            <AlertCircle className="h-3 w-3 text-brand-burgundy animate-pulse" />
                            <span className="text-[9px] font-semibold text-brand-burgundy">
                              Action Required: {!activeCohortBrand ? "Assign Brand" : "Add Domains"}
                            </span>
                          </div>
                        )}
                      </div>
                      {activeCohortBrand && (
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <Badge variant="outline" className={cn(
                            "font-semibold rounded-none",
                            hasConfiguredDomains
                              ? "border-brand-forest-green text-brand-forest-green bg-brand-forest-green/10"
                              : "border-brand-gold text-brand-burgundy bg-brand-gold/10"
                          )}>
                            {activeCohortBrand}
                          </Badge>
                          {activeCohortBrandObject?.official_domains && activeCohortBrandObject.official_domains.length > 0 && (
                            <a
                              href={`https://${activeCohortBrandObject.official_domains[0]}`}
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

                {/* Inline Brand & Domain Settings Area */}
                {activeCohortId && activeCohortId !== "ungrouped" && (
                  <div className="px-4 py-3 sm:px-6 bg-muted/20 border-t border-border/40 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        Sync Brand
                      </span>
                      <CohortBrandPicker
                        value={activeCohortBrandObject}
                        onAssign={handleAssignBrand}
                        triggerClassName="h-8 rounded-none border border-border bg-background"
                      />
                    </div>

                    {activeCohortBrandObject && (
                      <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center md:gap-4 md:justify-end min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          {activeCohortBrandObject.official_domains && activeCohortBrandObject.official_domains.map(domain => (
                            <span
                              key={domain}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-background border border-border text-[10px] font-semibold text-foreground rounded-none"
                            >
                              <Globe className="h-3 w-3 text-muted-foreground" />
                              {domain}
                            </span>
                          ))}
                          
                          {(!activeCohortBrandObject.official_domains || activeCohortBrandObject.official_domains.length === 0) && (
                            <span className="text-[10px] font-bold text-brand-burgundy bg-brand-gold/10 border border-brand-gold px-1.5 py-0.5 uppercase italic">
                              No Domains Configured (AI / SERP extraction will be disabled)
                            </span>
                          )}
                        </div>

                        <div className="shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                            className="h-8 rounded-none border border-border bg-background text-[11px] font-semibold transition-all hover:bg-muted"
                          >
                            <a href="/admin/brands">
                              Configure Brand & Domains →
                            </a>
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>


              {/* Details Content (Product Preview Grid) */}
              <div className="flex-1 overflow-y-auto bg-background p-4 sm:p-6">
                <div className="max-w-4xl mx-auto space-y-4">
                  <h3 className="text-xs font-semibold text-foreground border-b border-border pb-2">Products in Cohort</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {cohortProducts.map(product => {
                      return (
                        <div
                          key={product.upc}
                          className="p-3 bg-card border flex flex-col gap-2 transition-colors group relative border-border"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
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
    </div>
  );
}
