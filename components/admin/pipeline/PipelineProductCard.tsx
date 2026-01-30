'use client';

import type { PipelineProduct, PipelineStatus } from '@/lib/pipeline';
import { 
  ChevronRight, 
  Package, 
  Settings2, 
  Sparkles,
  Upload,
  Brain,
  CheckCircle2,
  Globe,
  AlertCircle,
  TrendingUp,
  Database
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface PipelineProductCardProps {
    product: PipelineProduct;
    isSelected: boolean;
    onSelect: (sku: string) => void;
    onView: (sku: string) => void;
    onEnrich?: (sku: string) => void;
    showEnrichButton?: boolean;
    readOnly?: boolean;
    showBatchSelect?: boolean;
    currentStage?: PipelineStatus;
}

const stageConfig: Record<PipelineStatus, { 
    icon: React.ElementType;
    label: string;
    color: string;
    bgColor: string;
    description: string;
}> = {
    staging: { 
        icon: Upload, 
        label: 'Imported', 
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        description: 'Needs enhancement'
    },
    scraped: { 
        icon: Sparkles, 
        label: 'Enhanced', 
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        description: 'Scraped & enriched'
    },
    consolidated: { 
        icon: Brain, 
        label: 'AI Ready', 
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        description: 'Ready for review'
    },
    approved: { 
        icon: CheckCircle2, 
        label: 'Verified', 
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        description: 'Human approved'
    },
    published: { 
        icon: Globe, 
        label: 'Live', 
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-100',
        description: 'Published'
    },
    failed: { 
        icon: AlertCircle, 
        label: 'Failed', 
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        description: 'Needs retry'
    },
};

export function PipelineProductCard({
    product,
    isSelected,
    onSelect,
    onView,
    onEnrich,
    showEnrichButton = false,
    readOnly = false,
    showBatchSelect = false,
    currentStage
}: PipelineProductCardProps) {
    const registerName = product.input?.name || product.sku;
    const cleanName = product.consolidated?.name;
    const price = product.consolidated?.price ?? product.input?.price ?? 0;
    const hasScrapedData = Object.keys(product.sources || {}).length > 0;
    const confidenceScore = product.confidence_score;
    const stage = currentStage || product.pipeline_status;
    const stageInfo = stageConfig[stage];

    // In read-only mode (Imported tab), show simplified view
    if (readOnly) {
        return (
            <div 
                role="article"
                aria-label={`Product ${product.sku}${showBatchSelect && isSelected ? ', selected' : ''}`}
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (showBatchSelect) {
                            onSelect(product.sku);
                        }
                    }
                }}
                className={`rounded-lg border p-4 transition-colors outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${showBatchSelect && isSelected
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
                            <span className="font-semibold text-green-600 shrink-0">{formatCurrency(price)}</span>
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
            role="article"
            aria-label={`Product ${product.sku}${isSelected ? ', selected' : ''}`}
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (showBatchSelect) {
                        onSelect(product.sku);
                    } else {
                        onView(product.sku);
                    }
                }
            }}
            className={`rounded-lg border p-4 transition-colors outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
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
                    {/* Header: SKU + Stage Badge */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Package className="h-4 w-4 text-gray-600 flex-shrink-0" />
                        <span className="text-xs font-mono text-gray-600 truncate">{product.sku}</span>
                        
                        {/* ETL Stage Badge */}
                        {(() => {
                            const StageIcon = stageInfo.icon;
                            return (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${stageInfo.bgColor} ${stageInfo.color} border`}>
                                    <StageIcon className="h-3 w-3" />
                                    {stageInfo.label}
                                </span>
                            );
                        })()}
                        
                        {/* Confidence Score Badge */}
                        {confidenceScore !== undefined && confidenceScore > 0 && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                confidenceScore >= 0.9 
                                    ? 'bg-green-100 text-green-700 border border-green-200' 
                                    : confidenceScore >= 0.7 
                                        ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                                        : 'bg-red-100 text-red-700 border border-red-200'
                            }`}>
                                <TrendingUp className="h-3 w-3" />
                                {(confidenceScore * 100).toFixed(0)}%
                            </span>
                        )}
                        
                        {/* Data Source Indicator */}
                        {hasScrapedData && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                <Database className="h-3 w-3" />
                                Enriched
                            </span>
                        )}
                    </div>

                    {/* Product Names */}
                    <div className="space-y-1">
                        <p className="font-medium text-gray-900 truncate" title={cleanName || registerName}>
                            {cleanName || registerName}
                        </p>
                        {cleanName && registerName !== cleanName && (
                            <p className="text-xs text-gray-500 truncate" title={registerName}>
                                Original: {registerName}
                            </p>
                        )}
                    </div>

                    {/* Processing Status Bar */}
                    <div className="mt-3 flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-1">
                            {(['staging', 'scraped', 'consolidated', 'approved', 'published'] as PipelineStatus[]).map((s, idx) => {
                                const isStageDone = ['staging', 'scraped', 'consolidated', 'approved', 'published'].indexOf(stage) >= idx;
                                const isCurrentStage = stage === s;
                                return (
                                    <div 
                                        key={s} 
                                        className={`h-1.5 flex-1 rounded-full ${
                                            isCurrentStage 
                                                ? 'bg-blue-500 ring-2 ring-blue-200' 
                                                : isStageDone 
                                                    ? 'bg-green-400' 
                                                    : 'bg-gray-200'
                                        }`}
                                        title={stageConfig[s].label}
                                    />
                                );
                            })}
                        </div>
                    </div>

                    {/* Footer: Price + Actions */}
                    <div className="mt-3 flex items-center justify-between">
                        <span className="font-semibold text-green-600">{formatCurrency(price)}</span>
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
                                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
                            >
                                Review <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

