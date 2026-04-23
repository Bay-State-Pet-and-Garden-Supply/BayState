'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Loader2, X, Radio, Play, CheckCircle2, AlertCircle, Package, Sparkles, ImagePlus } from 'lucide-react';
import { SourceSelectorPanel } from './SourceSelectorPanel';
import { EnrichmentDataPreview } from './EnrichmentDataPreview';
import { useEnrichmentRealtime } from '@/lib/enrichment/useEnrichmentRealtime';
import { scrapeProducts } from '@/lib/pipeline-scraping';
import { formatCurrency } from '@/lib/utils';

interface EnrichmentSource {
  id: string;
  displayName: string;
  type: 'scraper' | 'official_brand';
  status: 'healthy' | 'degraded' | 'offline' | 'unknown';
  enabled: boolean;
  requiresAuth: boolean;
}

interface ResolvedField {
  field: string;
  value: unknown;
  source: string;
  hasConflict: boolean;
}

interface EnrichmentWorkspaceProps {
  /** Single SKU for individual enhancement */
  sku?: string;
  /** Multiple SKUs for batch enhancement */
  skus?: string[];
  onClose: () => void;
  onSave?: () => void;
  onRunBatch?: (jobIds: string[]) => void;
}

export function EnrichmentWorkspace({ sku, skus, onClose, onSave, onRunBatch }: EnrichmentWorkspaceProps) {
  // Determine if we're in batch mode
  const isBatchMode = skus && skus.length > 0;
  const effectiveSku = sku || (skus?.[0] || '');
  const batchCount = skus?.length || 0;
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [sources, setSources] = useState<EnrichmentSource[]>([]);
  const [enabledSourceIds, setEnabledSourceIds] = useState<string[]>([]);
  const [resolvedData, setResolvedData] = useState<ResolvedField[]>([]);
  const [originalPrice, setOriginalPrice] = useState<number>(0);
  const [originalName, setOriginalName] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [realtimeUpdatePending, setRealtimeUpdatePending] = useState(false);
  const [hasScrapedData, setHasScrapedData] = useState(false);
  const [isRunningEnhancement, setIsRunningEnhancement] = useState(false);
  const [enhancementJobId, setEnhancementJobId] = useState<string | null>(null);
  const router = useRouter();

  const handleRealtimeUpdate = useCallback(() => {
    setRealtimeStatus('connected');
    setRealtimeUpdatePending(true);
  }, []);

  useEnrichmentRealtime({
    sku: effectiveSku,
    onUpdate: handleRealtimeUpdate,
    enabled: !isBatchMode, // Only enable realtime for single SKU mode
  });

  useEffect(() => {
    const timer = setTimeout(() => setRealtimeStatus('connected'), 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (realtimeUpdatePending) {
      setRealtimeUpdatePending(false);
      fetchEnrichmentData();
    }
  }, [realtimeUpdatePending]);

  const fetchEnrichmentData = useCallback(async () => {
    setIsLoading(true);
    try {
      // In batch mode, just fetch sources; in single mode, fetch full enrichment data
      if (isBatchMode) {
        const res = await fetch('/api/admin/enrichment/sources');
        if (res.ok) {
          const data = await res.json();
          setSources(data.sources || []);
          // Default to no sources selected - user must explicitly choose
          setEnabledSourceIds([]);
        }
      } else {
        const res = await fetch(`/api/admin/enrichment/${effectiveSku}`);
        if (res.ok) {
          const data = await res.json();
          setSources(data.sources || []);
          setEnabledSourceIds(data.enabledSourceIds || []);
          setResolvedData(data.resolvedData || []);
          setOriginalPrice(data.originalPrice || 0);
          setOriginalName(data.originalName || effectiveSku);
          setHasScrapedData(data.hasScrapedData ?? (data.resolvedData?.length > 0));
        }
      }
    } catch (error) {
      console.error('Failed to fetch enrichment data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveSku, isBatchMode]);

  useEffect(() => {
    fetchEnrichmentData();
  }, [fetchEnrichmentData]);

  const handleToggleSource = async (sourceId: string, enabled: boolean) => {
    setEnabledSourceIds((prev) =>
      enabled ? [...prev, sourceId] : prev.filter((id) => id !== sourceId)
    );

    // In batch mode, don't persist per-sku; just update local state
    if (isBatchMode) return;

    try {
      await fetch(`/api/admin/enrichment/${effectiveSku}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, enabled }),
      });
      if (hasScrapedData) {
        await fetchEnrichmentData();
      }
    } catch (error) {
      console.error('Failed to toggle source:', error);
      setEnabledSourceIds((prev) =>
        enabled ? prev.filter((id) => id !== sourceId) : [...prev, sourceId]
      );
    }
  };

  const handleRefreshSource = async (sourceId: string) => {
    if (isBatchMode) return; // Not supported in batch mode

    setIsRefreshing(sourceId);
    try {
      const res = await fetch(`/api/admin/enrichment/${effectiveSku}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: [sourceId] }),
      });

      if (res.ok) {
        setTimeout(() => {
          fetchEnrichmentData();
          setIsRefreshing(null);
        }, 2000);
      } else {
        setIsRefreshing(null);
      }
    } catch (error) {
      console.error('Failed to refresh source:', error);
      setIsRefreshing(null);
    }
  };

  const handleRunEnhancement = async () => {
    if (enabledSourceIds.length === 0) return;

    setIsRunningEnhancement(true);
    try {
      // Separate selected sources into scrapers and Official Brand discovery
      const selectedScrapers = sources
        .filter((s) => s.type === 'scraper' && enabledSourceIds.includes(s.id))
        .map((s) => s.id);
      const hasOfficialBrand = sources.some(
        (s) => s.type === 'official_brand' && enabledSourceIds.includes(s.id)
      );

      if (isBatchMode && skus) {
        // Batch mode: dispatch jobs via scrapeProducts
        const allJobIds: string[] = [];

        // Dispatch scraper job if scrapers are selected
        if (selectedScrapers.length > 0) {
          const scraperResult = await scrapeProducts(skus, {
            scrapers: selectedScrapers,
            enrichment_method: 'scrapers',
          });
          if (scraperResult.success && scraperResult.jobIds) {
            allJobIds.push(...scraperResult.jobIds);
          } else {
            console.error('Failed to start scraper enhancement:', scraperResult.error);
          }
        }

        // Dispatch Official Brand job if selected
        if (hasOfficialBrand) {
          const officialBrandResult = await scrapeProducts(skus, {
            enrichment_method: 'official_brand',
          });
          if (officialBrandResult.success && officialBrandResult.jobIds) {
            allJobIds.push(...officialBrandResult.jobIds);
          } else {
            console.error('Failed to start Official Brand enhancement:', officialBrandResult.error);
          }
        }

        if (allJobIds.length > 0) {
          setEnhancementJobId(allJobIds[0]);
          onRunBatch?.(allJobIds);
          onSave?.();
          onClose();
        } else {
          console.error('Failed to start any enhancement jobs');
          setIsRunningEnhancement(false);
        }
      } else {
        // Single SKU mode
        if (hasOfficialBrand) {
          // Use scrapeProducts with official_brand method for single SKU too
          const result = await scrapeProducts([effectiveSku], {
            enrichment_method: 'official_brand',
            scrapers: selectedScrapers.length > 0 ? selectedScrapers : undefined,
          });
          if (result.success) {
            setEnhancementJobId(result.jobIds?.[0] || 'running');
            setTimeout(() => {
              fetchEnrichmentData();
              setIsRunningEnhancement(false);
              setEnhancementJobId(null);
            }, 3000);
          } else {
            setIsRunningEnhancement(false);
          }
        } else {
          // Standard scraper-only per-SKU endpoint
          const res = await fetch(`/api/admin/enrichment/${effectiveSku}/scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sources: enabledSourceIds }),
          });

          if (res.ok) {
            const data = await res.json();
            setEnhancementJobId(data.jobId || 'running');
            setTimeout(() => {
              fetchEnrichmentData();
              setIsRunningEnhancement(false);
              setEnhancementJobId(null);
            }, 3000);
          } else {
            setIsRunningEnhancement(false);
          }
        }
      }
    } catch (error) {
      console.error('Failed to run enhancement:', error);
      setIsRunningEnhancement(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      onSave?.();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-zinc-950/55 flex items-center justify-center z-50">
        <div className="bg-card rounded-lg p-8 flex items-center gap-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-muted-foreground">Loading enrichment data…</span>
        </div>
      </div>
    );
  }

  const scraperSources = sources.filter((s) => s.type === 'scraper');
  const officialBrandSources = sources.filter((s) => s.type === 'official_brand');
  const enabledScrapers = scraperSources.filter((s) => enabledSourceIds.includes(s.id));
  const enabledOfficial = officialBrandSources.filter((s) => enabledSourceIds.includes(s.id));

  return (
    <div className="fixed inset-0 bg-zinc-950/55 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border bg-muted/50">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-foreground">
                {isBatchMode
                  ? 'Batch Enhancement'
                  : (hasScrapedData ? 'Enrichment Workspace' : 'Configure Enhancement')}
              </h2>
              {!isBatchMode && (
                <div
                  className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${realtimeStatus === 'connected'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-muted text-muted-foreground'
                    }`}
                  title={realtimeStatus === 'connected' ? 'Live updates enabled' : 'Connecting…'}
                >
                  <Radio className="h-3 w-3" />
                  <span>Live</span>
                </div>
              )}
              {isBatchMode && (
                <div className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  <Package className="h-3 w-3" />
                  <span>{batchCount} products</span>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {isBatchMode ? (
                <>Select data sources to enhance {batchCount} selected products</>
              ) : hasScrapedData ? (
                <>Configure data sources for <span className="font-mono font-medium tabular-nums">{effectiveSku}</span></>
              ) : (
                <>Select sources to enhance <span className="font-mono font-medium tabular-nums">{originalName}</span></>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-muted-foreground hover:bg-muted rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="flex gap-6">
            <div className="shrink-0">
              <SourceSelectorPanel
                sources={sources}
                enabledSourceIds={enabledSourceIds}
                onToggleSource={handleToggleSource}
                onRefreshSource={handleRefreshSource}
                isLoading={isRefreshing !== null}
              />

              {isRefreshing && (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground bg-blue-50 p-3 rounded-lg">
                  <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                  Refreshing {sources.find((s) => s.id === isRefreshing)?.displayName}…
                </div>
              )}

              {enhancementJobId && (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground bg-purple-50 p-3 rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                  Enhancement running…
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              {!isBatchMode && hasScrapedData ? (
                <EnrichmentDataPreview
                  sku={effectiveSku}
                  originalPrice={originalPrice}
                  resolvedData={resolvedData}
                />
              ) : (
                <div className="space-y-6">
                  <div className="rounded-lg border border-dashed border-border bg-muted p-8 text-center">
                    {isBatchMode ? (
                      <>
                        <Package className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-medium text-foreground">Batch Enhancement</h3>
                        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                          Select the data sources on the left, then click &quot;Run Enhancement&quot;
                          to fetch product data for all {batchCount} selected products.
                        </p>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-medium text-foreground">No Enhanced Data Yet</h3>
                        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                          Select the data sources you want to use on the left, then click &quot;Run Enhancement&quot;
                          to fetch product data from those sources.
                        </p>
                      </>
                    )}
                  </div>

                  {isBatchMode ? (
                    <div className="bg-card rounded-lg border p-4 space-y-3">
                      <h4 className="font-medium text-foreground">Selected Products</h4>
                      <p className="text-sm text-muted-foreground">
                        {batchCount} product{batchCount !== 1 ? 's' : ''} will be enhanced with the selected data sources.
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {skus?.slice(0, 5).map((s) => (
                          <span key={s} className="px-2 py-1 bg-muted rounded text-xs font-mono tabular-nums">
                            {s}
                          </span>
                        ))}
                        {(skus?.length || 0) > 5 && (
                          <span className="px-2 py-1 bg-muted rounded text-xs text-muted-foreground">
                            +{(skus?.length || 0) - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-card rounded-lg border p-4 space-y-3">
                      <h4 className="font-medium text-foreground">Original Import Data</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">SKU:</span>
                          <span className="ml-2 font-mono tabular-nums">{effectiveSku}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Price:</span>
                          <span className="ml-2 font-semibold text-green-600">{formatCurrency(originalPrice)}</span>
                          <span className="ml-1 text-xs text-muted-foreground">(protected)</span>
                        </div>
                        {originalName && originalName !== effectiveSku && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Name:</span>
                            <span className="ml-2">{originalName}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {enabledSourceIds.length > 0 && (
                    <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-blue-900">Ready to Enhance</h4>
                          <p className="text-sm text-blue-700 mt-1">
                            {enabledScrapers.length > 0 && (
                              <>{enabledScrapers.length} scraper{enabledScrapers.length !== 1 ? 's' : ''}</>)}
                            {enabledScrapers.length > 0 && enabledOfficial.length > 0 && ' + '}
                            {enabledOfficial.length > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Sparkles className="inline h-3.5 w-3.5 text-purple-500" />
                                Official Brand Search
                              </span>
                            )}
                            {' '}selected. Click &quot;Run Enhancement&quot; to fetch data.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between p-6 border-t border-border bg-muted/50">
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              Price and SKU always come from the original import and cannot be changed.
            </p>
            {!isBatchMode && hasScrapedData && (
              <button
                onClick={() => router.push(`/admin/pipeline/image-selection?sku=${effectiveSku}`)}
                className="px-3 py-1.5 text-sm font-medium text-primary bg-primary/10 border border-primary/30 rounded-lg hover:bg-primary/20 transition-colors flex items-center gap-2"
              >
                <ImagePlus className="h-4 w-4" />
                Open Image Selection
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground bg-card border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            {hasScrapedData && (
              <button
                onClick={handleRunEnhancement}
                disabled={isRunningEnhancement || enabledSourceIds.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                title="New scraper data will be merged with existing sources"
              >
                {isRunningEnhancement ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Re-Run Enhancement
                  </>
                )}
              </button>
            )}
            <button
              onClick={hasScrapedData ? handleSave : handleRunEnhancement}
              disabled={hasScrapedData ? isSaving : isRunningEnhancement || enabledSourceIds.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {(hasScrapedData ? isSaving : isRunningEnhancement) && <Loader2 className="h-4 w-4 animate-spin" />}
              {hasScrapedData ? 'Save Changes' : 'Run Enhancement'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
