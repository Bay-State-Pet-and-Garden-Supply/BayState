'use client';

import * as React from 'react';
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
    onSelect: (upc: string, index: number, isShiftClick: boolean) => void;
    onView: (upc: string) => void;
    onEnrich?: (upc: string) => void;
    onImageSelection?: (upc: string) => void;
    showEnrichButton?: boolean;
    showImageSelectionButton?: boolean;
    readOnly?: boolean;
    showBatchSelect?: boolean;
    currentStage?: PipelineStage;
}

function PipelineProductCardSkeleton() {
    return (
        <div className="rounded-none border border-border bg-card p-4">
            <div className="flex items-start gap-3">
                <Skeleton className="h-4 w-4 rounded-none" />
                <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4 rounded-none" />
                        <Skeleton className="h-3 w-20 rounded-none" />
                        <Skeleton className="h-5 w-16 rounded-none" />
                    </div>
                    <Skeleton className="h-4 w-3/4 rounded-none" />
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-3 w-24 rounded-none" />
                    </div>
                    <div className="flex items-center justify-between pt-2">
                        <Skeleton className="h-5 w-16 rounded-none" />
                        <Skeleton className="h-8 w-20 rounded-none" />
                    </div>
                </div>
            </div>
        </div>
    );
}

function PipelineProductCardStorefrontSkeleton() {
    return (
        <div className="rounded-none border border-border bg-card overflow-hidden">
            <div className="relative aspect-square w-full bg-muted">
                <Skeleton className="h-full w-full rounded-none" />
            </div>
            <div className="p-4 space-y-3">
                <Skeleton className="h-3 w-16 rounded-none" />
                <Skeleton className="h-4 w-3/4 rounded-none" />
                <div className="flex items-center justify-between pt-2">
                    <Skeleton className="h-5 w-20 rounded-none" />
                    <Skeleton className="h-4 w-16 rounded-none" />
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
        onSelect(product.upc, index, isShiftClick);
    };

    const registerName = product.input?.name || product.upc;
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
                aria-label={`Product ${product.upc}${showBatchSelect && isSelected ? ', selected' : ''}`}
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (showBatchSelect) {
                            onSelect(product.upc, index, false);
                        }
                    }
                }}
                className={`group relative rounded-none border p-4 transition-colors outline-none focus-visible:ring-0 focus-visible:border-primary focus-visible:border-2 ${showBatchSelect && isSelected
                    ? 'border-brand-gold bg-brand-gold/15'
                    : 'border-border bg-card hover:bg-muted/30'
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
                            aria-label={`Select product ${product.upc}`}
                            className="mt-1 h-5 w-5 rounded-none border border-border cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        />
                    )}
                    <div className="flex-1 min-w-0 pr-16">
                        <div className="flex items-center gap-1.5 mb-1">
                            <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="text-[10px] font-semibold text-muted-foreground truncate">{product.upc}</span>
                        </div>

                        <p className="font-semibold text-foreground truncate mb-1" title={registerName}>
                            {registerName}
                        </p>

                        <span className="font-bold tabular-nums text-brand-forest-green">{formatCurrency(price)}</span>
                    </div>
                </div>
            </div>
        );
    }

    const isStorefrontView = stage === 'reviewing' || stage === 'publishing';

    if (isStorefrontView) {
        const imageSrc = product.consolidated?.images?.[0]?.trim();
        const hasValidImage = Boolean(imageSrc) && (imageSrc?.startsWith('/') || imageSrc?.startsWith('http'));

        return (
            <div
                role="article"
                aria-label={`Product ${product.upc}${isSelected ? ', selected' : ''}`}
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (showBatchSelect) {
                            onSelect(product.upc, index, false);
                        } else {
                            onView(product.upc);
                        }
                    }
                }}
                className={`group relative h-full rounded-none border transition-all duration-200 overflow-hidden outline-none focus-visible:ring-0 focus-visible:border-primary focus-visible:border-2 ${isSelected ? 'border-brand-gold bg-brand-gold/15' : 'border-border bg-card hover:bg-muted/30'
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
                        aria-label={`Select product ${product.upc}`}
                        className="h-5 w-5 rounded-none border border-border cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                </div>

                <div
                    className="flex h-full flex-col cursor-pointer"
                    onClick={() => onView(product.upc)}
                >
                    <div className="relative aspect-square w-full overflow-hidden bg-muted/50 border-b border-border">
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
                                <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
                                <span className="text-[10px] font-semibold">No Image</span>
                            </div>
                        )}

                        <div className="absolute top-3 right-3 z-10">
                            <StatusBadge status={stage as PipelineStatus} size="md" />
                        </div>

                        {confidenceScore !== undefined && confidenceScore > 0 && (
                            <div className="absolute top-12 right-3 z-10">
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-none text-[10px] font-semibold bg-card/90 backdrop-blur-sm border border-border ${getConfidenceColor(confidenceScore)}`}>
                                    <TrendingUp className="h-2.5 w-2.5" />
                                    {(confidenceScore * 100).toFixed(0)}%
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-1 flex-col p-4 bg-card">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-none border border-border">{product.upc}</span>
                        </div>

                        <h3 className="mb-2 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight text-foreground group-hover:text-primary transition-colors" title={cleanName || registerName}>
                            {cleanName || registerName}
                        </h3>

                        <div className="mt-auto pt-2 flex items-center justify-between border-t border-border">
                            <span className="text-lg font-semibold tabular-nums text-foreground">
                                {formatCurrency(price)}
                            </span>

                            <div className="text-xs font-semibold text-primary flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
            aria-label={`Product ${product.upc}${isSelected ? ', selected' : ''}`}
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (showBatchSelect) {
                        onSelect(product.upc, index, false);
                    } else {
                        onView(product.upc);
                    }
                }
            }}
            className={`group relative rounded-none border p-4 transition-colors outline-none focus-visible:ring-0 focus-visible:border-primary focus-visible:border-2 ${isSelected ? 'border-brand-gold bg-brand-gold/15' : 'border-border bg-card hover:bg-muted/30'
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
                    aria-label={`Select product ${product.upc}`}
                    className="mt-1 h-5 w-5 rounded-none border border-border cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />

                <div className="flex-1 min-w-0 pr-20">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-[10px] font-semibold text-muted-foreground truncate">{product.upc}</span>
                    </div>

                    <div className="space-y-1 mb-2">
                        <p className="font-semibold text-foreground truncate" title={cleanName || registerName}>
                            {cleanName || registerName}
                        </p>
                        {cleanName && registerName !== cleanName && (
                            <p className="text-[10px] font-semibold text-muted-foreground truncate" title={registerName}>
                                Original: {registerName}
                            </p>
                        )}
                    </div>


                    {hasScrapedData && (
                        <div className="flex items-center gap-1 mb-3">
                            <Database className="h-3 w-3 text-foreground" />
                            <span className="text-[10px] font-semibold text-foreground">Enriched</span>
                        </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-border">
                        <span className="font-semibold tabular-nums text-brand-forest-green">{formatCurrency(price)}</span>
                        <div className="flex items-center gap-1">
                            {showEnrichButton && onEnrich && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEnrich(product.upc);
                                    }}
                                    className="flex items-center justify-center h-9 w-9 rounded-none text-foreground hover:bg-muted transition-colors"
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
                                        onImageSelection(product.upc);
                                    }}
                                    className="flex items-center justify-center h-9 w-9 rounded-none text-foreground hover:bg-muted transition-colors"
                                    title="Select product images"
                                    aria-label="Select images"
                                >
                                    <ImageIcon className="h-4 w-4" />
                                </button>
                            )}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onView(product.upc);
                                }}
                                className="flex items-center justify-center h-9 px-4 rounded-none text-foreground hover:bg-muted font-semibold transition-colors border border-transparent hover:border-border"
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
