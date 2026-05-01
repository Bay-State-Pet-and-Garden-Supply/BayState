'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Search, CheckSquare, Square, Sparkles, Link, Globe, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

interface ManualUrlEntry {
    sku: string;
    url: string;
    parsed: boolean;
    error?: string;
}

interface ScraperSelectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedSkuCount: number;
    onConfirm: (
        scrapers: string[],
        enrichmentMethod: 'scrapers' | 'official_brand',
        options?: { phase?: 'url_discovery' | 'extraction'; urlsBySku?: Record<string, string> }
    ) => void;
    /** When provided, fetches and shows scraper recommendations for this brand */
    brandName?: string | null;
    officialBrandEligibility?: {
        allowed: boolean;
        reason?: string | null;
    };
    /** SKUs currently selected in the pipeline table */
    selectedSkus?: string[];
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
    officialBrandEligibility,
    selectedSkus,
}: ScraperSelectDialogProps) {
    const [scrapers, setScrapers] = useState<ScraperOption[]>([]);
    const [selectedScrapers, setSelectedScrapers] = useState<Set<string>>(new Set());
    const [enrichmentMethod, setEnrichmentMethod] = useState<'scrapers' | 'official_brand'>('scrapers');
    const [isLoadingScrapers, setIsLoadingScrapers] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [recommendations, setRecommendations] = useState<Map<string, ScraperRecommendation>>(new Map());
    const [hasRecommendations, setHasRecommendations] = useState(false);
    const [officialBrandMode, setOfficialBrandMode] = useState<'discover' | 'manual'>('discover');
    const [manualUrlInput, setManualUrlInput] = useState('');

    const parsedUrlEntries = useMemo<ManualUrlEntry[]>(() => {
        if (!manualUrlInput.trim()) return [];
        const entries: ManualUrlEntry[] = [];
        const lines = manualUrlInput.trim().split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const parts = trimmed.split(',', 2);
            if (parts.length < 2) {
                entries.push({ sku: '', url: trimmed, parsed: false, error: 'Missing SKU (format: SKU,URL)' });
                continue;
            }

            const sku = parts[0].trim();
            const url = parts[1].trim();
            if (!sku) {
                entries.push({ sku: '', url, parsed: false, error: 'SKU is empty' });
                continue;
            }
            if (!url) {
                entries.push({ sku, url, parsed: false, error: 'URL is empty' });
                continue;
            }
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                entries.push({ sku, url, parsed: false, error: 'URL must start with http:// or https://' });
                continue;
            }
            entries.push({ sku, url, parsed: true });
        }
        return entries;
    }, [manualUrlInput]);

    const parsedUrlsBySku = useMemo<Record<string, string>>(() => {
        const map: Record<string, string> = {};
        parsedUrlEntries.filter((e) => e.parsed).forEach((e) => { map[e.sku] = e.url; });
        return map;
    }, [parsedUrlEntries]);

    const manualUrlErrorCount = useMemo(() => parsedUrlEntries.filter((e) => !e.parsed).length, [parsedUrlEntries]);
    const manualUrlMissingCount = useMemo(() => selectedSkus
        ? selectedSkus.filter((sku) => !parsedUrlsBySku[sku]).length
        : 0, [selectedSkus, parsedUrlsBySku]);

    const fetchScrapers = useCallback(async () => {
        setIsLoadingScrapers(true);
        setLoadError(null);
        try {
            const res = await fetch('/api/admin/pipeline/scrapers');
            if (!res.ok) throw new Error('Failed to load scrapers');
            const data = await res.json();
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
            if (enrichmentMethod === 'official_brand') {
                await onConfirm(scraperSlugs, enrichmentMethod, {
                    phase: officialBrandMode === 'manual' ? 'extraction' : 'url_discovery',
                    ...(officialBrandMode === 'manual' ? { urlsBySku: parsedUrlsBySku } : {}),
                });
            } else {
                await onConfirm(scraperSlugs, enrichmentMethod);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const isDiscovery = enrichmentMethod === 'official_brand' && officialBrandMode === 'discover';
    const isManualUrlMode = enrichmentMethod === 'official_brand' && officialBrandMode === 'manual';
    const canUseOfficialBrand = officialBrandEligibility?.allowed ?? true;
    const officialBrandReason = officialBrandEligibility?.reason ?? null;
    const canSubmit = isDiscovery
        ? canUseOfficialBrand
        : isManualUrlMode
            ? canUseOfficialBrand && parsedUrlEntries.some((e) => e.parsed) && manualUrlMissingCount === 0 && manualUrlErrorCount === 0
            : selectedScrapers.size > 0;

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
                            variant={enrichmentMethod === 'official_brand' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                                if (!canUseOfficialBrand) {
                                    return;
                                }
                                setEnrichmentMethod('official_brand');
                            }}
                            disabled={!canUseOfficialBrand}
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

                {enrichmentMethod === 'official_brand' && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant={officialBrandMode === 'discover' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setOfficialBrandMode('discover')}
                                className={officialBrandMode === 'discover' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
                            >
                                <Globe className="mr-1.5 h-3.5 w-3.5" />
                                Discover URLs
                            </Button>
                            <Button
                                variant={officialBrandMode === 'manual' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setOfficialBrandMode('manual')}
                                className={officialBrandMode === 'manual' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
                            >
                                <Link className="mr-1.5 h-3.5 w-3.5" />
                                Paste Official URLs
                            </Button>
                        </div>

                        {officialBrandMode === 'discover' ? (
                            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                                Searches Serper for official brand product URLs, then runs Crawl4AI
                                extraction against discovered URLs.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="rounded-md border border-purple-200 bg-purple-50 p-3 text-sm text-purple-700">
                                    Paste one <strong>SKU,URL</strong> per line. The SKU must match a selected product above.
                                    URLs are validated against the cohort brand domains before running extraction.
                                </div>
                                <Textarea
                                    placeholder={`SKU-1,https://example.com/product/abc\nSKU-2,https://example.com/product/xyz`}
                                    value={manualUrlInput}
                                    onChange={(e) => setManualUrlInput(e.target.value)}
                                    rows={4}
                                    className="font-mono text-xs"
                                />
                                {parsedUrlEntries.length > 0 && (
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground">
                                            {Object.keys(parsedUrlsBySku).length} valid URL(s)
                                            {manualUrlErrorCount > 0 && (
                                                <span className="text-amber-600 ml-1">
                                                    · {manualUrlErrorCount} error(s)
                                                </span>
                                            )}
                                            {manualUrlMissingCount > 0 && (
                                                <span className="text-amber-600 ml-1">
                                                    · {manualUrlMissingCount} SKU(s) not in selection
                                                </span>
                                            )}
                                        </p>
                                        {manualUrlErrorCount > 0 && (
                                            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                                                {parsedUrlEntries.filter((e) => !e.parsed).map((e, i) => (
                                                    <div key={i} className="flex items-start gap-1">
                                                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                                        <span>{e.error}{e.sku ? ` for "${e.sku}"` : e.url ? `: ${e.url}` : ''}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {!canUseOfficialBrand && officialBrandReason && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        {officialBrandReason}
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
