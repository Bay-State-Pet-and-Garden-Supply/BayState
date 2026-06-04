'use client';

import { useEffect, useState, useMemo } from 'react';
import { Layers, Save, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { PipelineProduct } from '@/lib/pipeline/types';
import type { Brand } from '@/lib/types';
import { DistributorSection } from './DistributorSection';
import { updateProductsBatch } from '@/app/admin/pipeline/batch-actions';

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
  const [activeScrapers, setActiveScrapers] = useState<string[]>([]);
  const [ocrEnabled, setOcrEnabled] = useState(true);
  const [credentialStatuses, setCredentialStatuses] = useState<Record<string, { configured: boolean; loading: boolean }>>({
    phillips: { configured: false, loading: true },
    orgill: { configured: false, loading: true },
    petfoodex: { configured: false, loading: true },
  });

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

  // Load distributor credential statuses
  useEffect(() => {
    let active = true;
    async function loadStatuses() {
      try {
        const slugs = ['phillips', 'orgill', 'petfoodex'];
        const results = await Promise.all(
          slugs.map(async (slug) => {
            const res = await fetch(`/api/admin/pipeline/scrapers/${slug}/credentials`);
            if (!res.ok) throw new Error('Failed to load credentials for ' + slug);
            const data = await res.json();
            const login = data.statuses?.find((status: any) => status.type === 'login');
            const password = data.statuses?.find((status: any) => status.type === 'password');
            return {
              slug,
              configured: (login?.configured && password?.configured) ?? false,
            };
          }),
        );
        if (active) {
          const newStatuses: Record<string, { configured: boolean; loading: boolean }> = {};
          results.forEach(({ slug, configured }) => {
            newStatuses[slug] = { configured, loading: false };
          });
          setCredentialStatuses(newStatuses);
        }
      } catch (err) {
        console.error('Failed to load credential statuses:', err);
        if (active) {
          setCredentialStatuses({
            phillips: { configured: false, loading: false },
            orgill: { configured: false, loading: false },
            petfoodex: { configured: false, loading: false },
          });
        }
      }
    }
    void loadStatuses();
    return () => {
      active = false;
    };
  }, []);

  // Determine if AI is available for at least one selected cohort
  const isAISerpEnabled = useMemo(() => {
    return selectedCohortsList.some(({ brand }) => {
      return brand?.official_domains && brand.official_domains.length > 0;
    });
  }, [selectedCohortsList]);

  const effectiveScrapers = isAISerpEnabled
    ? activeScrapers
    : activeScrapers.filter((scraper) => scraper !== 'official_brand');

  const toggleScraper = (id: string) => {
    setActiveScrapers((previous) => (
      previous.includes(id)
        ? previous.filter((scraper) => scraper !== id)
        : [...previous, id]
    ));
  };

  const handleStartBulkScrape = async () => {
    if (effectiveScrapers.length === 0) {
      toast.error('At least one extraction method must be selected to start scraping.');
      return;
    }

    if (totalProductsCount === 0) {
      toast.error('No products found in the selected cohorts.');
      return;
    }

    setIsSaving(true);
    try {
      const allUpcs: string[] = [];

      // 1. Update product configurations cohort-by-cohort to preserve brand domains
      for (const cohortId of selectedCohortIds) {
        const cohortProducts = groupedProducts?.groups[cohortId] || [];
        if (cohortProducts.length === 0) continue;

        const upcs = cohortProducts.map((p) => p.upc);
        allUpcs.push(...upcs);

        const brand = cohortBrandObjects[cohortId];
        const cohortDomains = brand?.official_domains || [];

        const productResult = await updateProductsBatch(upcs, {
          enrichment_config: {
            enabled_sources: effectiveScrapers,
            official_domains: cohortDomains,
          },
        });

        if (!productResult.success) {
          throw new Error(`Failed to update products for cohort ${cohortId}: ${productResult.error}`);
        }
      }

      if (allUpcs.length === 0) {
        throw new Error('No UPCs were resolved for scraping');
      }

      // 2. Start the enrichment jobs
      const hasAI = effectiveScrapers.includes('official_brand');
      const hasDistributors = effectiveScrapers.some((scraper) => scraper !== 'official_brand');

      let inferredExtractionMode: 'mixed' | 'distributor_only' | 'ai_only' = 'mixed';
      if (hasAI && hasDistributors) {
        inferredExtractionMode = 'mixed';
      } else if (hasAI) {
        inferredExtractionMode = 'ai_only';
      } else {
        inferredExtractionMode = 'distributor_only';
      }

      const response = await fetch('/api/admin/enrichment/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upcs: allUpcs,
          extractionMode: inferredExtractionMode,
          config: {
            source_type: 'approved_source_extraction',
            ocr: { enabled: ocrEnabled },
          },
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to start bulk extraction job');
      }

      let successMessage = `Scraper initiated successfully for ${selectedCohortIds.size} cohorts (${allUpcs.length} products)!`;
      if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
        successMessage = payload.message;
      }

      toast.success(successMessage);
      onSuccess();
    } catch (error: any) {
      console.error('Error starting bulk scrape:', error);
      toast.error(error.message || 'Failed to start bulk scrape.');
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
          <div className="max-h-36 overflow-y-auto border border-border bg-background/50 divide-y divide-border rounded-none p-1 space-y-1">
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

        <DistributorSection
          activeScrapers={activeScrapers}
          onToggleScraper={toggleScraper}
          credentialStatuses={credentialStatuses}
          isAISerpEnabled={isAISerpEnabled}
          ocrEnabled={ocrEnabled}
          onToggleOcr={() => setOcrEnabled(!ocrEnabled)}
        />
      </div>

      <div className="border-t border-border bg-muted/30 p-4 space-y-3">
        <Button
          className="h-11 w-full bg-brand-gold text-ledger-charcoal hover:bg-brand-gold/90 font-bold uppercase text-xs tracking-wider"
          disabled={isSaving}
          onClick={handleStartBulkScrape}
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Start Bulk Scrape
        </Button>
      </div>
    </div>
  );
}
