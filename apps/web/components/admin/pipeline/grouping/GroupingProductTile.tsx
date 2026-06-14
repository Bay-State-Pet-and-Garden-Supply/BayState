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
    /** Per-source scraped data: { "bradley": { title, brand, ... }, "central_pet": { ... } } */
    raw_sources?: Record<string, Record<string, unknown>> | null;
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

const SOURCE_DISPLAY_ORDER = ['shopsite_input', 'bradley', 'central-pet', 'central_pet', 'orgill', 'doitbest', 'do_it_best', 'manufacturer', 'catalog', 'distributor'];

function formatSourceName(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function sortSourceKeys(keys: string[]): string[] {
    return [...keys].sort((a, b) => {
        const aIdx = SOURCE_DISPLAY_ORDER.findIndex(s => a.toLowerCase().includes(s));
        const bIdx = SOURCE_DISPLAY_ORDER.findIndex(s => b.toLowerCase().includes(s));
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return a.localeCompare(b);
    });
}

function pickSourceFields(src: Record<string, unknown>): Array<{ label: string; value: string }> {
    const fields: Array<{ label: string; value: string }> = [];
    const add = (label: string, key: string) => {
        const v = src[key];
        if (typeof v === 'string' && v.trim()) fields.push({ label, value: v.trim() });
    };
    add('Name', 'title');
    add('Name', 'name');
    add('Brand', 'brand');
    add('Weight', 'weight');
    add('Size', 'size');
    add('Category', 'category');
    add('UPC', 'upc');
    add('Item #', 'item_number');
    add('Mfr Part #', 'manufacturer_part_number');
    add('Description', 'description');
    return fields;
}

export default function GroupingProductTile({ upc, preview, confidence, assignmentSource, reviewRequired, children, compact }: GroupingProductTileProps) {
    const [expanded, setExpanded] = useState(false);
    const [showFullImage, setShowFullImage] = useState(false);
    const p: ProductPreview = preview || { name: null, image_url: null, image_source: null, image_count: 0, brand: null, variant_summary: null, raw_sources: null };

    const hasSources = p.raw_sources && Object.keys(p.raw_sources).length > 0;
    const hasEvidence = p.source_product_name || p.source_brand || p.source_category 
        || p.source_family || p.classification_rationale || p.packaging_text;

    return (
        <div className={`bg-white rounded border ${reviewRequired ? 'border-amber-300' : 'border-gray-200'} p-3`}>
            <div className="flex gap-3">
                {/* Larger image */}
                <div className="w-20 h-20 rounded bg-gray-100 flex-shrink-0 overflow-hidden relative cursor-pointer"
                    onClick={() => p.image_url && setShowFullImage(true)}>
                    {p.image_url ? (
                        <>
                            <img src={p.image_url} alt={p.name || upc} className="w-full h-full object-cover"
                                loading="lazy" decoding="async" referrerPolicy="no-referrer"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            {p.image_count > 1 && (
                                <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-white text-[9px] px-1 rounded">
                                    +{p.image_count - 1}
                                </span>
                            )}
                        </>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                    )}
                </div>

                {/* Main info */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-mono text-[10px] text-gray-400">{upc}</span>
                        {hasSources && (
                            <button onClick={() => setExpanded(!expanded)}
                                className="text-[10px] text-purple-500 hover:text-purple-700 hover:underline">
                                {expanded ? 'hide sources ▴' : 'show sources ▾'}
                            </button>
                        )}
                    </div>
                    {p.name ? (
                        <div className="text-sm text-gray-900 font-medium leading-snug" title={p.name}>{p.name}</div>
                    ) : (
                        <div className="text-sm text-gray-400 italic">No name</div>
                    )}
                    {p.source_product_name && p.source_product_name !== p.name && (
                        <div className="text-[10px] text-gray-400 mt-0.5 truncate" title={p.source_product_name}>
                            Source: {p.source_product_name}
                        </div>
                    )}
                    {p.variant_summary && (
                        <div className="text-xs text-gray-500 mt-0.5">{p.variant_summary}</div>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {p.source_brand && (
                            <span className="text-[10px] px-1 bg-gray-100 rounded text-gray-600">{p.source_brand}</span>
                        )}
                        {p.source_category && (
                            <span className="text-[10px] px-1 bg-gray-100 rounded text-gray-600">{p.source_category}</span>
                        )}
                        {p.source_family && (
                            <span className="text-[10px] px-1 bg-blue-50 rounded text-blue-600">Family: {p.source_family}</span>
                        )}
                        {assignmentSource && (
                            <span className={`text-[10px] px-1 rounded ${assignmentSource === 'manual' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                {assignmentSource}
                            </span>
                        )}
                        {confidence != null && (
                            <span className="text-[10px] text-gray-400">{(confidence * 100).toFixed(0)}%</span>
                        )}
                    </div>
                </div>

                {children && (
                    <div className="flex-shrink-0 flex items-start">{children}</div>
                )}
            </div>

            {/* Expanded: per-source scraped data */}
            {expanded && hasSources && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                    <div className="text-[10px] text-gray-400 mb-1.5">Scraped source data:</div>
                    <div className="space-y-1.5">
                        {sortSourceKeys(Object.keys(p.raw_sources!)).map(sourceKey => {
                            const src = p.raw_sources![sourceKey];
                            if (!src || typeof src !== 'object') return null;
                            const fields = pickSourceFields(src as Record<string, unknown>);
                            if (fields.length === 0) return null;
                            return (
                                <div key={sourceKey} className="bg-gray-50 rounded p-2">
                                    <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">
                                        {formatSourceName(sourceKey)}
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                                        {fields.map(f => (
                                            <div key={f.label} className="text-[10px] truncate">
                                                <span className="text-gray-400">{f.label}: </span>
                                                <span className="text-gray-700">{f.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Classification evidence */}
                    {hasEvidence && (
                        <div className="mt-2 pt-2 border-t border-gray-100 text-[10px] space-y-0.5">
                            {p.classification_raw_label && (
                                <div>
                                    <span className="text-gray-400">AI labeled as: </span>
                                    <span className="text-purple-600 font-medium">{p.classification_raw_label}</span>
                                    {confidence != null && <span className="text-gray-400"> ({(confidence * 100).toFixed(0)}%)</span>}
                                </div>
                            )}
                            {p.classification_rationale && (
                                <div className="text-gray-500 italic">{p.classification_rationale}</div>
                            )}
                            {p.packaging_text && (
                                <div className="mt-1 bg-amber-50 p-1.5 rounded text-gray-600 italic">
                                    Packaging: "{p.packaging_text}"
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Full-size image modal */}
            {showFullImage && p.image_url && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
                    onClick={() => setShowFullImage(false)}>
                    <div className="max-w-[90vw] max-h-[90vh] relative">
                        <img src={p.image_url} alt={p.name || upc}
                            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                            referrerPolicy="no-referrer" />
                        <button onClick={() => setShowFullImage(false)}
                            className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg hover:bg-black/70">
                            ✕
                        </button>
                        <p className="text-white text-center text-xs mt-2">{p.name || upc}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
