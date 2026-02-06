'use client';

import { Bot, Loader2, X } from 'lucide-react';

interface BatchEnhanceToolbarProps {
    selectedCount: number;
    allCount: number;
    selectingAllMatching: boolean;
    onBatchEnhance: () => void;
    isEnhancing: boolean;
    runnersAvailable: boolean;
    onClearSelection: () => void;
}

export function BatchEnhanceToolbar({
    selectedCount,
    allCount,
    selectingAllMatching,
    onBatchEnhance,
    isEnhancing,
    runnersAvailable,
    onClearSelection,
}: BatchEnhanceToolbarProps) {
    if (selectedCount === 0) return null;

    return (
        <div className="flex items-center gap-4 rounded-lg bg-gray-900 px-4 py-3 text-white">
            <span className="text-sm">
                {selectedCount} of {allCount} product{allCount !== 1 ? 's' : ''} selected
                {selectingAllMatching ? ' (all matching)' : ''}
            </span>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
                <button
                    onClick={onBatchEnhance}
                    disabled={isEnhancing}
                    className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors ${runnersAvailable
                            ? 'bg-[#008850] hover:bg-[#2a7034]'
                            : 'bg-amber-600 hover:bg-amber-700'
                        } disabled:opacity-50`}
                    title={!runnersAvailable ? 'Queue for enhancement (runners offline)' : undefined}
                >
                    {isEnhancing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Bot className="h-4 w-4" />
                    )}
                    {isEnhancing ? 'Enhancing...' : 'Batch Enhance'}
                </button>

                <button
                    onClick={onClearSelection}
                    disabled={isEnhancing}
                    className="flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white disabled:opacity-50"
                >
                    <X className="h-4 w-4" />
                    Clear
                </button>
            </div>
        </div>
    );
}
