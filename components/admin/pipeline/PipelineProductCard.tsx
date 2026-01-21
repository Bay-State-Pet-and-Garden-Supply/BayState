'use client';

import type { PipelineProduct, PipelineStatus } from '@/lib/pipeline';
import { ChevronRight, Package, Settings2, Sparkles } from 'lucide-react';

interface PipelineProductCardProps {
    product: PipelineProduct;
    isSelected: boolean;
    onSelect: (sku: string) => void;
    onView: (sku: string) => void;
    onEnrich?: (sku: string) => void;
    showEnrichButton?: boolean;
    readOnly?: boolean;
    showBatchSelect?: boolean;
}

export function PipelineProductCard({
    product,
    isSelected,
    onSelect,
    onView,
    onEnrich,
    showEnrichButton = false,
    readOnly = false,
    showBatchSelect = false
}: PipelineProductCardProps) {
    const registerName = product.input?.name || product.sku;
    const cleanName = product.consolidated?.name;
    const price = product.consolidated?.price ?? product.input?.price ?? 0;
    const hasScrapedData = Object.keys(product.sources || {}).length > 0;

    // In read-only mode (Imported tab), show simplified view
    if (readOnly) {
        return (
            <div className={`rounded-lg border p-4 transition-colors ${showBatchSelect && isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}>
                <div className="flex items-start gap-3">
                    {showBatchSelect && (
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onSelect(product.sku)}
                            aria-label={`Select product ${product.sku}`}
                            className="mt-1 h-4 w-4 rounded border-gray-300"
                        />
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <Package className="h-4 w-4 text-gray-600 flex-shrink-0" />
                            <span className="text-xs font-mono text-gray-600 truncate">{product.sku}</span>
                        </div>

                        <div className="space-y-1">
                            <p className="font-medium text-gray-900 truncate" title={registerName}>
                                {registerName}
                            </p>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-4">
                            <span className="font-semibold text-green-600 shrink-0">${price.toFixed(2)}</span>
                            {onEnrich && (
                                <button
                                    onClick={() => onEnrich(product.sku)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#008850] rounded-lg hover:bg-[#2a7034] transition-colors whitespace-nowrap shrink-0"
                                >
                                    <Sparkles className="h-4 w-4" />
                                    Enhance
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Standard view with selection for other pipeline stages
    return (
        <div
            className={`rounded-lg border p-4 transition-colors ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
        >
            <div className="flex items-start gap-3">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onSelect(product.sku)}
                    aria-label={`Select product ${product.sku}`}
                    className="mt-1 h-4 w-4 rounded border-gray-300"
                />

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <Package className="h-4 w-4 text-gray-600 flex-shrink-0" />
                        <span className="text-xs font-mono text-gray-600 truncate">{product.sku}</span>
                        {hasScrapedData && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                                Scraped
                            </span>
                        )}
                    </div>

                    <div className="space-y-1">
                        <p className="font-medium text-gray-900 truncate" title={cleanName || registerName}>
                            {cleanName || registerName}
                        </p>
                        {cleanName && registerName !== cleanName && (
                            <p className="text-xs text-gray-600 truncate" title={registerName}>
                                Register: {registerName}
                            </p>
                        )}
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                        <span className="font-semibold text-green-600">${price.toFixed(2)}</span>
                        <div className="flex items-center gap-2">
                            {showEnrichButton && onEnrich && (
                                <button
                                    onClick={() => onEnrich(product.sku)}
                                    className="flex items-center gap-1 text-sm text-[#008850] hover:text-[#2a7034]"
                                    title="Configure enrichment sources"
                                >
                                    <Settings2 className="h-4 w-4" />
                                </button>
                            )}
                            <button
                                onClick={() => onView(product.sku)}
                                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                            >
                                View <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

