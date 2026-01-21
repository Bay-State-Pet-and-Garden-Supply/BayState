'use client';

import { useState, useEffect } from 'react';
import { X, Bot, Loader2 } from 'lucide-react';
import { SourceSelectorPanel } from './enrichment/SourceSelectorPanel';

interface Source {
    id: string;
    displayName: string;
    type: 'scraper' | 'b2b';
    status: 'healthy' | 'degraded' | 'offline' | 'unknown';
    enabled: boolean;
    requiresAuth: boolean;
}

interface BatchEnhanceDialogProps {
    selectedCount: number;
    onConfirm: (scrapers: string[]) => void;
    onCancel: () => void;
    isEnhancing: boolean;
}

export function BatchEnhanceDialog({
    selectedCount,
    onConfirm,
    onCancel,
    isEnhancing,
}: BatchEnhanceDialogProps) {
    const [sources, setSources] = useState<Source[]>([]);
    const [enabledSourceIds, setEnabledSourceIds] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchSources();
    }, []);

    const fetchSources = async () => {
        try {
            const res = await fetch('/api/admin/enrichment/sources');
            if (res.ok) {
                const data = await res.json();
                const sourcesData: Source[] = data.sources || [];
                setSources(sourcesData);
                // Enable all sources by default
                setEnabledSourceIds(sourcesData.map((s: Source) => s.id));
            }
        } catch (error) {
            console.error('Failed to fetch sources:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleSource = (sourceId: string, enabled: boolean) => {
        setEnabledSourceIds((prev) =>
            enabled ? [...prev, sourceId] : prev.filter((id) => id !== sourceId)
        );
    };

    const handleConfirm = () => {
        const selectedScrapers = sources
            .filter((s) => s.type === 'scraper' && enabledSourceIds.includes(s.id))
            .map((s) => s.id);
        onConfirm(selectedScrapers);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Batch Enhance</h2>
                        <p className="text-sm text-gray-600">
                            {selectedCount} product{selectedCount > 1 ? 's' : ''} selected
                        </p>
                    </div>
                    <button
                        onClick={onCancel}
                        disabled={isEnhancing}
                        className="p-2 text-gray-600 hover:text-gray-600 disabled:opacity-50"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
                        </div>
                    ) : sources.length === 0 ? (
                        <div className="text-center py-8 text-gray-600">
                            <p>No enrichment sources configured.</p>
                            <p className="text-sm mt-1">Products will be queued for default processing.</p>
                        </div>
                    ) : (
                        <div className="flex justify-center">
                            <SourceSelectorPanel
                                sources={sources}
                                enabledSourceIds={enabledSourceIds}
                                onToggleSource={handleToggleSource}
                                isLoading={isEnhancing}
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
                    <button
                        onClick={onCancel}
                        disabled={isEnhancing}
                        className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isEnhancing || enabledSourceIds.length === 0}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#008850] hover:bg-[#2a7034] rounded-lg disabled:opacity-50"
                    >
                        {isEnhancing ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Enhancing...
                            </>
                        ) : (
                            <>
                                <Bot className="h-4 w-4" />
                                Start Enhancement
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
