'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Loader2, X, Radio, Play, CheckCircle2, AlertCircle, Package } from 'lucide-react';
import { SourceSelectorPanel } from './SourceSelectorPanel';
import { EnrichmentDataPreview } from './EnrichmentDataPreview';
import { ConflictResolutionCard } from './ConflictResolutionCard';
import { useEnrichmentRealtime } from '@/lib/enrichment/useEnrichmentRealtime';
import { scrapeProducts } from '@/lib/pipeline-scraping';
import { formatCurrency } from '@/lib/utils';

interface EnrichmentSource {
  id: string;
  displayName: string;
  type: 'scraper' | 'b2b';
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

interface ConflictOption {
  sourceId: string;
  sourceName: string;
  value: unknown;
  isSelected: boolean;
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
  const [conflictField, setConflictField] = useState<string | null>(null);
  const [conflictOptions, setConflictOptions] = useState<ConflictOption[]>([]);
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, string>>({});
  const [isRefreshing, setIsRefreshing] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [realtimeUpdatePending, setRealtimeUpdatePending] = useState(false);
  const [hasScrapedData, setHasScrapedData] = useState(false);
  const [isRunningEnhancement, setIsRunningEnhancement] = useState(false);
  const [enhancementJobId, setEnhancementJobId] = useState<string | null>(null);

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
          setEnabledSourceIds((data.sources || []).map((s: EnrichmentSource) => s.id));
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
          setFieldOverrides(data.fieldOverrides || {});
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
      // Get selected source IDs (scrapers and B2B)
      const selectedSources = sources
        .filter((s) => enabledSourceIds.includes(s.id))
        .map((s) => s.id);

      if (isBatchMode && skus) {
        // Batch mode: use scrapeProducts for all selected SKUs
        const result = await scrapeProducts(skus, {
          scrapers: selectedSources,
        });

        if (result.success && result.jobIds && result.jobIds.length > 0) {
          setEnhancementJobId(result.jobIds[0]);
          // Trigger run batch callback with job IDs
          onRunBatch?.(result.jobIds);
          // Close and trigger save callback
          onSave?.();
          onClose();
        } else {
          console.error('Failed to start batch enhancement:', result.error);
          setIsRunningEnhancement(false);
        }
      } else {
        // Single SKU mode: use per-SKU endpoint
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
    } catch (error) {
      console.error('Failed to run enhancement:', error);
      setIsRunningEnhancement(false);
    }
  };

  const handleFieldClick = async (field: string) => {
    if (isBatchMode) return; // Not supported in batch mode

    const fieldData = resolvedData.find((f) => f.field === field);
    if (!fieldData?.hasConflict) return;

    try {
      const res = await fetch(`/api/admin/enrichment/${effectiveSku}/conflicts/${field}`);
      if (res.ok) {
        const data = await res.json();
        setConflictOptions(
          data.options.map((opt: { sourceId: string; sourceName: string; value: unknown }) => ({
            ...opt,
            isSelected: fieldOverrides[field] === opt.sourceId || fieldData.source === opt.sourceId,
          }))
        );
        setConflictField(field);
      }
    } catch (error) {
      console.error('Failed to fetch conflict options:', error);
    }
  };

