'use client';

import { useEffect, useState } from 'react';
import { Layers, Package, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PipelineProduct } from '@/lib/pipeline/types';
import type { Brand } from '@/lib/types';
import { BrandAssignmentSection } from './BrandAssignmentSection';
import { OfficialDomainsSection } from './OfficialDomainsSection';
import { DistributorSection } from './DistributorSection';
import { 
  updateProductsBatch, 
  updateCohortBatch, 
  updateBrandDomains 
} from '@/app/admin/pipeline/batch-actions';

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
  onSuccess 
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

  // Load credential statuses on mount
  useEffect(() => {
    let active = true;
    async function loadStatuses() {
      try {
        const slugs = ['phillips', 'orgill', 'petfoodex'];
        const results = await Promise.all(
          slugs.map(async (slug) => {
            const res = await fetch(`/api/admin/scrapers/${slug}/credentials`);
            if (!res.ok) throw new Error('Failed to load credentials for ' + slug);
            const data = await res.json();
            const login = data.statuses?.find((s: any) => s.type === 'login');
            const password = data.statuses?.find((s: any) => s.type === 'password');
            return {
              slug,
              configured: (login?.configured && password?.configured) ?? false,
            };
          })
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

  // Initialize state from cohort/products
  useEffect(() => {
    if (products.length > 0) {
      // 1. Resolve Brand
      let brand: Brand | null = null;
      if (cohortId && cohortBrandObjects[cohortId]) {
        brand = cohortBrandObjects[cohortId];
      } else {
        brand = products[0].cohort_brands || null;
      }
      setSelectedBrand(brand);

      // 2. Resolve Domains
      const firstProduct = products[0];
      const config = firstProduct.enrichment_config;
      if (config?.official_domains && config.official_domains.length > 0) {
        setDomains(config.official_domains);
      } else if (brand?.official_domains) {
        setDomains(brand.official_domains);
      } else {
        setDomains([]);
      }

      // 3. Resolve Scrapers
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

  // Sync local domains back into the selectedBrand object for the picker UI
  const handleDomainsChange = (newDomains: string[]) => {
    setDomains(newDomains);
    if (selectedBrand) {
      setSelectedBrand({
        ...selectedBrand,
        official_domains: newDomains
      });
    }
  };

  const handleBrandChange = (brand: Brand | null) => {
    setSelectedBrand(brand);
    if (brand?.official_domains) {
      setDomains(brand.official_domains);
    }
  };

  const toggleScraper = (id: string) => {
    setActiveScrapers(prev => 
      prev.includes(id) 
        ? prev.filter(s => s !== id) 
        : [...prev, id]
    );
  };

  const handleSave = async (startScraper: boolean = false) => {
    if (startScraper && (!selectedBrand || domains.length === 0)) {
      toast.error('Brand and Official Domains are required to start scraping.');
      return;
    }

    setIsSaving(true);
    try {
      const skus = products.map(p => p.sku);
      
      // 1. Update products in DB
      const productResult = await updateProductsBatch(skus, {
        brand_id: selectedBrand?.id || null,
        pipeline_status: undefined,
        enrichment_config: {
          enabled_sources: activeScrapers,
          official_domains: domains,
        }
      });

      if (!productResult.success) throw new Error(productResult.error);

      // 2. Update cohort if applicable
      if (cohortId && cohortId !== 'ungrouped') {
        const cohortResult = await updateCohortBatch(cohortId, {
          brand_id: selectedBrand?.id || null,
          brand_name: selectedBrand?.name || null,
        });
        if (!cohortResult.success) throw new Error(cohortResult.error);
      }

      // 3. Update Brand domains if changed (Global update)
      if (selectedBrand) {
        const brandResult = await updateBrandDomains(selectedBrand.id, domains);
        if (!brandResult.success) throw new Error(brandResult.error);
      }

      // 4. Actually trigger the extraction job if requested
      if (startScraper) {
        const response = await fetch('/api/admin/enrichment/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skus,
            config: {
              source_type: 'approved_source_extraction',
            },
          }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Failed to start extraction job');
        }
      }

      toast.success(startScraper ? 'Scraper initiated successfully!' : 'Assignments saved successfully.');
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
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground bg-card border-l border-border">
        <Package className="h-12 w-12 mb-2 opacity-20" />
        <h3 className="text-sm font-semibold text-foreground">No cohort selected</h3>
        <p className="text-[10px] font-semibold mt-1 uppercase tracking-widest">Select a cohort to manage its assignments.</p>
      </div>
    );
  }

  return (
    <div className="w-[400px] border-l border-border bg-card flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="text-[10px] font-bold text-brand-gold uppercase tracking-widest mb-1">Management Panel</div>
        <h2 className="text-sm font-bold truncate">
          {cohortId === 'ungrouped' ? 'Ungrouped Products' : `Batch: ${cohortId}`}
        </h2>
        <div className="text-[10px] text-muted-foreground mt-1 font-semibold uppercase tracking-tight">
          {products.length} Products included
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-8">
        <BrandAssignmentSection 
          selectedBrand={selectedBrand}
          onBrandChange={handleBrandChange}
        />

        <OfficialDomainsSection 
          domains={domains}
          onDomainsChange={handleDomainsChange}
        />

        <DistributorSection 
          activeScrapers={activeScrapers}
          onToggleScraper={toggleScraper}
          credentialStatuses={credentialStatuses}
        />
      </div>

      {/* Footer Action */}
      <div className="p-4 border-t border-border bg-muted/30">
        <Button 
          className="w-full rounded-none bg-brand-gold hover:bg-brand-gold/90 text-ledger-charcoal font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all h-12"
          disabled={isSaving}
          onClick={() => handleSave(true)}
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          SAVE & START SCRAPER
        </Button>
      </div>
    </div>
  );
}
