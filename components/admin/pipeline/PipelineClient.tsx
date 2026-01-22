'use client';

import { useState, useTransition, useEffect } from 'react';
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
import { Search, RefreshCw, Bot } from 'lucide-react';

const statusLabels: Record<PipelineStatus, string> = {
    staging: 'Imported',
    scraped: 'Enhanced',
    consolidated: 'Ready for Review',
    approved: 'Verified',
    published: 'Live',
};

interface PipelineClientProps {
    initialProducts: PipelineProduct[];
    initialCounts: StatusCount[];
    initialStatus: PipelineStatus;
}

export function PipelineClient({ initialProducts, initialCounts, initialStatus }: PipelineClientProps) {
    const [activeStatus, setActiveStatus] = useState<PipelineStatus>(initialStatus);
    const [products, setProducts] = useState<PipelineProduct[]>(initialProducts);
    const [counts, setCounts] = useState<StatusCount[]>(initialCounts);
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState('');
    const [isPending, startTransition] = useTransition();
    const [viewingSku, setViewingSku] = useState<string | null>(null);

    // Scraping state
    const [isScraping, setIsScraping] = useState(false);
    const [runnersAvailable, setRunnersAvailable] = useState(false);
    const [scrapeJobIds, setScrapeJobIds] = useState<string[]>([]);

    const [isConsolidating, setIsConsolidating] = useState(false);
    const [consolidationBatchId, setConsolidationBatchId] = useState<string | null>(null);
    const [consolidationProgress, setConsolidationProgress] = useState(0);
    const [isBannerDismissed, setIsBannerDismissed] = useState(false);

    const [enrichingSku, setEnrichingSku] = useState<string | null>(null);

    // Batch enhance workspace state
    const [showBatchEnhanceWorkspace, setShowBatchEnhanceWorkspace] = useState(false);

    const handleRefresh = () => {
        startTransition(async () => {
            const [productsRes, countsRes] = await Promise.all([
                fetch(`/api/admin/pipeline?status=${activeStatus}&search=${encodeURIComponent(search)}`),
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

    useEffect(() => {
        if (!consolidationBatchId) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/admin/consolidation/${consolidationBatchId}`);
                if (res.ok) {
                    const data = await res.json();
                    setConsolidationProgress(data.progress || 0);

                    if (data.status === 'completed' || data.status === 'failed') {
                        setIsConsolidating(false);
                        setConsolidationBatchId(null);
                        handleRefresh();
                    }
                }
            } catch (error) {
                console.error('Error polling consolidation status:', error);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [consolidationBatchId]);

    const handleStatusChange = async (status: PipelineStatus) => {
        setActiveStatus(status);
        setSelectedSkus(new Set());

        startTransition(async () => {
            const res = await fetch(`/api/admin/pipeline?status=${status}&search=${encodeURIComponent(search)}`);
            if (res.ok) {
                const data = await res.json();
                setProducts(data.products);
            }
        });
    };

    const handleSearch = async () => {
        startTransition(async () => {
            const res = await fetch(`/api/admin/pipeline?status=${activeStatus}&search=${encodeURIComponent(search)}`);
            if (res.ok) {
                const data = await res.json();
                setProducts(data.products);
            }
        });
    };

    const handleSelect = (sku: string) => {
        const newSelected = new Set(selectedSkus);
        if (newSelected.has(sku)) {
            newSelected.delete(sku);
        } else {
            newSelected.add(sku);
        }
        setSelectedSkus(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedSkus.size === products.length) {
            setSelectedSkus(new Set());
        } else {
            setSelectedSkus(new Set(products.map((p) => p.sku)));
        }
    };

    const handleBulkAction = async (action: 'approve' | 'publish' | 'reject' | 'consolidate') => {
        const statusMap: Record<string, Record<PipelineStatus, PipelineStatus>> = {
            approve: { consolidated: 'approved', staging: 'staging', scraped: 'scraped', approved: 'approved', published: 'published' },
            publish: { approved: 'published', staging: 'staging', scraped: 'scraped', consolidated: 'consolidated', published: 'published' },
            reject: { consolidated: 'staging', approved: 'consolidated', staging: 'staging', scraped: 'staging', published: 'approved' },
            consolidate: { staging: 'consolidated', scraped: 'consolidated', consolidated: 'consolidated', approved: 'approved', published: 'published' },
        };

        const newStatus = statusMap[action][activeStatus];

        startTransition(async () => {
            const res = await fetch('/api/admin/pipeline/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skus: Array.from(selectedSkus), newStatus }),
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
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
                    />
                </div>

                <button
                    onClick={handleRefresh}
                    disabled={isPending || isScraping}
                    className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                    <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
                    Refresh
                </button>

                {products.length > 0 && (
                    <button
                        onClick={handleSelectAll}
                        disabled={isScraping}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                        {selectedSkus.size === products.length ? 'Deselect All' : 'Select All'}
                    </button>
                )}
            </div>

            {/* Batch Enhance Toolbar for Imported (staging) tab */}
            {activeStatus === 'staging' && (
                <BatchEnhanceToolbar
                    selectedCount={selectedSkus.size}
                    onBatchEnhance={() => setShowBatchEnhanceWorkspace(true)}
                    isEnhancing={isScraping}
                    runnersAvailable={runnersAvailable}
                    onClearSelection={() => setSelectedSkus(new Set())}
                />
            )}

            {/* Bulk Actions - hidden on Imported (staging) tab */}
            {activeStatus !== 'staging' && (
                <BulkActionsToolbar
                    selectedCount={selectedSkus.size}
                    currentStatus={activeStatus}
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
                    {products.map((product) => (
                        <PipelineProductCard
                            key={product.sku}
                            product={product}
                            isSelected={selectedSkus.has(product.sku)}
                            onSelect={handleSelect}
                            onView={handleView}
                            onEnrich={setEnrichingSku}
                            showEnrichButton={activeStatus === 'scraped'}
                            readOnly={activeStatus === 'staging'}
                            showBatchSelect={activeStatus === 'staging'}
                        />
                    ))}
                </div>
            )}

            {/* Load More and Count Info */}
            {!isPending && products.length > 0 && (
                <div className="flex flex-col items-center gap-4 pt-4">
                    <p className="text-sm text-gray-600">
                        Showing {products.length} of {counts.find(c => c.status === activeStatus)?.count || 0} products
                    </p>
                    {products.length < (counts.find(c => c.status === activeStatus)?.count || 0) && (
                        <button
                            onClick={async () => {
                                startTransition(async () => {
                                    const res = await fetch(`/api/admin/pipeline?status=${activeStatus}&search=${encodeURIComponent(search)}&offset=${products.length}&limit=200`);
                                    if (res.ok) {
                                        const data = await res.json();
                                        setProducts([...products, ...data.products]);
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