  const handleSelectConflictSource = async (sourceId: string) => {
    if (!conflictField || isBatchMode) return;

    setConflictOptions((prev) =>
      prev.map((opt) => ({ ...opt, isSelected: opt.sourceId === sourceId }))
    );

    try {
      await fetch(`/api/admin/enrichment/${effectiveSku}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: conflictField, sourceId }),
      });
      setFieldOverrides((prev) => ({ ...prev, [conflictField]: sourceId }));
      await fetchEnrichmentData();
      setConflictField(null);
    } catch (error) {
      console.error('Failed to set field override:', error);
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
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 flex items-center gap-4">
          <Loader2 className="h-6 w-6 animate-spin text-[#008850]" />
          <span className="text-gray-700">Loading enrichment data...</span>
        </div>
      </div>
    );
  }

  const scraperSources = sources.filter((s) => s.type === 'scraper');
  const b2bSources = sources.filter((s) => s.type === 'b2b');
  const enabledScrapers = scraperSources.filter((s) => enabledSourceIds.includes(s.id));
  const enabledB2B = b2bSources.filter((s) => enabledSourceIds.includes(s.id));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gray-50/50">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">
                {isBatchMode
                  ? 'Batch Enhancement'
                  : (hasScrapedData ? 'Enrichment Workspace' : 'Configure Enhancement')}
              </h2>
              {!isBatchMode && (
                <div
                  className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${realtimeStatus === 'connected'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                    }`}
                  title={realtimeStatus === 'connected' ? 'Live updates enabled' : 'Connecting...'}
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
            <p className="text-sm text-gray-600 mt-1">
              {isBatchMode ? (
                <>Select data sources to enhance {batchCount} selected products</>
              ) : hasScrapedData ? (
                <>Configure data sources for <span className="font-mono font-medium">{effectiveSku}</span></>
              ) : (
                <>Select sources to enhance <span className="font-mono font-medium">{originalName}</span></>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-600 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
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
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
                  <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                  Refreshing {sources.find((s) => s.id === isRefreshing)?.displayName}...
                </div>
              )}

              {enhancementJobId && (
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-600 bg-purple-50 p-3 rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                  Enhancement running...
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              {!isBatchMode && hasScrapedData ? (
                <EnrichmentDataPreview
                  sku={effectiveSku}
                  originalPrice={originalPrice}
                  resolvedData={resolvedData}
                  onFieldClick={handleFieldClick}
                />
              ) : (
                <div className="space-y-6">
                  <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
                    {isBatchMode ? (
                      <>
                        <Package className="mx-auto h-12 w-12 text-gray-600" />
                        <h3 className="mt-4 text-lg font-medium text-gray-900">Batch Enhancement</h3>
                        <p className="mt-2 text-sm text-gray-600 max-w-md mx-auto">
                          Select the data sources on the left, then click &quot;Run Enhancement&quot;
                          to fetch product data for all {batchCount} selected products.
                        </p>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="mx-auto h-12 w-12 text-gray-600" />
                        <h3 className="mt-4 text-lg font-medium text-gray-900">No Enhanced Data Yet</h3>
                        <p className="mt-2 text-sm text-gray-600 max-w-md mx-auto">
                          Select the data sources you want to use on the left, then click &quot;Run Enhancement&quot;
                          to fetch product data from those sources.
                        </p>
                      </>
                    )}
                  </div>

                  {isBatchMode ? (
                    <div className="bg-white rounded-lg border p-4 space-y-3">
                      <h4 className="font-medium text-gray-900">Selected Products</h4>
                      <p className="text-sm text-gray-600">
                        {batchCount} product{batchCount !== 1 ? 's' : ''} will be enhanced with the selected data sources.
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {skus?.slice(0, 5).map((s) => (
                          <span key={s} className="px-2 py-1 bg-gray-100 rounded text-xs font-mono">
                            {s}
                          </span>
                        ))}
                        {(skus?.length || 0) > 5 && (
                          <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
                            +{(skus?.length || 0) - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg border p-4 space-y-3">
                      <h4 className="font-medium text-gray-900">Original Import Data</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">SKU:</span>
                          <span className="ml-2 font-mono">{effectiveSku}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Price:</span>
                          <span className="ml-2 font-semibold text-green-600">{formatCurrency(originalPrice)}</span>
                          <span className="ml-1 text-xs text-gray-600">(protected)</span>
                        </div>
                        {originalName && originalName !== effectiveSku && (
                          <div className="col-span-2">
                            <span className="text-gray-600">Name:</span>
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
                              <span>
                                {enabledScrapers.length} scraper{enabledScrapers.length !== 1 ? 's' : ''}
                                {enabledB2B.length > 0 && ' and '}
                              </span>
                            )}
                            {enabledB2B.length > 0 && (
                              <span>{enabledB2B.length} B2B feed{enabledB2B.length !== 1 ? 's' : ''}</span>
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

        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50/50">
          <p className="text-xs text-gray-600">
            Price and SKU always come from the original import and cannot be changed.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            {!hasScrapedData ? (
              <button
                onClick={handleRunEnhancement}
                disabled={isRunningEnhancement || enabledSourceIds.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-[#008850] rounded-lg hover:bg-[#2a7034] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isRunningEnhancement ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run Enhancement
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-[#008850] rounded-lg hover:bg-[#2a7034] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </button>
            )}
          </div>
        </div>

        {conflictField && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]">
            <ConflictResolutionCard
              field={conflictField}
              options={conflictOptions}
              onSelectSource={handleSelectConflictSource}
              onClose={() => setConflictField(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
