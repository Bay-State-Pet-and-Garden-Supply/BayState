'use client';

import { Sparkles, X, ChevronRight, Loader2 } from 'lucide-react';

interface ConsolidationProgressBannerProps {
    batchId: string;
    progress: number; // 0-100
    estimatedTime?: string;
    isDismissed: boolean;
    onDismiss: () => void;
    onViewDetails: () => void;
}

export function ConsolidationProgressBanner({
    batchId,
    progress,
    estimatedTime,
    isDismissed,
    onDismiss,
    onViewDetails
}: ConsolidationProgressBannerProps) {
    if (isDismissed) return null;

    return (
        <div className="relative overflow-hidden rounded-lg bg-white border border-purple-100 shadow-sm ring-1 ring-purple-100">
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#8b5cf61a_1px,transparent_1px),linear-gradient(to_bottom,#8b5cf61a_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:linear-gradient(to_right,black,transparent)]" />

            <div className="relative flex items-center gap-4 px-4 py-3">
                {/* Icon */}
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-purple-100 ring-4 ring-purple-50">
                    <Sparkles className="h-5 w-5 text-purple-600 animate-pulse" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-gray-900">
                            AI Consolidation in Progress
                        </h3>
                        <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10">
                            Batch #{batchId.slice(0, 8)}
                        </span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-gray-600">
                        <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-purple-100">
                                <div 
                                    className="h-full bg-purple-600 transition-all duration-500 ease-out"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <span className="font-medium text-purple-700">{progress}%</span>
                        </div>
                        {estimatedTime && (
                            <span>~{estimatedTime} remaining</span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={onViewDetails}
                        className="group flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 hover:text-purple-600 transition-colors"
                    >
                        View Details
                        <ChevronRight className="h-3 w-3 text-gray-600 group-hover:text-purple-500 transition-colors" />
                    </button>
                    <button
                        onClick={onDismiss}
                        className="rounded-full p-1 text-gray-600 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                    >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Dismiss</span>
                    </button>
                </div>
            </div>
            
            {/* Bottom Progress Line */}
            <div 
                className="absolute bottom-0 left-0 h-0.5 bg-purple-600 transition-all duration-500 ease-linear"
                style={{ width: `${progress}%` }}
            />
        </div>
    );
}
