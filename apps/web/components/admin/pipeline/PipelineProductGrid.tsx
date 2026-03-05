'use client';

import { RefreshCw } from 'lucide-react';

import type { PipelineProduct, PipelineStatus } from '@/lib/pipeline';

import { PipelineProductCard } from './PipelineProductCard';

interface PipelineProductGridProps {
    products: PipelineProduct[];
    selectedSkus: Set<string>;
    onSelect: (sku: string, index: number, isShiftClick: boolean) => void;
    onView: (sku: string) => void;
    loading: boolean;
    hasMore: boolean;
    onLoadMore: () => void;
    onEnrich?: (sku: string) => void;
    showEnrichButton?: boolean;
    readOnly?: boolean;
    showBatchSelect?: boolean;
    currentStage?: PipelineStatus;
    emptyMessage?: string;
}

export function PipelineProductGrid({
    products,
    selectedSkus,
    onSelect,
    onView,
    loading,
    hasMore,
    onLoadMore,
    onEnrich,
    showEnrichButton = false,
    readOnly = false,
    showBatchSelect = false,
    currentStage,
    emptyMessage = 'No products available.',
}: PipelineProductGridProps) {
    if (loading && products.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center">
                <RefreshCw className="h-8 w-8 animate-spin text-gray-600" aria-label="Loading products" />
            </div>
        );
    }

    if (products.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
                <p className="text-gray-600">{emptyMessage}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {products.map((product, index) => (
                    <PipelineProductCard
                        key={product.sku}
                        product={product}
                        index={index}
                        isSelected={selectedSkus.has(product.sku)}
                        onSelect={onSelect}
                        onView={onView}
                        onEnrich={onEnrich}
                        showEnrichButton={showEnrichButton}
                        readOnly={readOnly}
                        showBatchSelect={showBatchSelect}
                        currentStage={currentStage}
                    />
                ))}
            </div>

            {hasMore && (
                <div className="flex justify-center">
                    <button
                        type="button"
                        onClick={onLoadMore}
                        disabled={loading}
                        className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading ? 'Loading...' : 'Load More'}
                    </button>
                </div>
            )}
        </div>
    );
}
