"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
 Package,
 Plus,
 Database,
 Layers,
 Edit2,
 AlertCircle,
} from "lucide-react";
import type { PipelineProduct } from "@/lib/pipeline/types";
import type { Brand } from "@/lib/types";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PipelineFilters } from "./PipelineFilters";
import { PipelineSearchField } from "./PipelineSearchField";
import { PipelineSidebarTable } from "./PipelineSidebarTable";

interface ImportedResultsViewProps {
 products: PipelineProduct[];
 selectedSkus: Set<string>;
 onSelectSku: (
 sku: string,
 selected: boolean,
 index?: number,
 isShiftClick?: boolean,
 visibleProducts?: PipelineProduct[],
 ) => void;
 onSelectAll?: (skus: string[]) => void;
 onDeselectAll?: (skus: string[]) => void;
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
 selectedSkus,
 onSelectSku,
 onSelectAll,
 onDeselectAll,
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
    return [...products].sort((a, b) => a.sku.localeCompare(b.sku));
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

 // Handle cohort change from sidebar
 const handleCohortChange = (cohortId: string) => {
 setPreferredCohortId(cohortId);
 };

 // 5. Render logic
 return (
 <div data-testid="product-table" className="flex flex-1 min-h-0 border border-border rounded-none overflow-hidden bg-card max-w-full">
 {/* Left Column: Product List */}
 <div className="w-96 min-w-[384px] max-w-[384px] border-r border-border flex flex-col shrink-0 bg-background overflow-x-hidden">
 <div className="flex flex-col border-b border-border bg-card">
 <div className="flex items-center gap-2 p-2">
 <label className="flex shrink-0 items-center justify-center h-9 w-9 border border-border bg-card hover:bg-muted cursor-pointer transition-colors">
 <Checkbox
 checked={
 sortedProducts.length > 0 &&
 sortedProducts.every((p) => selectedSkus.has(p.sku))
 ? true
 : sortedProducts.some((p) => selectedSkus.has(p.sku))
 ? "indeterminate"
 : false
 }
 onCheckedChange={(checked) => {
 if (checked) {
 onSelectAll?.(sortedProducts.map((p) => p.sku));
 } else {
 onDeselectAll?.(sortedProducts.map((p) => p.sku));
 }
 }}
 className="h-4 w-4 rounded-none border border-border accent-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background data-[state=indeterminate]:bg-foreground data-[state=indeterminate]:text-background"
 />
 </label>
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
 className="h-9 w-9 shrink-0 p-0 border border-border"
 />
 ) : null}
 </div>

 {(onImportCsv || onManualAdd) && (
 <div className="flex items-center gap-2 px-2 pb-2">
 {onImportCsv && (
 <Button
 variant="outline"
 size="sm"
 onClick={onImportCsv}
 disabled={isLoading}
 className="flex-1 h-8 border border-border text-foreground hover:bg-muted text-[10px] font-semibold transition-all"
 >
 <Database className="mr-1.5 h-3.5 w-3.5" />
 Import CSV
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
 selectedSkus={selectedSkus}
 preferredSku={null}
 preferredCohortId={preferredCohortId}
 onSelectSku={onSelectSku}
 onSelectAll={onSelectAll}
 onDeselectAll={onDeselectAll}
 onPreferredSkuChange={() => {}}
 onPreferredCohortChange={handleCohortChange}
 variant="imported"
 />
 </div>

 {/* Right Column: Cohort Summary */}
 <div className="flex-1 flex flex-col bg-card overflow-hidden">
 {activeCohortId && cohortProducts.length > 0 ? (
 <>
 {/* Header */}
 <div className="bg-card border-b border-border flex-shrink-0 z-10">
 <div className="p-4 sm:p-6 flex justify-between items-start">
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
 <Badge variant="outline" className={cn(
 "font-semibold rounded-none",
 hasConfiguredDomains
 ? "border-brand-forest-green text-brand-forest-green bg-brand-forest-green/10"
 : "border-brand-gold text-brand-burgundy bg-brand-gold/10"
 )}>
 {activeCohortBrand}
 </Badge>
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
 <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background">
 <div className="max-w-4xl mx-auto space-y-4">
 <h3 className="text-xs font-semibold text-foreground border-b border-border pb-2">Products in Cohort</h3>
 
 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
 {cohortProducts.map(product => (
 <div key={product.sku} className="p-3 bg-card border border-border flex flex-col gap-2 transition-colors hover:border-foreground">
 <div className="flex items-start justify-between gap-2">
 <div className="text-[9px] font-semibold text-muted-foreground bg-background px-1 py-0.5 rounded-none border border-border shrink-0">
 {product.sku}
 </div>
 <div className="text-[10px] font-semibold text-brand-forest-green shrink-0">
 ${Number(product.input?.price || 0).toFixed(2)}
 </div>
 </div>
 <div className="text-sm font-semibold text-foreground line-clamp-2 leading-tight" title={product.input?.name}>
 {product.input?.name}
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 </>
 ) : (
 <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
 <Layers className="h-12 w-12 mb-2 opacity-20" />
 <h3 className="text-lg font-semibold text-foreground">Select a cohort</h3>
 <p className="text-[10px] font-semibold mt-1">Choose a cohort from the list to view its contents.</p>
 </div>
 )}
 </div>
 </div>
 );
}
