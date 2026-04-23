'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Search, CheckSquare, Square, Zap, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface ScraperOption {
    slug: string;
    display_name: string;
    domain: string | null;
    base_url: string;
    scraper_type: string;
    status: string;
}

interface ScraperRecommendation {
    scraper_slug: string;
    scraper_name: string;
    hit_rate: number;
    total_attempts: number;
    confidence: 'high' | 'medium' | 'low' | 'untested';
    preselected: boolean;
    reason: string;
}

interface ScraperSelectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedSkuCount: number;
    onConfirm: (scrapers: string[], enrichmentMethod: 'scrapers' | 'ai_search') => void;
    /** When provided, fetches and shows scraper recommendations for this brand */
    brandName?: string | null;
}

const CONFIDENCE_BADGE: Record<string, { label: string; className: string }> = {
    high: { label: 'Recommended', className: 'bg-green-100 text-green-800 border-green-200' },
    medium: { label: 'Promising', className: 'bg-amber-100 text-amber-800 border-amber-200' },
    low: { label: 'Low', className: 'bg-red-50 text-red-600 border-red-200' },
    untested: { label: 'Untested', className: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export function ScraperSelectDialog({
    open,
    onOpenChange,
    selectedSkuCount,
    onConfirm,
    brandName,
}: ScraperSelectDialogProps) {
    const [scrapers, setScrapers] = useState<ScraperOption[]>([]);
    const [selectedScrapers, setSelectedScrapers] = useState<Set<string>>(new Set());
    const [enrichmentMethod, setEnrichmentMethod] = useState<'scrapers' | 'ai_search' | 'official_brand'>('scrapers');
    const [isLoadingScrapers, setIsLoadingScrapers] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [recommendations, setRecommendations] = useState<Map<string, ScraperRecommendation>>(new Map());
    const [hasRecommendations, setHasRecommendations] = useState(false);

    const fetchScrapers = useCallback(async () => {
        setIsLoadingScrapers(true);
        setLoadError(null);
        try {
            const res = await fetch('/api/admin/pipeline/scrapers');
            if (!res.ok) throw new Error('Failed to load scrapers');
            const data = await response.json();
            const list: ScraperOption[] = data.scrapers ?? [];
            setScrapers(list);
            // Select all by default (may be overridden by recommendations)
            setSelectedScrapers(new Set(list.map((s) => s.slug)));
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : 'Failed to load scrapers');
        } finally {
            setIsLoadingScrapers(false);
        }
    }, []);

    const fetchRecommendations = useCallback(async () => {
        if (!brandName) {
            setRecommendations(new Map());
            setHasRecommendations(false);
            return;
        }
        try {
            const res = await fetch(`/api/admin/cohorts/recommendations?brand=${encodeURIComponent(brandName)}`);
            if (res.ok) {
                const data = await res.json();
                const recs: ScraperRecommendation[] = data.recommendations || [];
                const recsMap = new Map<string, ScraperRecommendation>();
                recs.forEach((r) => recsMap.set(r.scraper_slug, r));
                setRecommendations(recsMap);
                setHasRecommendations(recs.some((r) => r.preselected));

                // Pre-select only recommended scrapers when brand is set
                const preselected = recs.filter((r) => r.preselected).map((r) => r.scraper_slug);
                if (preselected.length > 0) {
                    setSelectedScrapers(new Set(preselected));
                }
            }
        } catch {
            // Silently fail for recommendations
        }
    }, [brandName]);

    useEffect(() => {
        if (open) {
            fetchScrapers();
            void fetchRecommendations();
            setEnrichmentMethod('scrapers');
            setIsSubmitting(false);
        }
    }, [open, fetchScrapers, fetchRecommendations]);

    const toggleScraper = (slug: string) => {
        setSelectedScrapers((prev) => {
            const next = new Set(prev);
            if (next.has(slug)) {
                next.delete(slug);
            } else {
                next.add(slug);
            }
            return next;
        });
    };

    const selectAllScrapers = () => {
        setSelectedScrapers(new Set(scrapers.map((s) => s.slug)));
    };

    const deselectAllScrapers = () => {
        setSelectedScrapers(new Set());
    };

    const handleConfirm = async () => {
        const scraperSlugs = Array.from(selectedScrapers);
        if (enrichmentMethod === 'scrapers' && scraperSlugs.length === 0) return;

        setIsSubmitting(true);
        try {
            await onConfirm(scraperSlugs, enrichmentMethod);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isDiscovery = enrichmentMethod === 'ai_search' || enrichmentMethod === 'official_brand';
    const canSubmit = isDiscovery || selectedScrapers.size > 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg p-6 gap-6">
                <DialogHeader className="space-y-2">
                    <DialogTitle className="text-2xl font-black uppercase tracking-tight">Start Scrape Jobs</DialogTitle>
                    <DialogDescription className="font-bold text-zinc-600">
                        {selectedSkuCount} product{selectedSkuCount !== 1 ? 's' : ''} selected.
                        Choose scrapers and enrichment method.
                    </DialogDescription>
                </DialogHeader>

                {/* Enrichment Method Toggle */}
                <div className="space-y-3">
                    <Label className="text-sm font-medium">Enrichment Method</Label>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant={enrichmentMethod === 'scrapers' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setEnrichmentMethod('scrapers')}
                            className={enrichmentMethod === 'scrapers' ? 'bg-primary hover:bg-primary/90' : ''}
                        >
                            <Search className="mr-1.5 h-3.5 w-3.5" />
                            Standard
                        </Button>
                        <Button
                            variant={enrichmentMethod === 'ai_search' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setEnrichmentMethod('ai_search')}
                            className={enrichmentMethod === 'ai_search' ? 'bg-violet-500 hover:bg-violet-500/90 text-white' : ''}
                        >
                            <Zap className="mr-1.5 h-3.5 w-3.5" />
                            AI Search
                        </Button>
                        <Button
                            variant={enrichmentMethod === 'official_brand' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setEnrichmentMethod('official_brand')}
                            className={enrichmentMethod === 'official_brand' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
                        >
                            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                            Official Brand
                        </Button>
                    </div>
                </div>

                {/* Scraper List (only shown for standard method) */}
                {!isDiscovery && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">Select Scrapers</Label>
                            <div className="flex gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={selectAllScrapers}
                                    className="h-7 px-2 text-xs"
                                >
                                    <CheckSquare className="mr-1 h-3 w-3" />
                                    All
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={deselectAllScrapers}
                                    className="h-7 px-2 text-xs"
                                >
                                    <Square className="mr-1 h-3 w-3" />
                                    None
                                </Button>
                            </div>
                        </div>

                        {isLoadingScrapers ? (
                            <div className="flex items-center justify-center py-6">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-sm text-muted-foreground">Loading scrapers...</span>
                            </div>
                        ) : loadError ? (
                            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                {loadError}
                                <Button variant="link" size="sm" onClick={fetchScrapers} className="ml-2 text-red-700 underline">
                                    Retry
                                </Button>
                            </div>
                        ) : (
                            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                                {scrapers.map((scraper) => {
                                    const rec = recommendations.get(scraper.slug);
                                    const confBadge = rec ? CONFIDENCE_BADGE[rec.confidence] : null;
                                    return (
                                        <label
                                            key={scraper.slug}
                                            className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50 ${
                                                rec?.preselected ? 'bg-green-50/50 border border-green-200/50' : ''
                                            }`}
                                        >
                                            <Checkbox
                                                checked={selectedScrapers.has(scraper.slug)}
                                                onCheckedChange={() => toggleScraper(scraper.slug)}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-sm font-medium">{scraper.display_name}</span>
                                                    {rec?.preselected && (
                                                        <Sparkles className="h-3 w-3 text-green-600" />
                                                    )}
                                                </div>
                                                {scraper.domain && (
                                                    <div className="text-xs text-muted-foreground truncate">
                                                        {scraper.domain}
                                                    </div>
                                                )}
                                                {rec && rec.total_attempts > 0 && (
                                                    <div className="text-xs text-muted-foreground">
                                                        {Math.round(rec.hit_rate * 100)}% hit rate ({rec.total_attempts} attempts)
                                                    </div>
                                                )}
                                            </div>
                                            {confBadge ? (
                                                <Badge variant="outline" className={`text-xs shrink-0 ${confBadge.className}`}>
                                                    {confBadge.label}
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-xs shrink-0">
                                                    {scraper.scraper_type}
                                                </Badge>
                                            )}
                                        </label>
                                    );
                                })}
                                {scrapers.length === 0 && (
                                    <p className="py-4 text-center text-sm text-muted-foreground">
                                        No active scrapers found.
                                    </p>
                                )}
                            </div>
                        )}

                        <p className="text-xs text-muted-foreground">
                            {selectedScrapers.size} of {scrapers.length} scrapers selected
                            {hasRecommendations && brandName && (
                                <> · <Sparkles className="inline h-3 w-3 text-green-600" /> Recommendations for <strong>{brandName}</strong></>
                            )}
                        </p>
                    </div>
                )}

                {enrichmentMethod === 'ai_search' && (
                    <div className="rounded-md border border-violet-200 bg-violet-50 p-3 text-sm text-violet-700">
                        AI Search uses LLM-powered web search to find product data across the internet.
                        No specific scrapers needed — cost is capped at $5 per job.
                    </div>
                )}

                {enrichmentMethod === 'official_brand' && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                        Official Brand uses high-fidelity manufacturer isolation to extract data
                        directly from brand websites. Best for high-quality technical specs.
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!canSubmit || isSubmitting}
                        className="bg-primary hover:bg-primary/90 text-white"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Creating Jobs...
                            </>
                        ) : (
                            <>
                                Start Scraping {selectedSkuCount} Product{selectedSkuCount !== 1 ? 's' : ''}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
