'use client';
import React, { useState } from 'react';

export interface ProductPreview {
    name: string | null;
    image_url: string | null;
    image_source: string | null;
    image_count: number;
    brand: string | null;
    variant_summary: string | null;
    source_brand?: string | null;
    source_category?: string | null;
    source_family?: string | null;
    source_product_name?: string | null;
    packaging_text?: string | null;
    classification_rationale?: string | null;
    classification_raw_label?: string | null;
}

interface GroupingProductTileProps {
    upc: string;
    preview: ProductPreview | null | undefined;
    confidence?: number | null;
    assignmentSource?: string | null;
    reviewRequired?: boolean;
    children?: React.ReactNode;
    compact?: boolean;
}

export default function GroupingProductTile({ upc, preview, confidence, assignmentSource, reviewRequired, children, compact }: GroupingProductTileProps) {
    const [expanded, setExpanded] = useState(false);
    const p: ProductPreview = preview || { name: null, image_url: null, image_source: null, image_count: 0, brand: null, variant_summary: null };

    const hasEvidence = Boolean(
        p.source_product_name || p.source_brand || p.source_category 
        || p.source_family || p.classification_rationale || p.packaging_text
    );

    return (
        <div className={`bg-white rounded border ${reviewRequired ? 'border-amber-300' : 'border-gray-200'} ${compact ? 'p-1.5' : 'p-2'}`}>
            <div className={`flex ${compact ? 'gap-1.5' : 'gap-2'}`}>
                {/* Thumbnail */}
                <div className={`${compact ? 'w-10 h-10' : 'w-12 h-12'} rounded bg-gray-100 flex-shrink-0 overflow-hidden relative`}>
                    {p.image_url ? (
                        <img src={p.image_url} alt={p.name || upc} className="w-full h-full object-cover"
                            loading="lazy" decoding="async" referrerPolicy="no-referrer"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : null}
                    <div className={`w-full h-full flex items-center justify-center text-gray-400 ${p.image_url ? 'hidden' : ''}`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                        <span className="font-mono text-[10px] text-gray-400">{upc}</span>
                        {hasEvidence && (
                            <button
                                onClick={() => setExpanded(!expanded)}
                                className="text-[10px] text-purple-500 hover:text-purple-700 hover:underline"
                            >
                                {expanded ? 'hide evidence ▴' : 'show evidence ▾'}
                            </button>
                        )}
                    </div>
                    {p.name ? (
                        <div className="text-xs text-gray-900 font-medium truncate" title={p.name}>{p.name}</div>
                    ) : (
                        <div className="text-xs text-gray-400 italic">No name</div>
                    )}
                    {!compact && p.variant_summary && (
                        <div className="text-[10px] text-gray-500 mt-0.5">{p.variant_summary}</div>
                    )}
                    {!compact && assignmentSource && (
                        <span className={`text-[10px] mt-0.5 inline-block px-1 rounded ${assignmentSource === 'manual' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                            {assignmentSource}
                        </span>
                    )}
                    {!compact && confidence != null && (
                        <span className="text-[10px] text-gray-400 ml-1">{(confidence * 100).toFixed(0)}%</span>
                    )}
                </div>

                {children && (
                    <div className="flex-shrink-0 flex items-start">{children}</div>
                )}
            </div>

            {/* Evidence panel */}
            {expanded && hasEvidence && (
                <div className={`mt-2 pt-2 border-t border-gray-100 text-[10px] space-y-1 ${compact ? 'px-1' : ''}`}>
                    {/* Source data */}
                    {p.source_product_name && (
                        <div><span className="text-gray-400">Source:</span> <span className="text-gray-700">{p.source_product_name}</span></div>
                    )}
                    {p.source_brand && (
                        <div><span className="text-gray-400">Brand:</span> <span className="text-gray-700">{p.source_brand}</span></div>
                    )}
                    {p.source_category && (
                        <div><span className="text-gray-400">Category:</span> <span className="text-gray-700">{p.source_category}</span></div>
                    )}
                    {p.source_family && (
                        <div><span className="text-gray-400">Family:</span> <span className="text-gray-700">{p.source_family}</span></div>
                    )}

                    {/* AI classification */}
                    {p.classification_raw_label && (
                        <div className="pt-1">
                            <span className="text-gray-400">AI:</span>{' '}
                            <span className="text-gray-600">classified as </span>
                            <span className="text-purple-600 font-medium">{p.classification_raw_label}</span>
                            {confidence != null && (
                                <span className="text-gray-400"> ({(confidence * 100).toFixed(0)}%)</span>
                            )}
                            {p.classification_rationale && (
                                <div className="text-gray-500 italic mt-0.5">{p.classification_rationale}</div>
                            )}
                        </div>
                    )}

                    {/* Packaging evidence */}
                    {p.packaging_text && (
                        <div className="pt-1">
                            <span className="text-gray-400">Packaging:</span>{' '}
                            <span className="text-gray-600 italic">"{p.packaging_text}"</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
