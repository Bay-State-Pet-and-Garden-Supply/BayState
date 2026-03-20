'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Activity, Brain } from 'lucide-react';
import { StageTabs } from './StageTabs';
import { ProductTable } from './ProductTable';
import { ScrapedResultsView } from './ScrapedResultsView';
import { BulkToolbar } from './BulkToolbar';
import { ScraperSelectDialog } from './ScraperSelectDialog';
import { ActiveRunsTab } from './ActiveRunsTab';
import { ActiveConsolidationsTab } from './ActiveConsolidationsTab';
import type { PipelineProduct, PipelineStatus, StatusCount } from '@/lib/pipeline/types';

interface PipelineClientProps {
  initialCounts: StatusCount[];
  initialProducts: PipelineProduct[];
  initialTotal: number;
}

export function PipelineClient({
  initialCounts,
  initialProducts,
  initialTotal,
}: PipelineClientProps) {
  const [currentStage, setCurrentStage] = useState<PipelineStatus>('imported');
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [products, setProducts] = useState<PipelineProduct[]>(initialProducts);
  const [counts, setCounts] = useState<StatusCount[]>(initialCounts);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [isLoading, setIsLoading] = useState(false);
  const [isScrapeDialogOpen, setIsScrapeDialogOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Fetch products for a specific stage
  const fetchProducts = useCallback(async (stage: PipelineStatus, searchTerm?: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        status: stage,
        limit: '500',
      });
      if (searchTerm) params.set('search', searchTerm);

      const res = await fetch(`/api/admin/pipeline?${params}`);
      if (!res.ok) throw new Error('Failed to fetch products');
      const data = await res.json();
      setProducts(data.products || []);
      setTotalCount(data.count || 0);
    } catch {
      toast.error('Failed to fetch products');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch counts for all stages
  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pipeline/counts');
      if (res.ok) {
        const data = await res.json();
        setCounts(data.counts || []);
      }
    } catch {
      // Silently fail for counts
    }
  }, []);

  // Refresh everything
  const refreshAll = useCallback(async () => {
    await Promise.all([fetchProducts(currentStage, search), fetchCounts()]);
  }, [currentStage, search, fetchProducts, fetchCounts]);

  const isFirstMount = useRef(true);

  // Fetch products when stage or search changes
  useEffect(() => {
    // Skip initial fetch since we have initialProducts from props
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    let isMounted = true;

    const performFetch = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          status: currentStage,
          limit: '500',
        });
        if (search) params.set('search', search);

        const res = await fetch(`/api/admin/pipeline?${params}`);
        if (!res.ok) throw new Error('Failed to fetch products');
        const data = await res.json();
        
        if (isMounted) {
          setProducts(data.products || []);
          setTotalCount(data.count || 0);
          setSelectedSkus(new Set());
        }
      } catch (error) {
        if (isMounted) {
          toast.error('Failed to fetch products');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    performFetch();

    return () => {
      isMounted = false;
    };
  }, [currentStage, search]);

  // Handle stage tab change
  const handleStageChange = (stage: PipelineStatus) => {
    setCurrentStage(stage);
    setSearch('');
  };

  // Toggle single product selection
  const handleSelectSku = (sku: string, selected: boolean) => {
    setSelectedSkus((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(sku);
      } else {
        next.delete(sku);
      }
      return next;
    });
  };

  // Select all visible products
  const handleSelectAllVisible = () => {
    setSelectedSkus(new Set(products.map((p) => p.sku)));
  };

  // Select ALL matching (including beyond visible page) via API
  const handleSelectAll = async () => {
    // If visible products cover the total, just select visible
    if (products.length >= totalCount) {
      handleSelectAllVisible();
      return;
    }

    try {
      const params = new URLSearchParams({
        status: currentStage,
        selectAll: 'true',
      });
      if (search) params.set('search', search);

      const res = await fetch(`/api/admin/pipeline?${params}`);
      if (res.ok) {
        const data = await res.json();
        const allSkus: string[] = data.skus || [];
        setSelectedSkus(new Set(allSkus));
        toast.success(`Selected all ${allSkus.length} products`);
      } else {
        handleSelectAllVisible();
      }
    } catch {
      handleSelectAllVisible();
    }
  };

  // Clear selection
  const handleClearSelection = () => {
    setSelectedSkus(new Set());
  };

  // Handle consolidation submission for scraped products
  const handleConsolidate = async (skus: string[]) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/consolidation/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skus,
          description: `Consolidation batch for ${skus.length} products`,
          auto_apply: false,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(
          `Submitted ${data.product_count} product${data.product_count !== 1 ? 's' : ''} for AI consolidation`,
          { description: `Batch ID: ${data.batch_id?.slice(0, 12) ?? 'unknown'}...` }
        );
        setSelectedSkus(new Set());
        setCurrentStage('monitoring');
        setSearch('');
        await fetchCounts();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to submit consolidation');
      }
    } catch {
      toast.error('Failed to submit consolidation');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle bulk status transition (non-scrape stages)
  const handleBulkAction = async (nextStage: PipelineStatus) => {
    const skus = Array.from(selectedSkus);
    if (skus.length === 0) return;

    // Intercept scraped → consolidated to call consolidation API
    if (currentStage === 'scraped' && nextStage === 'consolidated') {
      await handleConsolidate(skus);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/pipeline/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus, toStatus: nextStage }),
      });

      if (res.ok) {
        toast.success(`Moved ${skus.length} product${skus.length > 1 ? 's' : ''} to ${nextStage}`);
        setSelectedSkus(new Set());
        await refreshAll();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to move products');
      }
    } catch {
      toast.error('Failed to move products');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle stage reset (moving back and clearing results)
  const handleResetStage = async (previousStage: PipelineStatus) => {
    const skus = Array.from(selectedSkus);
    if (skus.length === 0) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/pipeline/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          skus, 
          toStatus: previousStage,
          resetResults: true 
        }),
      });

      if (res.ok) {
        toast.success(`Reset ${skus.length} product${skus.length > 1 ? 's' : ''} to ${previousStage}`);
        setSelectedSkus(new Set());
        await refreshAll();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to reset stage');
      }
    } catch {
      toast.error('Failed to reset stage');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle scrape dialog confirm — creates actual scraper jobs
  const handleScrapeConfirm = async (scrapers: string[], enrichmentMethod: 'scrapers' | 'ai_search') => {
    const skus = Array.from(selectedSkus);
    if (skus.length === 0) return;

    const isAdditionalScrape = currentStage === 'scraped';

    try {
      const res = await fetch('/api/admin/pipeline/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skus,
          scrapers,
          enrichment_method: enrichmentMethod,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(
          isAdditionalScrape
            ? `Started additional scrape for ${skus.length} product${skus.length > 1 ? 's' : ''}`
            : `Created scrape job for ${skus.length} product${skus.length > 1 ? 's' : ''} with ${scrapers.length} scraper${scrapers.length !== 1 ? 's' : ''}`,
          { description: `Job ID: ${data.jobIds?.[0]?.slice(0, 8) ?? 'unknown'}...` }
        );

        setIsScrapeDialogOpen(false);
        setSelectedSkus(new Set());

        if (isAdditionalScrape) {
          // Stay on scraped tab, refresh to show updated results when callback delivers
          setSearch('');
          await refreshAll();
        } else {
          // Navigate to monitoring tab for initial scrapes
          setCurrentStage('monitoring');
          setSearch('');
          await Promise.all([fetchCounts(), fetchProducts('monitoring')]);
        }
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to create scrape jobs');
      }
    } catch {
      toast.error('Failed to create scrape jobs');
    }
  };

  return (
    <div className="space-y-4">
      {/* Stage Tabs */}
      <StageTabs
        currentStage={currentStage}
        counts={counts}
        onStageChange={handleStageChange}
      />

      {/* Bulk Toolbar + Search bar — hidden for monitoring */}
      {currentStage !== 'monitoring' && (
        <BulkToolbar
          selectedCount={selectedSkus.size}
          totalCount={totalCount}
          currentStage={currentStage}
          isLoading={isLoading}
          search={search}
          onSearchChange={(value) => setSearch(value)}
          onClearSelection={handleClearSelection}
          onSelectAll={handleSelectAll}
          onBulkAction={handleBulkAction}
          onResetStage={handleResetStage}
          onOpenScrapeDialog={() => setIsScrapeDialogOpen(true)}
        />
      )}

      {/* Content Area */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      ) : currentStage === 'monitoring' ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="rounded-lg bg-[#008850]/10 p-2">
                <Activity className="h-5 w-5 text-[#008850]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Active Runs</h2>
                <p className="text-sm text-gray-600">Live scraper jobs currently running or queued.</p>
              </div>
            </div>
            <ActiveRunsTab />
          </section>
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="rounded-lg bg-purple-100 p-2">
                <Brain className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">AI Consolidations</h2>
                <p className="text-sm text-gray-600">Active consolidation batches and history.</p>
              </div>
            </div>
            <ActiveConsolidationsTab />
          </section>
        </div>
      ) : currentStage === 'scraped' ? (
        <ScrapedResultsView
          products={products}
          selectedSkus={selectedSkus}
          onSelectSku={handleSelectSku}
          onRefresh={refreshAll}
        />
      ) : (
        <ProductTable
          products={products}
          selectedSkus={selectedSkus}
          onSelectSku={handleSelectSku}
          onSelectAll={handleSelectAllVisible}
          onDeselectAll={handleClearSelection}
          currentStage={currentStage}
        />
      )}

      {/* Footer count — hidden for monitoring */}
      {!isLoading && currentStage !== 'monitoring' && products.length > 0 && (
        <div className="text-center text-sm text-muted-foreground">
          Showing {products.length} of {totalCount} product{totalCount !== 1 ? 's' : ''}
        </div>
      )}

      {/* Scraper Selection Dialog */}
      <ScraperSelectDialog
        open={isScrapeDialogOpen}
        onOpenChange={setIsScrapeDialogOpen}
        selectedSkuCount={selectedSkus.size}
        onConfirm={handleScrapeConfirm}
      />
    </div>
  );
}
