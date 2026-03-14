'use client';

import type { PipelineProduct, PipelineStatus, NewPipelineStatus } from '@/lib/pipeline';
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
    Database,
    ImageIcon
} from 'lucide-react';
import Image from 'next/image';
import { formatCurrency } from '@/lib/utils';

interface PipelineProductCardProps {
    product: PipelineProduct;
    index: number;
    isSelected: boolean;
    onSelect: (sku: string, index: number, isShiftClick: boolean) => void;
    onView: (sku: string) => void;
    onEnrich?: (sku: string) => void;
    onImageSelection?: (sku: string) => void;
    showEnrichButton?: boolean;
    showImageSelectionButton?: boolean;
    readOnly?: boolean;
    showBatchSelect?: boolean;
    currentStage?: PipelineStatus | NewPipelineStatus;
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

const newStageConfig: Record<NewPipelineStatus, {
    icon: React.ElementType;
    label: string;
    color: string;
    bgColor: string;
    description: string;
}> = {
    registered: {
        icon: Upload,
        label: 'Registered',
        color: 'text-orange-600',
        bgColor: 'bg-orange-100',
        description: 'Imported & registered'
    },
    enriched: {
        icon: Sparkles,
        label: 'Enriched',
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        description: 'Data enriched'
    },
    finalized: {
        icon: CheckCircle2,
        label: 'Finalized',
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        description: 'Ready for export'
    },
};

export function PipelineProductCard({
    product,
    index,
    isSelected,
    onSelect,
    onView,
    onEnrich,
    onImageSelection,
    showEnrichButton = false,
    showImageSelectionButton = false,
    readOnly = false,
    showBatchSelect = false,
    currentStage
}: PipelineProductCardProps) {
    const handleCheckboxChange = (e: React.FormEvent<HTMLInputElement>) => {
        const nativeEvent = e.nativeEvent as unknown as MouseEvent;
        const isShiftClick = nativeEvent.shiftKey;
        onSelect(product.sku, index, isShiftClick);
    };
    const registerName = product.input?.name || product.sku;
    const cleanName = product.consolidated?.name;
    const price = product.consolidated?.price ?? product.input?.price ?? 0;
    const hasScrapedData = Object.keys(product.sources || {}).length > 0;
    const confidenceScore = product.confidence_score;
    const stage = currentStage || product.pipeline_status;
    // Check if this is a new pipeline status
    const isNewPipelineStatus = (s: string): s is NewPipelineStatus => {
        return s === 'registered' || s === 'enriched' || s === 'finalized';
    };
    const stageInfo = isNewPipelineStatus(stage) ? newStageConfig[stage] : stageConfig[stage as PipelineStatus];
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
                            onSelect(product.sku, index, false);
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
                            onChange={handleCheckboxChange}
                            aria-label={`Select product ${product.sku}`}
                            className="mt-1 h-4 w-4 rounded border-gray-300 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
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
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Storefront-style view for consolidated and later stages
    if (stage === 'consolidated' || stage === 'approved' || stage === 'published') {
        const imageSrc = product.consolidated?.images?.[0]?.trim();
        const hasValidImage = Boolean(imageSrc) && (imageSrc?.startsWith('/') || imageSrc?.startsWith('http'));

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
                            onSelect(product.sku, index, false);
                        } else {
                            onView(product.sku);
                        }
                    }
                }}
                className={`group relative h-full rounded-xl border transition-all duration-200 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isSelected ? 'border-blue-500 shadow-md ring-1 ring-blue-500' : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-lg'
                    }`}
            >
                {/* Select Checkbox overlaid on image */}
                <div className="absolute top-3 left-3 z-20">
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                            e.stopPropagation();
                            handleCheckboxChange(e);
                        }}
                        aria-label={`Select product ${product.sku}`}
                        className="h-5 w-5 rounded border-gray-300 shadow-sm cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    />
                </div>

                <div
                    className="flex h-full flex-col cursor-pointer"
                    onClick={() => onView(product.sku)}
                >
                    {/* Product Image */}
                    <div className="relative aspect-square w-full overflow-hidden bg-zinc-50 border-b border-zinc-100">
                        {hasValidImage ? (
                            <Image
                                src={imageSrc!}
                                alt={cleanName || registerName}
                                fill
                                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                        ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-zinc-300">
                                <ImageIcon className="h-10 w-10 text-zinc-300" />
                                <span className="text-xs font-medium text-zinc-400">No Image</span>
                            </div>
                        )}

                        {/* Badges overlaid */}
                        <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end z-10">
                            {(() => {
                                const StageIcon = stageInfo.icon;
                                return (
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shadow-sm ${stageInfo.bgColor} ${stageInfo.color} border border-white/20 backdrop-blur-md`}>
                                        <StageIcon className="h-3.5 w-3.5" />
                                        {stageInfo.label}
                                    </span>
                                );
                            })()}

                            {confidenceScore !== undefined && confidenceScore > 0 && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm ${confidenceScore >= 0.9
                                        ? 'bg-green-100/90 text-green-700 border-green-200'
                                        : confidenceScore >= 0.7
                                            ? 'bg-yellow-100/90 text-yellow-700 border-yellow-200'
                                            : 'bg-red-100/90 text-red-700 border-red-200'
                                    } backdrop-blur-md border`}>
                                    <TrendingUp className="h-3 w-3" />
                                    {(confidenceScore * 100).toFixed(0)}%
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Product Info */}
                    <div className="flex flex-1 flex-col p-4 bg-white">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-mono font-semibold text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">{product.sku}</span>
                        </div>

                        <h3 className="mb-2 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight text-zinc-900 group-hover:text-blue-600 transition-colors" title={cleanName || registerName}>
                            {cleanName || registerName}
                        </h3>

                        <div className="mt-auto pt-2 flex items-center justify-between">
                            <span className="text-lg font-bold tracking-tight text-zinc-900">
                                {formatCurrency(price)}
                            </span>

                            <div className="text-xs font-medium text-blue-600 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                Review <ChevronRight className="h-3 w-3" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Standard horizontal view with selection for scraped or failing stages
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
                        onSelect(product.sku, index, false);
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
                    onChange={handleCheckboxChange}
                    aria-label={`Select product ${product.sku}`}
                    className="mt-1 h-4 w-4 rounded border-gray-300 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
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
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${confidenceScore >= 0.9
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
                                        className={`h-1.5 flex-1 rounded-full ${isCurrentStage
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
                            {showImageSelectionButton && onImageSelection && (
                                <button
                                    onClick={() => onImageSelection(product.sku)}
                                    className="flex items-center gap-1 text-sm text-[#008850] hover:text-[#2a7034] font-medium"
                                    title="Select product images"
                                >
                                    <ImageIcon className="h-4 w-4" />
                                    <span className="hidden sm:inline">Images</span>
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
