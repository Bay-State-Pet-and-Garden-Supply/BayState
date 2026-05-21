'use client';

import { useEffect, useState } from 'react';
import { Package, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { PipelineProduct } from '@/lib/pipeline/types';
import type { Brand } from '@/lib/types';
import { DistributorSection } from './DistributorSection';
import { updateProductsBatch } from '@/app/admin/pipeline/batch-actions';

interface ManagementPanelProps {
  cohortId: string | null;
  products: PipelineProduct[];
  cohortBrandObjects?: Record<string, Brand>;
  onSuccess: () => void;
}

export function ManagementPanel({
  cohortId,
  products,
  cohortBrandObjects = {},
  onSuccess,
}: ManagementPanelProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [activeScrapers, setActiveScrapers] = useState<string[]>([]);
  const [credentialStatuses, setCredentialStatuses] = useState<Record<string, { configured: boolean; loading: boolean }>>({
    phillips: { configured: false, loading: true },
    orgill: { configured: false, loading: true },
    petfoodex: { configured: false, loading: true },
  });

  const [forceRefresh, setForceRefresh] = useState(false);

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

  useEffect(() => {
    if (products.length > 0) {
      let brand: Brand | null = null;
      if (cohortId && cohortBrandObjects[cohortId]) {
        brand = cohortBrandObjects[cohortId];
      } else {
        brand = products[0].cohort_brands || null;
      }
      setSelectedBrand(brand);

      const firstProduct = products[0];
      const config = firstProduct.enrichment_config;
      if (config?.official_domains && config.official_domains.length > 0) {
        setDomains(config.official_domains);
      } else if (brand?.official_domains) {
        setDomains(brand.official_domains);
      } else {
        setDomains([]);
      }

      if (config?.enabled_sources) {
        setActiveScrapers(config.enabled_sources);
      } else {
        setActiveScrapers([]);
      }
    } else {
      setSelectedBrand(null);
      setDomains([]);
      setActiveScrapers([]);
    }
  }, [cohortId, products.length, cohortBrandObjects]);

  const isAISerpEnabled = Boolean(selectedBrand && domains && domains.length > 0);

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

  const handleSave = async (startScraper: boolean = false) => {
    if (startScraper && effectiveScrapers.length === 0) {
      toast.error('At least one extraction method must be selected to start scraping.');
      return;
    }

    setIsSaving(true);
    try {
      const skus = products.map((product) => product.sku);

      const productResult = await updateProductsBatch(skus, {
        brand_id: selectedBrand?.id || null,
        pipeline_status: undefined,
        enrichment_config: {
          enabled_sources: effectiveScrapers,
          official_domains: domains,
        },
      });

      if (!productResult.success) throw new Error(productResult.error);

      let successMessage = startScraper ? 'Scraper initiated successfully!' : 'Assignments saved successfully.';

      if (startScraper) {
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
            skus,
            extractionMode: inferredExtractionMode,
            forceRefresh,
            config: {
              source_type: 'approved_source_extraction',
            },
          }),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to start extraction job');
        }

        if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
          successMessage = payload.message;
        }
      }

      toast.success(successMessage);
      onSuccess();
    } catch (error: any) {
      console.error('Error saving assignments:', error);
      toast.error(error.message || 'Failed to save assignments.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!cohortId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center border-t border-border bg-card p-6 text-center text-muted-foreground xl:border-l xl:border-t-0">
        <Package className="mb-2 h-12 w-12 opacity-20" />
        <h3 className="text-sm font-semibold text-foreground">No cohort selected</h3>
        <p className="mt-1 text-sm text-muted-foreground">Select a cohort to manage its assignments.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full shrink-0 flex-col border-t border-border bg-card xl:w-[400px] xl:border-l xl:border-t-0">
      <div className="border-b border-border bg-muted/30 p-4">
        <div className="mb-1 text-xs font-medium text-primary">Management</div>
        <h2 className="truncate text-sm font-semibold text-foreground">
          {cohortId === 'ungrouped' ? 'Ungrouped Products' : `Batch: ${cohortId}`}
        </h2>
        <div className="mt-1 text-sm text-muted-foreground">
          {products.length} Products included
        </div>
      </div>

      <div className="flex-1 space-y-8 overflow-y-auto p-4">
        <DistributorSection
          activeScrapers={activeScrapers}
          onToggleScraper={toggleScraper}
          credentialStatuses={credentialStatuses}
          isAISerpEnabled={isAISerpEnabled}
        />
      </div>

      <div className="border-t border-border bg-muted/30 p-4 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={forceRefresh}
            onCheckedChange={(checked) => setForceRefresh(checked === true)}
            className="h-4 w-4"
          />
          <span className="text-xs font-medium text-muted-foreground">Force refresh existing data</span>
        </label>

        <Button
          className="h-11 w-full bg-brand-gold text-ledger-charcoal hover:bg-brand-gold/90"
          disabled={isSaving}
          onClick={() => handleSave(true)}
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save and start scraper
        </Button>
      </div>
    </div>
  );
}
