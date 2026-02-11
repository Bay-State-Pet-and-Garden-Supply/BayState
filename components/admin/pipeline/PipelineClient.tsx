'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { PipelineProduct, PipelineStatus, StatusCount } from '@/lib/pipeline';
import { scrapeProducts, checkRunnersAvailable } from '@/lib/pipeline-scraping';
import { PipelineStatusTabs } from './PipelineStatusTabs';
import { PipelineProductCard } from './PipelineProductCard';
import { PipelineProductDetail } from './PipelineProductDetail';
import { BulkActionsToolbar } from './BulkActionsToolbar';
import { BatchEnhanceToolbar } from './BatchEnhanceToolbar';
import { BatchJobsPanel } from './BatchJobsPanel';
import { ConsolidationProgressBanner } from './ConsolidationProgressBanner';
import { EnrichmentWorkspace } from './enrichment/EnrichmentWorkspace';
import { PipelineFilters, type PipelineFiltersState } from './PipelineFilters';
import { PipelineFlowVisualization } from './PipelineFlowVisualization';
import { useConsolidationWebSocket } from '@/lib/hooks/useConsolidationWebSocket';
import { Search, RefreshCw, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { UndoToast } from './UndoToast';
import { undoQueue } from '@/lib/pipeline/undo';
import { SkipLink } from '@/components/ui/skip-link';

const statusLabels: Record<PipelineStatus, string> = {
    staging: 'Imported',
    scraped: 'Enhanced',
    consolidated: 'Ready for Review',
    approved: 'Verified',
    published: 'Live',
    failed: 'Failed',
};

interface PipelineClientProps {
    initialProducts: PipelineProduct[];
    initialCounts: StatusCount[];
    initialStatus: PipelineStatus;
    initialFilteredCount: number;
}

export function PipelineClient({
    initialProducts,
    initialCounts,
    initialStatus,
    initialFilteredCount,
}: PipelineClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [activeStatus, setActiveStatus] = useState<PipelineStatus>(initialStatus);
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

    // Scraping state
    const [isScraping, setIsScraping] = useState(false);
    const [runnersAvailable, setRunnersAvailable] = useState(false);
    const [scrapeJobIds, setScrapeJobIds] = useState<string[]>([]);
    const [filteredCount, setFilteredCount] = useState<number>(initialFilteredCount);

    const [isConsolidating, setIsConsolidating] = useState(false);
    const [consolidationBatchId, setConsolidationBatchId] = useState<string | null>(null);
    const [consolidationProgress, setConsolidationProgress] = useState(0);
    const [isBannerDismissed, setIsBannerDismissed] = useState(false);

    const [enrichingSku, setEnrichingSku] = useState<string | null>(null);

    // Batch enhance workspace state
    const [showBatchEnhanceWorkspace, setShowBatchEnhanceWorkspace] = useState(false);

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
        startTransition(async () => {
            const query = buildQueryParams(activeStatus, search, filters);
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

            // Refresh runner status
            if (activeStatus === 'staging') {
                checkRunnersAvailable().then(setRunnersAvailable);
            }
        });
    };

    useEffect(() => {
        if (activeStatus === 'staging') {
            checkRunnersAvailable().then(setRunnersAvailable);
        }
    }, [activeStatus]);

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

    const handleStatusChange = async (status: PipelineStatus) => {
        setActiveStatus(status);
        setSelectedSkus(new Set());
        setIsSelectingAllMatching(false);
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
    };

    const handleSearch = async () => {
        updateUrl(activeStatus, search, filters);
        startTransition(async () => {
            const query = buildQueryParams(activeStatus, search, filters);
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
        setFilters(newFilters);
        updateUrl(activeStatus, search, newFilters);
        
        startTransition(async () => {
            const query = buildQueryParams(activeStatus, search, newFilters);
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
        startTransition(async () => {
            const query = buildQueryParams(activeStatus, search, filters);
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

    const handleBulkAction = async (action: 'approve' | 'publish' | 'reject' | 'consolidate' | 'delete') => {
        if (action === 'delete') {
            // Delete is handled separately via DeleteConfirmationDialog
            return;
        }

        const statusMap: Record<string, Record<PipelineStatus, PipelineStatus>> = {
            approve: { consolidated: 'approved', staging: 'staging', scraped: 'scraped', approved: 'approved', published: 'published', failed: 'failed' },
            publish: { approved: 'published', staging: 'staging', scraped: 'scraped', consolidated: 'consolidated', published: 'published', failed: 'failed' },
            reject: { consolidated: 'staging', approved: 'consolidated', staging: 'staging', scraped: 'staging', published: 'approved', failed: 'failed' },
            consolidate: { staging: 'consolidated', scraped: 'consolidated', consolidated: 'consolidated', approved: 'approved', published: 'published', failed: 'failed' },
        };

        const newStatus = statusMap[action][activeStatus];
        const skusToUpdate = Array.from(selectedSkus);
        const previousStatus = activeStatus;

        startTransition(async () => {
            const res = await fetch('/api/admin/pipeline/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skus: skusToUpdate, newStatus }),
            });

            if (res.ok) {
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

    const handleScrape = async (scrapers?: string[]) => {
        if (selectedSkus.size === 0) return;

        setIsScraping(true);
        setShowBatchEnhanceWorkspace(false);

        const result = await scrapeProducts(Array.from(selectedSkus), {
            scrapers: scrapers,
        });

        if (result.success && result.jobIds && result.jobIds.length > 0) {
            setScrapeJobIds(result.jobIds);
            // Clear selection after starting scrape
            setSelectedSkus(new Set());
            setIsSelectingAllMatching(false);
        } else {
            console.error('Failed to start scraping:', result.error);
        }

        setIsScraping(false);
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
                setConsolidationBatchId(data.jobId);
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

    const handleApplyBatch = async (batchId: string) => {
        try {
            const res = await fetch(`/api/admin/consolidation/${batchId}/apply`, {
                method: 'POST'
            });
            if (res.ok) {
                handleRefresh();
            }
        } catch (error) {
            console.error('Error applying batch:', error);
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
                {isPending ? 'Loading products...' : `Showing ${products.length} products in ${statusLabels[activeStatus]} stage`}
            </div>

            {/* ETL Pipeline Flow Visualization */}
            <PipelineFlowVisualization 
                currentStage={activeStatus}
                counts={counts}
            />

            {/* Status Tabs */}
            <PipelineStatusTabs
                counts={counts}
                activeStatus={activeStatus}
                onStatusChange={handleStatusChange}
            />

            <BatchJobsPanel
                onApplyBatch={handleApplyBatch}
                activeBatchId={consolidationBatchId}
            />

            {consolidationBatchId && (
                <ConsolidationProgressBanner
                    batchId={consolidationBatchId}
                    progress={consolidationProgress}
                    isDismissed={isBannerDismissed}
                    onDismiss={() => setIsBannerDismissed(true)}
                    onViewDetails={() => setIsBannerDismissed(false)}
                />
            )}

            {/* Scraping Job Banner */}
            {scrapeJobIds.length > 0 && (
                <div className="flex items-center gap-3 rounded-lg bg-purple-50 border border-purple-200 px-4 py-3">
                    <Bot className="h-5 w-5 text-purple-600 animate-pulse" />
                    <span className="text-sm text-purple-800">
                        Enhancement running: {scrapeJobIds.length} job{scrapeJobIds.length !== 1 ? 's' : ''}. Products will move to &quot;Enhanced&quot; when complete.
                    </span>
                    <button
                        onClick={() => setScrapeJobIds([])}
                        className="ml-auto text-sm text-purple-600 hover:text-purple-800"
                    >
                        Dismiss
                    </button>
                </div>
            )}

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
                    disabled={isPending || isScraping}
                    className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                    <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
                    Refresh
                </button>

                {products.length > 0 && (
                    <>
                        <button
                            onClick={handleSelectAll}
                            disabled={isScraping}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                        >
                            {selectedSkus.size === products.length ? 'Deselect All' : 'Select All'}
                        </button>
                        {!isSelectingAllMatching && products.length < filteredCount && (
                            <button
                                onClick={handleSelectAllMatching}
                                disabled={isScraping || isPending}
                                className="rounded-lg border border-[#008850] px-4 py-2 text-sm text-[#008850] hover:bg-[#008850]/5 disabled:opacity-50"
                            >
                                Select All Matching ({filteredCount})
                            </button>
                        )}
                    </>
                )}
            </div>

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

            {/* Batch Enhance Toolbar for Imported (staging) tab */}
            {activeStatus === 'staging' && (
                <BatchEnhanceToolbar
                    selectedCount={selectedSkus.size}
                    allCount={filteredCount}
                    selectingAllMatching={isSelectingAllMatching}
                    onBatchEnhance={() => setShowBatchEnhanceWorkspace(true)}
                    isEnhancing={isScraping}
                    runnersAvailable={runnersAvailable}
                    onClearSelection={() => {
                        setSelectedSkus(new Set());
                        setIsSelectingAllMatching(false);
                    }}
                />
            )}

            {/* Bulk Actions - hidden on Imported (staging) tab */}
            {activeStatus !== 'staging' && (
                <BulkActionsToolbar
                    selectedCount={selectedSkus.size}
                    currentStatus={activeStatus}
                    searchQuery={search}
                    onAction={handleBulkAction}
                    onScrape={handleScrape}
                    isScraping={isScraping}
                    runnersAvailable={runnersAvailable}
                    onConsolidate={handleConsolidate}
                    isConsolidating={isConsolidating}
                    onClearSelection={() => setSelectedSkus(new Set())}
                />
            )}

            {/* Product Grid */}
            <div id="main-content" tabIndex={-1} className="scroll-mt-16 outline-none">
            {isPending ? (
                <div className="flex h-64 items-center justify-center">
                    <RefreshCw className="h-8 w-8 animate-spin text-gray-600" />
                </div>
            ) : products.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
                    <p className="text-gray-600">No products in &quot;{statusLabels[activeStatus]}&quot; stage.</p>
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
                            showEnrichButton={activeStatus === 'scraped'}
                            readOnly={activeStatus === 'staging'}
                            showBatchSelect={activeStatus === 'staging'}
                            currentStage={activeStatus}
                        />
                    ))}
                </div>
            )}
            </div>

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
                                    const query = buildQueryParams(activeStatus, search, filters);
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

            {/* Batch Enhance Workspace - uses same UI as single enhancement */}
            {showBatchEnhanceWorkspace && (
                <EnrichmentWorkspace
                    skus={Array.from(selectedSkus)}
                    onClose={() => setShowBatchEnhanceWorkspace(false)}
                    onRunBatch={(jobIds) => setScrapeJobIds(jobIds)}
                    onSave={() => {
                        setSelectedSkus(new Set());
                        handleRefresh();
                    }}
                />
            )}
        </div>
    );
}
