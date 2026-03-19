'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { StageTabs } from './StageTabs';
import { ProductTable } from './ProductTable';
import { ScrapedResultsView } from './ScrapedResultsView';
import { BulkToolbar } from './BulkToolbar';
import { ScraperSelectDialog } from './ScraperSelectDialog';
import { ActiveRunsTab } from './ActiveRunsTab';
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

  // Fetch products when stage or search changes
  useEffect(() => {
    fetchProducts(currentStage, search);
    setSelectedSkus(new Set());
  }, [currentStage, fetchProducts, search]);

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

  // Handle bulk status transition (non-scrape stages)
  const handleBulkAction = async (nextStage: PipelineStatus) => {
    const skus = Array.from(selectedSkus);
    if (skus.length === 0) return;

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
          `Created scrape job for ${skus.length} product${skus.length > 1 ? 's' : ''} with ${scrapers.length} scraper${scrapers.length !== 1 ? 's' : ''}`,
          { description: `Job ID: ${data.jobIds?.[0]?.slice(0, 8) ?? 'unknown'}...` }
        );
        setIsScrapeDialogOpen(false);
        setSelectedSkus(new Set());
        await refreshAll();
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

      {/* Search bar — hidden for monitoring */}
      {currentStage !== 'monitoring' && (
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search by SKU or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {totalCount > 0 && (
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {totalCount} total product{totalCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Bulk Toolbar — hidden for monitoring */}
      {currentStage !== 'monitoring' && (
        <BulkToolbar
          selectedCount={selectedSkus.size}
          totalCount={totalCount}
          currentStage={currentStage}
          isLoading={isLoading}
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
        <ActiveRunsTab />
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