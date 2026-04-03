'use client';

import type { PipelineProduct, PipelineStatus, PipelineStage } from '@/lib/pipeline/types';
import {
    ChevronRight,
    Package,
    Settings2,
    TrendingUp,
    Database,
    ImageIcon
} from 'lucide-react';
import Image from 'next/image';
import { formatCurrency } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';

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
    currentStage?: PipelineStage;
}

export function PipelineProductCardSkeleton() {
    return (
        <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start gap-3">
                <Skeleton className="h-4 w-4 rounded" />
                <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4 rounded" />
                        <Skeleton className="h-3 w-20 rounded" />
                        <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-3/4 rounded" />
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-3 w-24 rounded" />
                    </div>
                    <div className="flex items-center justify-between pt-2">
                        <Skeleton className="h-5 w-16 rounded" />
                        <Skeleton className="h-8 w-20 rounded" />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function PipelineProductCardStorefrontSkeleton() {
    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="relative aspect-square w-full bg-muted">
                <Skeleton className="h-full w-full" />
            </div>
            <div className="p-4 space-y-3">
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="h-4 w-3/4 rounded" />
                <div className="flex items-center justify-between pt-2">
                    <Skeleton className="h-5 w-20 rounded" />
                    <Skeleton className="h-4 w-16 rounded" />
                </div>
            </div>
        </div>
    );
}

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

    const getConfidenceColor = (score: number) => {
        if (score >= 0.9) return 'text-green-600';
        if (score >= 0.7) return 'text-yellow-600';
        return 'text-red-600';
    };

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
                className={`group relative rounded-lg border p-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${showBatchSelect && isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-border bg-card hover:border-border'
                    }`}
            >
                <div className="absolute right-2 top-2">
                        <StatusBadge status={stage as PipelineStatus} size="sm" />
                </div>

                <div className="flex items-start gap-3">
                    {showBatchSelect && (
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={handleCheckboxChange}
                            aria-label={`Select product ${product.sku}`}
                            className="mt-1 h-5 w-5 rounded border-border cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        />
                    )}
                    <div className="flex-1 min-w-0 pr-16">
                        <div className="flex items-center gap-1.5 mb-1">
                            <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="text-[10px] font-mono tabular-nums text-muted-foreground truncate">{product.sku}</span>
                        </div>

                        <p className="font-medium text-foreground truncate mb-1" title={registerName}>
                            {registerName}
                        </p>

                        <span className="font-semibold tabular-nums text-green-600">{formatCurrency(price)}</span>
                    </div>
                </div>
            </div>
        );
    }

    const isStorefrontView = stage === 'finalized' || stage === 'published';

    if (isStorefrontView) {
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
                className={`group relative h-full rounded-xl border transition-all duration-200 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isSelected ? 'border-blue-500 shadow-md ring-1 ring-blue-500' : 'border-border bg-card hover:border-border hover:shadow-lg'
                    }`}
            >
                <div className="absolute top-3 left-3 z-20">
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                            e.stopPropagation();
                            handleCheckboxChange(e);
                        }}
                        aria-label={`Select product ${product.sku}`}
                        className="h-5 w-5 rounded border-border shadow-sm cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    />
                </div>

                <div
                    className="flex h-full flex-col cursor-pointer"
                    onClick={() => onView(product.sku)}
                >
                    <div className="relative aspect-square w-full overflow-hidden bg-muted border-b border-border">
                        {hasValidImage ? (
                            <Image
                                src={imageSrc!}
                                alt={cleanName || registerName}
                                fill
                                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                className="object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                        ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                                <ImageIcon className="h-10 w-10 text-muted-foreground" />
                                <span className="text-xs font-medium text-muted-foreground">No Image</span>
                            </div>
                        )}

                        <div className="absolute top-3 right-3 z-10">
                            <StatusBadge status={stage as PipelineStatus} size="md" />
                        </div>

                        {confidenceScore !== undefined && confidenceScore > 0 && (
                            <div className="absolute top-12 right-3 z-10">
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-card/90 backdrop-blur-sm border border-border ${getConfidenceColor(confidenceScore)}`}>
                                    <TrendingUp className="h-2.5 w-2.5" />
                                    {(confidenceScore * 100).toFixed(0)}%
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-1 flex-col p-4 bg-card">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-mono tabular-nums font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{product.sku}</span>
                        </div>

                        <h3 className="mb-2 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight text-foreground group-hover:text-blue-600 transition-colors" title={cleanName || registerName}>
                            {cleanName || registerName}
                        </h3>

                        <div className="mt-auto pt-2 flex items-center justify-between">
                            <span className="text-lg font-bold tabular-nums tracking-tight text-foreground">
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
            className={`group relative rounded-lg border p-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-border bg-card hover:border-border'
                }`}
        >
            <div className="absolute right-3 top-3">
                <StatusBadge status={stage as PipelineStatus} size="md" />
            </div>

            <div className="flex items-start gap-3">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={handleCheckboxChange}
                    aria-label={`Select product ${product.sku}`}
                    className="mt-1 h-5 w-5 rounded border-border cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                />

                <div className="flex-1 min-w-0 pr-20">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-[10px] font-mono tabular-nums text-muted-foreground truncate">{product.sku}</span>
                    </div>

                    <div className="space-y-1 mb-2">
                        <p className="font-medium text-foreground truncate" title={cleanName || registerName}>
                            {cleanName || registerName}
                        </p>
                        {cleanName && registerName !== cleanName && (
                            <p className="text-xs text-muted-foreground truncate" title={registerName}>
                                Original: {registerName}
                            </p>
                        )}
                    </div>


                    {hasScrapedData && (
                        <div className="flex items-center gap-1 mb-3">
                            <Database className="h-3 w-3 text-blue-500" />
                            <span className="text-xs text-blue-600">Enriched</span>
                        </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-border">
                        <span className="font-semibold tabular-nums text-green-600">{formatCurrency(price)}</span>
                        <div className="flex items-center gap-1">
                            {showEnrichButton && onEnrich && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEnrich(product.sku);
                                    }}
                                    className="flex items-center justify-center h-11 w-11 rounded-md text-primary hover:bg-primary/10 transition-colors"
                                    title="Configure enrichment sources"
                                    aria-label="Configure enrichment"
                                >
                                    <Settings2 className="h-4 w-4" />
                                </button>
                            )}
                            {showImageSelectionButton && onImageSelection && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onImageSelection(product.sku);
                                    }}
                                    className="flex items-center justify-center h-11 w-11 rounded-md text-primary hover:bg-primary/10 transition-colors"
                                    title="Select product images"
                                    aria-label="Select images"
                                >
                                    <ImageIcon className="h-4 w-4" />
                                </button>
                            )}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onView(product.sku);
                                }}
                                className="flex items-center justify-center h-11 px-4 rounded-md text-blue-600 hover:bg-blue-50 font-medium transition-colors"
                                aria-label="Review product"
                            >
                                Review <ChevronRight className="h-4 w-4 ml-1" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
