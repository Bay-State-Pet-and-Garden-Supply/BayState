'use client';
import React from 'react';

export interface ProductPreview {
    name: string | null;
    image_url: string | null;
    image_source: string | null;
    image_count: number;
    brand: string | null;
    variant_summary: string | null;
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
    return (
        <div className={`bg-white rounded border ${reviewRequired ? 'border-amber-300' : 'border-gray-200'} ${compact ? 'p-1.5' : 'p-2'}`}>
            <div className={`flex ${compact ? 'gap-1.5' : 'gap-2'}`}>
                {/* Thumbnail */}
                <div className={`${compact ? 'w-10 h-10' : 'w-12 h-12'} rounded bg-gray-100 flex-shrink-0 overflow-hidden relative`}>
                    {preview?.image_url ? (
                        <img
                            src={preview.image_url}
                            alt={preview.name || upc}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                const placeholder = (e.target as HTMLImageElement).nextElementSibling;
                                if (placeholder) placeholder.classList.remove('hidden');
                            }}
                        />
                    ) : null}
                    <div className={`w-full h-full flex items-center justify-center text-gray-400 ${preview?.image_url ? 'hidden' : ''}`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] text-gray-400">{upc}</div>
                    {preview?.name ? (
                        <div className="text-xs text-gray-900 font-medium truncate" title={preview.name}>
                            {preview.name}
                        </div>
                    ) : (
                        <div className="text-xs text-gray-400 italic">No name</div>
                    )}
                    {!compact && preview?.variant_summary && (
                        <div className="text-[10px] text-gray-500 mt-0.5">{preview.variant_summary}</div>
                    )}
                    {!compact && assignmentSource && (
                        <span className={`text-[10px] mt-0.5 inline-block px-1 rounded ${
                            assignmentSource === 'manual' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                        }`}>
                            {assignmentSource}
                        </span>
                    )}
                    {!compact && confidence != null && (
                        <span className="text-[10px] text-gray-400 ml-1">{(confidence * 100).toFixed(0)}%</span>
                    )}
                </div>

                {/* Actions passed from parent */}
                {children && (
                    <div className="flex-shrink-0 flex items-start">
                        {children}
                    </div>
                )}
            </div>
        </div>
    );
}
