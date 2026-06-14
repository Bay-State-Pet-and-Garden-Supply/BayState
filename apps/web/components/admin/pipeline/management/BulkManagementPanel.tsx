'use client';

import { useEffect, useState, useMemo } from 'react';
import { Layers, Save, Loader2, X, CheckCircle2, AlertCircle, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import type { PipelineProduct } from '@/lib/pipeline/types';
import type { Brand } from '@/lib/types';

interface BulkManagementPanelProps {
  selectedCohortIds: Set<string>;
  groupedProducts?: {
    groups: Record<string, PipelineProduct[]>;
    cohortIds: string[];
    names?: Record<string, string>;
  };
  cohortBrandObjects?: Record<string, Brand>;
  onClearSelection: () => void;
  onSuccess: () => void;
}

export function BulkManagementPanel({
  selectedCohortIds,
  groupedProducts,
  cohortBrandObjects = {},
  onClearSelection,
  onSuccess,
}: BulkManagementPanelProps) {
  const [isSaving, setIsSaving] = useState(false);

  // Calculate statistics for selected cohorts
  const selectedCohortsList = useMemo(() => {
    if (!groupedProducts) return [];
    return Array.from(selectedCohortIds).map((id) => {
      const products = groupedProducts.groups[id] || [];
      const name = groupedProducts.names?.[id] || (id === 'ungrouped' ? 'Ungrouped Products' : `Cohort ${id.slice(0, 8)}`);
      const brand = cohortBrandObjects[id] || null;
      return { id, name, count: products.length, brand };
    });
  }, [selectedCohortIds, groupedProducts, cohortBrandObjects]);

  const totalProductsCount = useMemo(() => {
    return selectedCohortsList.reduce((acc, curr) => acc + curr.count, 0);
  }, [selectedCohortsList]);

  // Check if all selected cohorts have source cascade configured
  const allCascadesConfigured = useMemo(() => {
    return selectedCohortsList.every(({ brand }) => {
      return brand?.id && brand?.source_cascade_configured_at;
    });
  }, [selectedCohortsList]);

  const unconfiguredBrands = useMemo(() => {
    return selectedCohortsList
      .filter(({ brand }) => !brand?.id || !brand?.source_cascade_configured_at)
      .map(({ name }) => name);
  }, [selectedCohortsList]);

  const handleStartBulkExtraction = async () => {
    if (totalProductsCount === 0) {
      toast.error('No products found in the selected cohorts.');
      return;
    }

    setIsSaving(true);
    try {
      const allUpcs: string[] = [];
      for (const cohortId of selectedCohortIds) {
        const cohortProducts = groupedProducts?.groups[cohortId] || [];
        if (cohortProducts.length === 0) continue;
        allUpcs.push(...cohortProducts.map((p) => p.upc));
      }

      if (allUpcs.length === 0) {
        throw new Error('No UPCs were resolved for extraction');
      }

      const response = await fetch('/api/admin/pipeline/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upcs: allUpcs,
          toStatus: 'extracting',
          resetResults: true,
        }),
      });

      if (response.status === 404) {
        toast.error("The enrichment pipeline has been replaced by the source cascade.");
        setIsSaving(false);
        return;
      }

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to start bulk extraction');
      }

      toast.success(`Extraction started for ${selectedCohortIds.size} cohorts (${allUpcs.length} products)!`, {
        description: `Job ID: ${(payload.jobId || '').slice(0, 8)}...`,
      });
      onSuccess();
    } catch (error: any) {
      console.error('Error starting bulk extraction:', error);
      toast.error(error.message || 'Failed to start bulk extraction.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full w-full shrink-0 flex-col border-t border-border bg-card xl:w-[320px] xl:border-l xl:border-t-0 animate-in slide-in-from-right-5 duration-300">
      <div className="border-b border-border bg-muted/30 p-4 relative">
        <button
          onClick={onClearSelection}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1 transition-colors"
          title="Clear Selection"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-1 text-xs font-medium text-brand-forest-green flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" /> Bulk Action Mode
        </div>
        <h2 className="truncate text-sm font-semibold text-foreground">
          {selectedCohortIds.size} Cohorts Selected
        </h2>
        <div className="mt-1 text-xs font-semibold text-muted-foreground">
          {totalProductsCount} Products total
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {/* Selected Cohorts List Summary */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-muted-foreground" />
            Selected Batches
          </label>
          <div className="max-h-36 overflow-y-auto border border-border bg-background/50 divide-y divide-border p-1 space-y-1">
            {selectedCohortsList.map((cohort) => (
              <div key={cohort.id} className="flex items-center justify-between py-1.5 px-2 text-[10px] font-medium">
                <span className="truncate max-w-[160px] text-foreground" title={cohort.name}>
                  {cohort.name}
                </span>
                <span className="text-muted-foreground font-mono bg-muted/40 px-1 border border-border">
                  {cohort.count} items
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Cascade Status Summary */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-muted-foreground" />
            Source Cascade Status
          </label>

          {allCascadesConfigured ? (
            <div className="flex items-center gap-3 p-3 border border-brand-forest-green bg-brand-forest-green/5">
              <CheckCircle2 className="h-4 w-4 text-brand-forest-green shrink-0" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-foreground">All brands configured</span>
                <span className="text-[9px] text-brand-forest-green font-semibold mt-0.5">
                  Source cascades ready for all selected cohorts
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col p-3 border border-dashed border-destructive/45 bg-destructive/[0.01]">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-foreground">Cascade not configured</span>
                  <span className="text-[9px] text-destructive font-semibold mt-0.5">
                    {unconfiguredBrands.length > 0
                      ? `Needs setup: ${unconfiguredBrands.join(', ')}`
                      : 'Some brands need source cascade configuration'}
                  </span>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-border/50 flex justify-end">
                <Link
                  href="/admin/brands"
                  className="text-[9px] font-bold text-brand-burgundy hover:underline flex items-center gap-1 transition-colors"
                >
                  <Settings2 className="h-3 w-3" />
                  Configure in Brand Settings
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-muted/30 p-4 space-y-3">
        <Button
          className="h-11 w-full bg-brand-gold text-ledger-charcoal hover:bg-brand-gold/90 font-bold uppercase text-xs tracking-wider"
          disabled={isSaving || !allCascadesConfigured}
          onClick={handleStartBulkExtraction}
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Start Bulk Extraction
        </Button>
      </div>
    </div>
  );
}
