'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { StageTabs } from './StageTabs';
import { ProductCard } from './ProductCard';
import { BulkToolbar } from './BulkToolbar';
import type { PipelineProduct, PipelineStatus, StatusCount } from '@/lib/pipeline/types';

interface PipelineClientProps {
  initialCounts: StatusCount[];
  initialProducts: PipelineProduct[];
}

export function PipelineClient({
  initialCounts,
  initialProducts,
}: PipelineClientProps) {
  const [currentStage, setCurrentStage] = useState<PipelineStatus>('imported');
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [products, setProducts] = useState<PipelineProduct[]>(initialProducts);
  const [counts, setCounts] = useState<StatusCount[]>(initialCounts);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch products for a specific stage
  const fetchProducts = useCallback(async (stage: PipelineStatus) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/pipeline?status=${stage}&limit=50`);
      if (!res.ok) {
        throw new Error('Failed to fetch products');
      }
      const data = await res.json();
      setProducts(data.products || []);
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
      // Silently fail for counts - not critical
    }
  }, []);

  // Fetch products when stage changes
  useEffect(() => {
    fetchProducts(currentStage);
    setSelectedProducts(new Set());
  }, [currentStage, fetchProducts]);

  // Handle stage tab change
  const handleStageChange = (stage: PipelineStatus) => {
    setCurrentStage(stage);
  };

  // Handle product selection toggle
  const handleProductSelect = (sku: string, selected: boolean) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(sku);
      } else {
        next.delete(sku);
      }
      return next;
    });
  };

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedProducts(new Set());
  };

  // Handle single product transition
  const handleTransition = async (sku: string, nextStage: PipelineStatus) => {
    try {
      const res = await fetch('/api/admin/pipeline/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, toStatus: nextStage }),
      });

      if (res.ok) {
        toast.success('Product transitioned successfully');
        fetchProducts(currentStage);
        fetchCounts();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to transition product');
      }
    } catch {
      toast.error('Failed to transition product');
    }
  };

  // Handle bulk transition
  const handleBulkAction = async (nextStage: PipelineStatus) => {
    const skus = Array.from(selectedProducts);
    if (skus.length === 0) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/pipeline/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus, newStatus: nextStage }),
      });

      if (res.ok) {
        toast.success(`Moved ${skus.length} product${skus.length > 1 ? 's' : ''} successfully`);
        setSelectedProducts(new Set());
        fetchProducts(currentStage);
        fetchCounts();
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

  // Handle viewing product details (placeholder for now)
  const handleViewProduct = (sku: string) => {
    // TODO: Open product detail modal
    console.log('View product:', sku);
  };

  return (
    <div className="space-y-6">
      {/* Stage Tabs */}
      <StageTabs
        currentStage={currentStage}
        counts={counts}
        onStageChange={handleStageChange}
      />

      {/* Bulk Toolbar */}
      <BulkToolbar
        selectedCount={selectedProducts.size}
        currentStage={currentStage}
        isLoading={isLoading}
        onClearSelection={handleClearSelection}
        onBulkAction={handleBulkAction}
      />

      {/* Products Grid */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-muted-foreground">Loading products...</div>
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-12 text-center">
          <p className="text-muted-foreground">No products in this stage.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard
              key={product.sku}
              product={product}
              isSelected={selectedProducts.has(product.sku)}
              onSelect={handleProductSelect}
              onAction={handleTransition}
              onView={handleViewProduct}
            />
          ))}
        </div>
      )}

      {/* Product Count */}
      {!isLoading && products.length > 0 && (
        <div className="text-center text-sm text-muted-foreground">
          Showing {products.length} product{products.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}