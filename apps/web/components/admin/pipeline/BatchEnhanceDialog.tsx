'use client';

import { useEffect, useState } from 'react';
import { Bot, Loader2, X } from 'lucide-react';
import { SourceSelectorPanel } from './enrichment/SourceSelectorPanel';

interface Source {
    id: string;
    displayName: string;
    type: 'scraper' | 'ai_search';
    status: 'healthy' | 'degraded' | 'offline' | 'unknown';
    enabled: boolean;
    requiresAuth: boolean;
}

interface BatchEnhanceDialogProps {
    selectedCount: number;
    onConfirm: (options: { scrapers: string[], useAiSearch: boolean }) => void;
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
        const fetchSources = async () => {
            try {
                const res = await fetch('/api/admin/enrichment/sources');
                if (res.ok) {
                    const data = await res.json();
                    const sourcesData: Source[] = data.sources || [];
                    setSources(sourcesData);
                    setEnabledSourceIds([]);
                }
            } catch (error) {
                console.error('Failed to fetch sources:', error);
            } finally {
                setIsLoading(false);
            }
        };

        void fetchSources();
    }, []);

    const handleToggleSource = (sourceId: string, enabled: boolean) => {
        setEnabledSourceIds((prev) =>
            enabled ? [...prev, sourceId] : prev.filter((id) => id !== sourceId)
        );
    };

    const handleConfirm = () => {
        const selectedScrapers = sources
            .filter((source) => source.type === 'scraper' && enabledSourceIds.includes(source.id))
            .map((source) => source.id);
        const useAiSearch = enabledSourceIds.includes('ai_search');
        onConfirm({ scrapers: selectedScrapers, useAiSearch });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/55">
            <div className="mx-4 w-full max-w-md overflow-hidden rounded-xl bg-card shadow-xl">
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">Batch Enhance</h2>
                        <p className="text-sm text-muted-foreground">
                            {selectedCount} product{selectedCount > 1 ? 's' : ''} selected
                        </p>
                    </div>
                    <button
                        onClick={onCancel}
                        disabled={isEnhancing}
                        className="p-2 text-muted-foreground hover:text-muted-foreground disabled:opacity-50"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : sources.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground">
                            <p>No enrichment sources configured.</p>
                            <p className="mt-1 text-sm">Products will be queued for default processing.</p>
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

                <div className="flex items-center justify-end gap-3 border-t border-border bg-muted px-6 py-4">
                    <button
                        onClick={onCancel}
                        disabled={isEnhancing}
                        className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isEnhancing || enabledSourceIds.length === 0}
                        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/80 disabled:opacity-50"
                    >
                        {isEnhancing ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Enhancing…
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
