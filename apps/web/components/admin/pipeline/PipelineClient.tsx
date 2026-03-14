'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { PipelineProduct, PipelineStatus, StatusCount } from '@/lib/pipeline';
import type { PipelineTab } from '@/lib/pipeline-tabs';
import { isStatusTab } from '@/lib/pipeline-tabs';
import { PipelineProductCard } from './PipelineProductCard';
import { PipelineProductDetail } from './PipelineProductDetail';
import { BulkActionsToolbar } from './BulkActionsToolbar';
import { ConsolidationProgressBanner } from './ConsolidationProgressBanner';
import { ConsolidationDetailsModal } from './ConsolidationDetailsModal';
import { EnrichmentWorkspace } from './enrichment/EnrichmentWorkspace';
import { MethodSelection, EnrichmentMethod } from '@/components/admin/enrichment/MethodSelection';
import { ChunkConfig } from '@/components/admin/enrichment/ChunkConfig';
import { ReviewSubmit } from '@/components/admin/enrichment/ReviewSubmit';
import { SyncClient } from '@/app/admin/tools/integra-sync/SyncClient';
import { PipelineFilters, type PipelineFiltersState } from './PipelineFilters';
import { ActiveRunsTab } from './ActiveRunsTab';
import { ActiveConsolidationsTab } from './ActiveConsolidationsTab';
import { ImageSelectionTab } from './ImageSelectionTab';
import { ExportTab } from './ExportTab';
import { useConsolidationWebSocket } from '@/lib/hooks/useConsolidationWebSocket';
import { Search, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { UndoToast } from './UndoToast';
import { undoQueue } from '@/lib/pipeline/undo';
import { scrapeProducts } from '@/lib/pipeline-scraping';
import { SkipLink } from '@/components/ui/skip-link';

const statusLabels: Record<PipelineStatus, string> = {
    registered: 'Registered',
    enriched: 'Enriched',
    finalized: 'Finalized',
    failed: 'Failed',
};

interface PipelineClientProps {
    initialProducts: PipelineProduct[];
    initialCounts: StatusCount[];
    initialTab: PipelineTab;
    initialFilteredCount: number;
}

export function PipelineClient({
    initialProducts,
    initialCounts,
    initialTab,
    initialFilteredCount,
}: PipelineClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [activeTab, setActiveTab] = useState<PipelineTab>(initialTab);
    const activeStatus = isStatusTab(activeTab) ? activeTab : 'registered';
    const [products, setProducts] = useState<PipelineProduct[]>(initialProducts);
    const [counts, setCounts] = useState<StatusCount[]>(initialCounts);
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
    const [isSelectingAllMatching, setIsSelectingAllMatching] = useState(false);
    const [search, setSearch] = useState(searchParams.get('search') || '');
    const [isPending, startTransition] = useTransition();
    const [viewingSku, setViewingSku] = useState<string | null>(null);

    const [filters, setFilters] = useState<PipelineFiltersState>({
        startDate: searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined,
        endDate: searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined,
        source: searchParams.get('source') || undefined,
        minConfidence: searchParams.get('minConfidence') ? parseFloat(searchParams.get('minConfidence')!) : undefined,
        maxConfidence: searchParams.get('maxConfidence') ? parseFloat(searchParams.get('maxConfidence')!) : undefined,
    });

    const [filteredCount, setFilteredCount] = useState<number>(initialFilteredCount);

    const [monitoringCounts, setMonitoringCounts] = useState({
        'active-runs': 0,
        'active-consolidations': 0,
    });
    const [imagesNeedingCount, setImagesNeedingCount] = useState(0);

    const [isConsolidating, setIsConsolidating] = useState(false);
    const [consolidationBatchId, setConsolidationBatchId] = useState<string | null>(null);
    const [consolidationProgress, setConsolidationProgress] = useState(0);
    const [isBannerDismissed, setIsBannerDismissed] = useState(false);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

    // Clear scrape results state
    const [isClearingScrapeResults, setIsClearingScrapeResults] = useState(false);

    const [enrichingSku, setEnrichingSku] = useState<string | null>(null);

    // Enrichment wizard state (multi-step flow)
    const [enrichmentStep, setEnrichmentStep] = useState<1 | 2 | 3 | null>(null);
    const [enrichmentMethod, setEnrichmentMethod] = useState<EnrichmentMethod>('scrapers');
    const [enrichmentMethodConfig, setEnrichmentMethodConfig] = useState<unknown>(null);
    const [enrichmentChunkConfig, setEnrichmentChunkConfig] = useState<{ chunkSize: number; maxWorkers: number; maxRunners?: number } | null>(null);

    // Integra import modal state
    const [showIntegraImport, setShowIntegraImport] = useState(false);

    // Track last selected index for shift-click range selection
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

    // WebSocket for real-time consolidation updates
    const ws = useConsolidationWebSocket();

    const buildQueryParams = (status: PipelineStatus, searchQuery: string, currentFilters: PipelineFiltersState) => {
        const params = new URLSearchParams();
        params.set('status', status);
        if (searchQuery) params.set('search', searchQuery);
        if (currentFilters.startDate) params.set('startDate', currentFilters.startDate.toISOString());
        if (currentFilters.endDate) params.set('endDate', currentFilters.endDate.toISOString());
        if (currentFilters.source) params.set('source', currentFilters.source);
        if (currentFilters.minConfidence !== undefined) params.set('minConfidence', currentFilters.minConfidence.toString());
        if (currentFilters.maxConfidence !== undefined) params.set('maxConfidence', currentFilters.maxConfidence.toString());
        return params.toString();
    };

    const updateUrl = (status: PipelineStatus, searchQuery: string, currentFilters: PipelineFiltersState) => {
        const query = buildQueryParams(status, searchQuery, currentFilters);
        router.push(`${pathname}?${query}`);
    };

    const handleRefresh = () => {
        if (!isStatusTab(activeTab)) return;
        const status = activeTab as PipelineStatus;
        startTransition(async () => {
            const query = buildQueryParams(status, search, filters);
            const [productsRes, countsRes] = await Promise.all([
                fetch(`/api/admin/pipeline?${query}`),
                fetch('/api/admin/pipeline/counts'),
            ]);

            if (productsRes.ok) {
                const data = await productsRes.json();
                setProducts(data.products);
                setFilteredCount(data.count || 0);
            }
            if (countsRes.ok) {
                const data = await countsRes.json();
                setCounts(data.counts);
            }
        });
    };

    // WebSocket subscription for consolidation progress (replaces polling)
    useEffect(() => {
        if (!consolidationBatchId) {
            // Connect to WebSocket when not tracking a batch
            ws.connect();
            return;
        }

        // Connect and subscribe to batch progress
        ws.connect();
        ws.subscribeToBatch(consolidationBatchId);

        // Handle progress updates from WebSocket
        if (ws.lastProgressEvent) {
            setConsolidationProgress(ws.lastProgressEvent.progress);

            if (ws.lastProgressEvent.status === 'completed' || ws.lastProgressEvent.status === 'failed') {
                setIsConsolidating(false);
                setConsolidationBatchId(null);
                handleRefresh();
            }
        }

        return () => {
            ws.unsubscribeFromBatch(consolidationBatchId);
        };
    }, [consolidationBatchId, ws.lastProgressEvent]);

    const handleTabChange = async (tab: PipelineTab) => {
        setActiveTab(tab);
        setSelectedSkus(new Set());
        setIsSelectingAllMatching(false);

        if (isStatusTab(tab)) {
            const status = tab as PipelineStatus;
            updateUrl(status, search, filters);
            startTransition(async () => {
                const query = buildQueryParams(status, search, filters);
                const res = await fetch(`/api/admin/pipeline?${query}`);
                if (res.ok) {
                    const data = await res.json();
                    setProducts(data.products);
                    setFilteredCount(data.count || 0);
                }
            });
        }
    };

    const handleSearch = async () => {
        if (!isStatusTab(activeTab)) return;
        const status = activeTab as PipelineStatus;
        updateUrl(status, search, filters);
        startTransition(async () => {
            const query = buildQueryParams(status, search, filters);
            const res = await fetch(`/api/admin/pipeline?${query}`);
            if (res.ok) {
                const data = await res.json();
                setProducts(data.products);
                setFilteredCount(data.count || 0);
                setSelectedSkus(new Set());
                setIsSelectingAllMatching(false);
            }
        });
    };

    const handleFilterChange = async (newFilters: PipelineFiltersState) => {
        if (!isStatusTab(activeTab)) return;
        const status = activeTab as PipelineStatus;
        setFilters(newFilters);
        updateUrl(status, search, newFilters);

        startTransition(async () => {
            const query = buildQueryParams(status, search, newFilters);
            const res = await fetch(`/api/admin/pipeline?${query}`);
            if (res.ok) {
                const data = await res.json();
                setProducts(data.products);
                setFilteredCount(data.count || 0);
                setSelectedSkus(new Set());
                setIsSelectingAllMatching(false);
            }
        });
    };

    const handleSelect = (sku: string, index: number, isShiftClick: boolean) => {
        const newSelected = new Set(selectedSkus);

        if (isShiftClick && lastSelectedIndex !== null && lastSelectedIndex !== index) {
            const start = Math.min(lastSelectedIndex, index);
            const end = Math.max(lastSelectedIndex, index);
            const isSelecting = !selectedSkus.has(sku);

            for (let i = start; i <= end; i++) {
                if (isSelecting) {
                    newSelected.add(products[i].sku);
                } else {
                    newSelected.delete(products[i].sku);
                }
            }
        } else {
            if (newSelected.has(sku)) {
                newSelected.delete(sku);
            } else {
                newSelected.add(sku);
            }
        }

        setSelectedSkus(newSelected);
        setLastSelectedIndex(index);
        setIsSelectingAllMatching(false);
    };

    const handleSelectAll = () => {
        if (selectedSkus.size === products.length && !isSelectingAllMatching) {
            setSelectedSkus(new Set());
            setLastSelectedIndex(null);
            setIsSelectingAllMatching(false);
        } else {
            setSelectedSkus(new Set(products.map((p) => p.sku)));
            setLastSelectedIndex(null);
            setIsSelectingAllMatching(false);
        }
    };

    const handleSelectAllMatching = async () => {
        if (!isStatusTab(activeTab)) return;
        const status = activeTab as PipelineStatus;
        startTransition(async () => {
            const query = buildQueryParams(status, search, filters);
            const res = await fetch(`/api/admin/pipeline?${query}&selectAll=true`);
            if (!res.ok) {
                toast.error('Failed to load all matching products');
                return;
            }

            const data = await res.json();
            const skus: string[] = data.skus || [];
            setSelectedSkus(new Set(skus));
            setFilteredCount(data.count || skus.length);
            setIsSelectingAllMatching(true);
        });
    };

    const handleBulkAction = async (action: 'enrich' | 'finalize' | 'reject' | 'retry' | 'delete') => {
        if (action === 'delete') {
            // Delete is handled separately via DeleteConfirmationDialog
            return;
        }

        if (!isStatusTab(activeTab)) return;
        const status = activeTab as PipelineStatus;

        const statusMap: Record<'enrich' | 'finalize' | 'reject' | 'retry', Record<PipelineStatus, PipelineStatus>> = {
            enrich: {
                registered: 'enriched',
                enriched: 'enriched',
                finalized: 'finalized',
                failed: 'failed',
            },
            finalize: {
                registered: 'registered',
                enriched: 'finalized',
                finalized: 'finalized',
                failed: 'failed',
            },
            reject: {
                registered: 'failed',
                enriched: 'registered',
                finalized: 'enriched',
                failed: 'failed',
            },
            retry: {
                registered: 'registered',
                enriched: 'enriched',
                finalized: 'finalized',
                failed: 'registered',
            },
        };

        const newStatus = statusMap[action][status];
        const skusToUpdate = Array.from(selectedSkus);
        const previousStatus = status;

        startTransition(async () => {
            const res = await fetch('/api/admin/pipeline/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skus: skusToUpdate, newStatus }),
            });

            if (res.ok) {
                // Refresh data
                const [productsRes, countsRes] = await Promise.all([
                    fetch(`/api/admin/pipeline?status=${status}`),
                    fetch('/api/admin/pipeline/counts'),
                ]);

                if (productsRes.ok) {
                    const data = await productsRes.json();
                    setProducts(data.products);
                }
                if (countsRes.ok) {
                    const data = await countsRes.json();
                    setCounts(data.counts);
                }
                setSelectedSkus(new Set());

                // Undo Logic
                const revert = async () => {
                    const revertRes = await fetch('/api/admin/pipeline/bulk', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ skus: skusToUpdate, newStatus: previousStatus }),
                    });

                    if (revertRes.ok) {
                        handleRefresh();
                    } else {
                        throw new Error('Revert failed');
                    }
                };

                undoQueue.add({
                    type: 'status_change',
                    skus: skusToUpdate,
                    fromStatus: previousStatus,
                    toStatus: newStatus,
                    revert
                });

                toast.custom((t) => (
                    <UndoToast
                        id={t}
                        count={skusToUpdate.length}
                        toStatus={statusLabels[newStatus]}
                        onUndo={revert}
                    />
                ), { duration: 30000 });
            }
        });
    };

    const handleConsolidate = async () => {
        if (selectedSkus.size === 0) return;

        setIsConsolidating(true);
        setIsBannerDismissed(false);
        setConsolidationProgress(0);

        try {
            const res = await fetch('/api/admin/consolidation/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skus: Array.from(selectedSkus) }),
            });

            if (res.ok) {
                const data = await res.json();
                const batchId =
                    typeof data.batch_id === 'string' && data.batch_id.length > 0
                        ? data.batch_id
                        : typeof data.jobId === 'string' && data.jobId.length > 0
                            ? data.jobId
                            : null;

                if (!batchId) {
                    setIsConsolidating(false);
                    toast.error('Consolidation started but no batch ID was returned');
                    return;
                }

                setConsolidationBatchId(batchId);
                setSelectedSkus(new Set());
                setIsSelectingAllMatching(false);
            } else {
                console.error('Failed to start consolidation');
                setIsConsolidating(false);
            }
        } catch (error) {
            console.error('Error submitting consolidation:', error);
            setIsConsolidating(false);
        }
    };

    const handleClearScrapeResults = async () => {
        if (selectedSkus.size === 0) return;

        const confirmed = window.confirm(
            `Are you sure you want to clear scrape results for ${selectedSkus.size} product${selectedSkus.size > 1 ? 's' : ''}? This will move them back to the Registered tab.`
        );

        if (!confirmed) return;

        setIsClearingScrapeResults(true);

        try {
            const res = await fetch('/api/admin/pipeline/clear-scrape-results', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skus: Array.from(selectedSkus) }),
            });

            if (res.ok) {
                toast.success(`Cleared scrape results for ${selectedSkus.size} product${selectedSkus.size > 1 ? 's' : ''}`);

                // Refresh data
                const [productsRes, countsRes] = await Promise.all([
                    fetch(`/api/admin/pipeline?status=${activeStatus}`),
                    fetch('/api/admin/pipeline/counts'),
                ]);

                if (productsRes.ok) {
                    const data = await productsRes.json();
                    setProducts(data.products);
                }
                if (countsRes.ok) {
                    const data = await countsRes.json();
                    setCounts(data.counts);
                }

                setSelectedSkus(new Set());
                setIsSelectingAllMatching(false);
            } else {
                const error = await res.json();
                toast.error(error.error || 'Failed to clear scrape results');
            }
        } catch (error) {
            console.error('Error clearing scrape results:', error);
            toast.error('Failed to clear scrape results');
        } finally {
            setIsClearingScrapeResults(false);
        }
    };

    const handleView = (sku: string) => {
        setViewingSku(sku);
    };

    const handleCloseModal = () => {
        setViewingSku(null);
    };

    const handleSaveModal = () => {
        // Refresh data after save
        handleRefresh();
    };



    return (
        <div className="space-y-6">
            <SkipLink />
            <div className="sr-only" role="status" aria-live="polite">
                {isPending ? 'Loading products...' : `Showing ${products.length} products in ${isStatusTab(activeTab) ? statusLabels[activeTab as PipelineStatus] : activeTab} stage`}
            </div>

            {/* ETL Pipeline Flow Visualization */}
            {/* Deprecated - removed */}

            {/* Status Tabs */}
            {/* Deprecated - removed */}

            {consolidationBatchId && (
                <ConsolidationProgressBanner
                    batchId={consolidationBatchId}
                    progress={consolidationProgress}
                    isDismissed={isBannerDismissed}
                    onDismiss={() => setIsBannerDismissed(true)}
                    onViewDetails={() => setIsBannerDismissed(false)}
                />
            )}

            <ConsolidationDetailsModal
                isOpen={isDetailsModalOpen}
                onClose={() => setIsDetailsModalOpen(false)}
                batchId={consolidationBatchId}
                status={ws.lastProgressEvent ? {
                    batchId: consolidationBatchId || '',
                    status: (ws.lastProgressEvent.status as string) === 'processing' ? 'in_progress' : ws.lastProgressEvent.status,
                    totalProducts: ws.lastProgressEvent.totalProducts || 0,
                    processedCount: ws.lastProgressEvent.processedProducts || 0,
                    successCount: ws.lastProgressEvent.successfulProducts || 0,
                    errorCount: ws.lastProgressEvent.failedProducts || 0,
                    errors: [],
                    results: []
                } : null}
            />

            {/* Search and Actions Bar */}
            <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                    <input
                        type="text"
                        placeholder="Search by SKU or name..."
                        aria-label="Search products by SKU or name"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
                    />
                </div>

                <PipelineFilters
                    filters={filters}
                    onFilterChange={handleFilterChange}
                />

                <button
                    onClick={handleRefresh}
                    disabled={isPending}
                    className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                    <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
                    Refresh
                </button>

                {products.length > 0 && (
                    <>
                        <button
                            onClick={handleSelectAll}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                        >
                            {selectedSkus.size === products.length ? 'Deselect All' : 'Select All'}
                        </button>
                        {!isSelectingAllMatching && products.length < filteredCount && (
                            <button
                                onClick={handleSelectAllMatching}
                                disabled={isPending}
                                className="rounded-lg border border-[#008850] px-4 py-2 text-sm text-[#008850] hover:bg-[#008850]/5 disabled:opacity-50"
                            >
                                Select All Matching ({filteredCount})
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* Import CTA for registered tab - always visible */}
            {activeStatus === 'registered' && (
                <div className="flex items-center justify-between rounded-lg bg-orange-50 border border-orange-200 px-4 py-3">
                    <div>
                        <p className="text-sm text-orange-900 font-medium">
                            Import products from external sources
                        </p>
                        <p className="text-xs text-orange-700">
                            Add new products from Integra register or other sources
                        </p>
                    </div>
                    <button
                        onClick={() => setShowIntegraImport(true)}
                        className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 transition-colors"
                    >
                        Import from Integra
                    </button>
                </div>
            )}

            {/* Selection Hint */}
            {products.length > 0 && (
                <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                        <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border text-gray-600 font-mono">Shift</kbd>
                        + click to select range
                    </span>
                    <span className="text-gray-300">|</span>
                    <span>{selectedSkus.size} selected</span>
                    {isSelectingAllMatching && (
                        <>
                            <span className="text-gray-300">|</span>
                            <span className="text-blue-600">All {filteredCount} matching products selected</span>
                        </>
                    )}
                </div>
            )}

            {(activeStatus === 'registered' || activeStatus === 'enriched') && selectedSkus.size > 0 && (
                <div className="flex items-center gap-4 rounded-lg bg-purple-50 border border-purple-200 px-4 py-3">
                    <div className="flex-1">
                        <p className="text-sm text-purple-900">
                            <strong>{selectedSkus.size}</strong> product{selectedSkus.size !== 1 ? 's' : ''} selected for enhancement
                        </p>
                    </div>
                    <button
                        onClick={() => setEnrichmentStep(1)}
                        className="flex items-center gap-2 rounded-lg bg-[#008850] px-4 py-2 text-sm font-medium text-white hover:bg-[#2a7034] transition-colors"
                    >
                        Enhance Products
                    </button>
                    <button
                        onClick={() => {
                            setSelectedSkus(new Set());
                            setIsSelectingAllMatching(false);
                        }}
                        className="text-sm text-purple-700 hover:text-purple-900"
                    >
                        Clear
                    </button>
                </div>
            )}

            {/* Bulk Actions - hidden on Registered tab */}
            {isStatusTab(activeTab) && activeTab !== 'registered' && (
                <BulkActionsToolbar
                    selectedCount={selectedSkus.size}
                    currentStatus={activeTab as PipelineStatus}
                    searchQuery={search}
                    onAction={handleBulkAction}
                    onBulkEnrich={() => setEnrichmentStep(1)}
                    isBulkEnriching={isPending}
                    onClearSelection={() => setSelectedSkus(new Set())}
                    onClearScrapeResults={handleClearScrapeResults}
                    isClearingScrapeResults={isClearingScrapeResults}
                />
            )}

            {/* Tab Content */}
            {activeTab === 'active-runs' && <ActiveRunsTab />}
            {activeTab === 'active-consolidations' && <ActiveConsolidationsTab />}
            {activeTab === 'images' && <ImageSelectionTab />}
            {activeTab === 'export' && <ExportTab productCounts={Object.fromEntries(counts.map(c => [c.status, c.count]))} />}
            
            {isStatusTab(activeTab) && (
                <div id="main-content" tabIndex={-1} className="scroll-mt-16 outline-none">
                    {isPending ? (
                        <div className="flex h-64 items-center justify-center">
                            <RefreshCw className="h-8 w-8 animate-spin text-gray-600" />
                        </div>
                    ) : products.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
                            <p className="text-gray-600">No products in &quot;{statusLabels[activeTab as PipelineStatus]}&quot; stage.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {products.map((product, index) => (
                                <PipelineProductCard
                                    key={product.sku}
                                    product={product}
                                    index={index}
                                    isSelected={selectedSkus.has(product.sku)}
                                    onSelect={handleSelect}
                                    onView={handleView}
                                    onEnrich={setEnrichingSku}
                                    showEnrichButton={activeTab === 'registered'}
                                    readOnly={activeTab === 'registered'}
                                    showBatchSelect={activeTab === 'registered'}
                                    currentStage={activeTab as PipelineStatus}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Load More and Count Info */}
            {!isPending && products.length > 0 && (
                <div className="flex flex-col items-center gap-4 pt-4">
                    <p className="text-sm text-gray-600">
                        Showing {products.length} of {filteredCount} matching products
                    </p>
                    {products.length < filteredCount && (
                        <button
                            onClick={async () => {
                                startTransition(async () => {
                                    const query = buildQueryParams(activeTab as PipelineStatus, search, filters);
                                    const res = await fetch(`/api/admin/pipeline?${query}&offset=${products.length}&limit=200`);
                                    if (res.ok) {
                                        const data = await res.json();
                                        setProducts([...products, ...data.products]);
                                        setFilteredCount(data.count || filteredCount);
                                    }
                                });
                            }}
                            disabled={isPending}
                            className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                        >
                            Load More
                        </button>
                    )}
                </div>
            )}

            {/* Product Detail Modal */}
            {viewingSku && (
                <PipelineProductDetail
                    sku={viewingSku}
                    onClose={handleCloseModal}
                    onSave={handleSaveModal}
                />
            )}

            {/* Enrichment Workspace Modal */}
            {enrichingSku && (
                <EnrichmentWorkspace
                    sku={enrichingSku}
                    onClose={() => setEnrichingSku(null)}
                    onSave={handleRefresh}
                />
            )}

            {/* Enrichment Wizard Modal - Multi-step flow */}
            {enrichmentStep && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="p-8 overflow-y-auto flex-1">
                            {enrichmentStep === 1 && (
                                <MethodSelection
                                    selectedSkus={Array.from(selectedSkus)}
                                    onNext={(data) => {
                                        setEnrichmentMethod(data.method);
                                        setEnrichmentMethodConfig(data.config);
                                        setEnrichmentStep(2);
                                    }}
                                    onBack={() => setEnrichmentStep(null)}
                                />
                            )}
                            {enrichmentStep === 2 && (
                                <ChunkConfig
                                    method={enrichmentMethod}
                                    config={enrichmentMethodConfig}
                                    selectedSkus={Array.from(selectedSkus)}
                                    onNext={(data) => {
                                        setEnrichmentChunkConfig(data);
                                        setEnrichmentStep(3);
                                    }}
                                    onBack={() => setEnrichmentStep(1)}
                                />
                            )}
                            {enrichmentStep === 3 && (
                                <ReviewSubmit
                                    selectedSkus={Array.from(selectedSkus)}
                                    method={enrichmentMethod}
                                    methodConfig={enrichmentMethodConfig || { scrapers: [] }}
                                    chunkConfig={enrichmentChunkConfig || { chunkSize: 50, maxWorkers: 3 }}
                                    onBack={() => setEnrichmentStep(2)}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Integra Import Modal */}
            {showIntegraImport && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
                        <div className="p-6 border-b border-gray-200">
                            <h2 className="text-xl font-bold">Import from Integra</h2>
                            <p className="text-sm text-gray-600">
                                Upload your Integra register export to import products
                            </p>
                        </div>
                        <div className="p-6 overflow-auto max-h-[70vh]">
                            <SyncClient />
                        </div>
                        <div className="p-4 border-t border-gray-200 flex justify-end">
                            <button
                                onClick={() => {
                                    setShowIntegraImport(false);
                                    handleRefresh();
                                }}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
