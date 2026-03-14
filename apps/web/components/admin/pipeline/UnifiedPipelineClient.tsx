'use client';

import { useState, useEffect } from 'react';
import { Package, Search, RefreshCw, Filter, Upload, Download, Plus } from 'lucide-react';
import { PipelineProductCard } from './PipelineProductCard';
import { BulkActionsToolbar } from './BulkActionsToolbar';
import { PipelineProductDetail } from './PipelineProductDetail';
import { BatchEnhanceDialog } from './BatchEnhanceDialog';
import { ManualAddProductDialog } from './ManualAddProductDialog';
import { UndoToast } from './UndoToast';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SyncClient } from '@/app/admin/tools/integra-sync/SyncClient';
import { undoQueue } from '@/lib/pipeline/undo';
import type { PipelineProduct, PipelineStatus, StatusCount } from '@/lib/pipeline';
import { PipelineFilters, type PipelineFiltersState } from './PipelineFilters';

const statusLabels: Record<PipelineStatus, string> = {
  registered: 'Registered',
  enriched: 'Enriched',
  finalized: 'Finalized',
  failed: 'Failed',
};

interface UnifiedPipelineClientProps {
  initialProducts: PipelineProduct[];
  initialCounts: StatusCount[];
}

export function UnifiedPipelineClient({
  initialProducts,
  initialCounts,
}: UnifiedPipelineClientProps) {
  const [products, setProducts] = useState<PipelineProduct[]>(initialProducts);
  const [counts, setCounts] = useState<StatusCount[]>(initialCounts);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PipelineStatus | 'all'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [viewingSku, setViewingSku] = useState<string | null>(null);
  const [isSelectingAllMatching, setIsSelectingAllMatching] = useState(false);
  const [isBulkActionPending, setIsBulkActionPending] = useState(false);
  const [isClearingScrapeResults, setIsClearingScrapeResults] = useState(false);
  const [isBulkEnriching, setIsBulkEnriching] = useState(false);
  const [showProductDetail, setShowProductDetail] = useState(false);
  const [showBatchEnhanceDialog, setShowBatchEnhanceDialog] = useState(false);
  const [showManualAddDialog, setShowManualAddDialog] = useState(false);
  const [enrichingSkus, setEnrichingSkus] = useState<string[]>([]);

  const [showIntegraImport, setShowIntegraImport] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportStatus, setExportStatus] = useState<PipelineStatus>('registered');
  const [exportSearch, setExportSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [filters, setFilters] = useState<PipelineFiltersState>({});

  // Refresh products when status filter changes
  useEffect(() => {
    void handleRefresh();
  }, [statusFilter]);

  const getCount = (status: PipelineStatus): number => {
    const found = counts.find(c => c.status === status);
    return found ? found.count : 0;
  };

  const totalProducts = counts.reduce((sum, c) => sum + c.count, 0);

  const pipelineStages: Array<{ status: PipelineStatus; color: string }> = [
    { status: 'registered', color: 'bg-orange-500' },
    { status: 'enriched', color: 'bg-blue-500' },
    { status: 'finalized', color: 'bg-green-500' },
    { status: 'failed', color: 'bg-red-500' },
  ];

  const getRequestStatus = (): PipelineStatus | null => {
    return statusFilter === 'all' ? null : statusFilter;
  };

  const handleRefresh = async (showSuccessToast = false) => {
    setIsRefreshing(true);

    try {
      const params = new URLSearchParams();
      const requestStatus = getRequestStatus();
      if (requestStatus) {
        params.set('status', requestStatus);
      }
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const [productsRes, countsRes] = await Promise.all([
        fetch(`/api/admin/pipeline?${params.toString()}`),
        fetch('/api/admin/pipeline/counts'),
      ]);

      if (!productsRes.ok || !countsRes.ok) {
        throw new Error('Failed to refresh pipeline data');
      }

      const productsData = await productsRes.json();
      const countsData = await countsRes.json();

      setProducts(productsData.products ?? []);
      setCounts(countsData.counts ?? []);

      if (showSuccessToast) {
        toast.success('Pipeline data refreshed');
      }
    } catch (error) {
      console.error('Refresh failed:', error);
      toast.error('Failed to refresh pipeline data');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSelect = (sku: string, index: number, isShiftClick: boolean) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev);
      if (isShiftClick && lastSelectedIndex !== null) {
        const [start, end] = [lastSelectedIndex, index].sort((a, b) => a - b);
        for (let i = start; i <= end; i++) {
          if (products[i]) {
            newSet.add(products[i].sku);
          }
        }
      } else {
        if (newSet.has(sku)) {
          newSet.delete(sku);
        } else {
          newSet.add(sku);
        }
        setLastSelectedIndex(index);
      }
      return newSet;
    });

    setIsSelectingAllMatching(false);
  };

  const handleView = (sku: string) => {
    setViewingSku(sku);
    setShowProductDetail(true);
  };

  const handleCloseModal = () => {
    setViewingSku(null);
    setShowProductDetail(false);
  };

  const handleSaveModal = () => {
    handleCloseModal();
    void handleRefresh();
  };

  const handleSelectAll = () => {
    const allSkus = products.map((p) => p.sku);
    const allSelected = allSkus.length > 0 && allSkus.every((sku) => selectedProducts.has(sku));

    if (allSelected) {
      // Deselect all
      setSelectedProducts((prev) => {
        const newSet = new Set(prev);
        allSkus.forEach((sku) => newSet.delete(sku));
        return newSet;
      });
    } else {
      // Select all
      setSelectedProducts((prev) => {
        const newSet = new Set(prev);
        allSkus.forEach((sku) => newSet.add(sku));
        return newSet;
      });
    }

    setLastSelectedIndex(null);
    setIsSelectingAllMatching(false);
  };

  const handleSelectAllMatching = async () => {
    setIsSelectingAllMatching(true);
    try {
      const params = new URLSearchParams();
      const requestStatus = getRequestStatus();
      if (requestStatus) {
        params.set('status', requestStatus);
      }
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }
      if (filters.startDate) {
        params.set('startDate', filters.startDate.toISOString());
      }
      if (filters.endDate) {
        params.set('endDate', filters.endDate.toISOString());
      }
      if (filters.source) {
        params.set('source', filters.source);
      }
      if (filters.minConfidence !== undefined) {
        params.set('minConfidence', filters.minConfidence.toString());
      }
      if (filters.maxConfidence !== undefined) {
        params.set('maxConfidence', filters.maxConfidence.toString());
      }
      params.set('limit', '1000'); // Get all matching

      const res = await fetch(`/api/admin/pipeline?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to select matching products');
      }

      const data = await res.json();
      const allMatchingSkus = (data.products ?? []).map((p: PipelineProduct) => p.sku);
      setSelectedProducts(new Set(allMatchingSkus));
      toast.success(`Selected ${allMatchingSkus.length} products`);
    } catch (error) {
      console.error('Select all matching failed:', error);
      toast.error('Failed to select all matching products');
    } finally {
      setIsSelectingAllMatching(false);
    }
  };

  const handleBulkAction = async (action: 'enrich' | 'finalize' | 'reject' | 'retry' | 'delete') => {
    if (selectedProducts.size === 0) return;

    const selectedSkus = Array.from(selectedProducts);
    const selectedCount = selectedSkus.length;
    const currentStatus = getRequestStatus() || 'registered';
    const actionLabels: Record<'enrich' | 'finalize' | 'reject' | 'retry' | 'delete', string> = {
      enrich: 'Enriched',
      finalize: 'Finalized',
      reject: 'Rejected',
      retry: 'Retried',
      delete: 'Deleted',
    };

    setIsBulkActionPending(true);
    try {
      if (action === 'delete') {
        const res = await fetch('/api/admin/pipeline/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skus: selectedSkus }),
        });

        if (!res.ok) {
          const error = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(error?.error || 'Failed to delete products');
          return;
        }

        toast.success(`${actionLabels[action]} ${selectedCount} product${selectedCount === 1 ? '' : 's'}`);
        setSelectedProducts(new Set());
        setIsSelectingAllMatching(false);
        await handleRefresh();
        return;
      }

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

      const newStatus = statusMap[action][currentStatus];
      const res = await fetch('/api/admin/pipeline/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skus: selectedSkus,
          newStatus,
        }),
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(error?.error || `Failed to ${action} products`);
        return;
      }

      const revert = async () => {
        const revertRes = await fetch('/api/admin/pipeline/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skus: selectedSkus,
            newStatus: currentStatus,
          }),
        });

        if (!revertRes.ok) {
          throw new Error('Failed to undo bulk action');
        }

        await handleRefresh();
      };

      if (newStatus !== currentStatus) {
        undoQueue.add({
          type: 'status_change',
          skus: selectedSkus,
          fromStatus: currentStatus,
          toStatus: newStatus,
          revert,
        });

        toast.custom((toastId) => (
          <UndoToast
            id={toastId}
            count={selectedCount}
            toStatus={statusLabels[newStatus]}
            onUndo={revert}
          />
        ), { duration: 30000 });
      }

      toast.success(`${actionLabels[action]} ${selectedCount} product${selectedCount === 1 ? '' : 's'}`);
      setSelectedProducts(new Set());
      setIsSelectingAllMatching(false);
      await handleRefresh();
    } catch (error) {
      console.error('Bulk action failed:', error);
      toast.error(`Failed to ${action} products`);
    } finally {
      setIsBulkActionPending(false);
    }
  };

  const handleClearScrapeResults = async () => {
    if (selectedProducts.size === 0) return;

    if (!window.confirm(`Clear scrape results for ${selectedProducts.size} products? This will move them back to Imported.`)) {
      return;
    }

    setIsClearingScrapeResults(true);
    try {
      const res = await fetch('/api/admin/pipeline/clear-scrape-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skus: Array.from(selectedProducts),
          method: 'scrapers',
          config: { scrapers: [] },
          chunkSize: 10,
          maxWorkers: 3,
        }),
      });

      if (res.ok) {
        toast.success(`Cleared scrape results for ${selectedProducts.size} products`);
        setSelectedProducts(new Set());
        setIsSelectingAllMatching(false);
        await handleRefresh();
      } else {
        const error = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(error?.error || 'Failed to clear scrape results');
      }
    } catch (error) {
      console.error('Clear scrape results failed:', error);
      toast.error('Failed to clear scrape results');
    } finally {
      setIsClearingScrapeResults(false);
    }
  };

  const handleBatchEnhanceConfirm = async ({ scrapers, useAiSearch }: { scrapers: string[], useAiSearch: boolean }) => {
    if (enrichingSkus.length === 0) return;

    setIsBulkEnriching(true);
    try {
      const requests: Promise<Response>[] = [];

      if (scrapers.length > 0) {
        requests.push(fetch('/api/admin/enrichment/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skus: enrichingSkus,
            method: 'scrapers',
            config: { scrapers },
            chunkSize: 10,
            maxWorkers: 3,
          }),
        }));
      }

      if (useAiSearch) {
        requests.push(fetch('/api/admin/enrichment/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skus: enrichingSkus,
            method: 'ai_search',
            chunkSize: 10,
            maxWorkers: 3,
          }),
        }));
      }

      if (requests.length === 0) {
        setIsBulkEnriching(false);
        return;
      }

      const results = await Promise.all(requests);
      const failedRes = results.find(res => !res.ok);

      if (!failedRes) {
        toast.success(`Started enrichment for ${enrichingSkus.length} product${enrichingSkus.length === 1 ? '' : 's'}`);
        setShowBatchEnhanceDialog(false);
        setEnrichingSkus([]);
        setSelectedProducts(new Set());
        await handleRefresh();
      } else {
        const error = await failedRes.json().catch(() => null);
        toast.error(error?.error || 'Failed to start enrichment');
      }
    } catch (error) {
      console.error('Enrichment failed:', error);
      toast.error('Failed to start enrichment');
    } finally {
      setIsBulkEnriching(false);
    }
  };

  const handleBulkEnrich = () => {
    if (selectedProducts.size === 0) return;
    setEnrichingSkus(Array.from(selectedProducts));
    setShowBatchEnhanceDialog(true);
  };

  const handleEnrich = (sku: string) => {
    setEnrichingSkus([sku]);
    setShowBatchEnhanceDialog(true);
  };

  const openExportDialog = () => {
    // If getRequestStatus() returns null (meaning 'all'), fall back to 'registered'
    // so export dialog always has a valid PipelineStatus selected.
    setExportStatus(getRequestStatus() ?? 'registered');
    setExportSearch(searchQuery);
    setShowExportDialog(true);
  };

  const handleExportCsv = async () => {
    setIsExporting(true);

    try {
      const params = new URLSearchParams();
      params.set('status', exportStatus);
      params.set('format', 'csv');
      if (exportSearch.trim()) {
        params.set('search', exportSearch.trim());
      }

      const response = await fetch(`/api/admin/pipeline/export?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Export request failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `pipeline-export-${exportStatus}-${new Date().toISOString().split('T')[0]}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('CSV export downloaded');
      setShowExportDialog(false);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export pipeline CSV');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-8 w-8 text-[#008850]" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">New Product Pipeline</h1>
            <p className="text-gray-600">
              Manage products from import to publication
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowManualAddDialog(true)}
            className="border-[#008850] text-[#008850] hover:bg-[#008850] hover:text-white"
          >
            <Plus className="mr-2 h-4 w-4" />
            Manual Add
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowIntegraImport(true)}
            className="border-[#008850] text-[#008850] hover:bg-[#008850] hover:text-white"
          >
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button variant="outline" onClick={openExportDialog}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {pipelineStages.map(({ status, color }) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className="text-left rounded-lg border bg-white p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${color}`} />
              <span className="text-sm text-gray-600">{statusLabels[status]}</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {getCount(status)}
            </p>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="text"
            placeholder="Search by SKU or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as PipelineStatus | 'all')}
        >
          <SelectTrigger className="min-w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="registered">{statusLabels.registered}</SelectItem>
            <SelectItem value="enriched">{statusLabels.enriched}</SelectItem>
            <SelectItem value="finalized">{statusLabels.finalized}</SelectItem>
            <SelectItem value="failed">{statusLabels.failed}</SelectItem>
          </SelectContent>
        </Select>

        <PipelineFilters
          filters={filters}
          onFilterChange={(newFilters) => {
            setFilters(newFilters);
            void handleRefresh();
          }}
        />

        <Button variant="outline" onClick={() => void handleRefresh(true)} disabled={isRefreshing}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Selection Controls */}
      {products.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
            >
              Select All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleSelectAllMatching()}
              disabled={isSelectingAllMatching}
            >
              {isSelectingAllMatching ? 'Selecting...' : 'Select All Matching'}
            </Button>
            {selectedProducts.size > 0 && (
              <span className="ml-2 text-sm text-gray-600">
                {selectedProducts.size} selected
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bulk Actions Toolbar */}
      {selectedProducts.size > 0 && (
          <BulkActionsToolbar
            selectedCount={selectedProducts.size}
            currentStatus={getRequestStatus() || 'registered'}
            searchQuery={searchQuery}
            onAction={handleBulkAction}
            onEnrich={() => void handleBulkAction('enrich')}
            isEnriching={isBulkActionPending}
          onBulkEnrich={handleBulkEnrich}
          isBulkEnriching={isBulkEnriching}
          onClearSelection={() => {
            setSelectedProducts(new Set());
            setIsSelectingAllMatching(false);
          }}
          onClearScrapeResults={() => void handleClearScrapeResults()}
          isClearingScrapeResults={isClearingScrapeResults}
        />
      )}

      {products.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center min-h-[400px] flex items-center justify-center">
          <div>
            <Package className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-semibold text-gray-900">No Products Found</h3>
            <p className="mt-2 text-sm text-gray-600">
              No products to display ({products.length} loaded, {totalProducts} total products)
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((product, index) => (
            <PipelineProductCard
              key={product.sku}
              product={product}
              index={index}
              isSelected={selectedProducts.has(product.sku)}
              onSelect={handleSelect}
              onView={handleView}
              onEnrich={handleEnrich}
              showEnrichButton={product.pipeline_status === 'registered'}
              showBatchSelect
              currentStage={product.pipeline_status}
            />
          ))}
        </div>
      )}

      {showProductDetail && viewingSku && (
        <PipelineProductDetail
          sku={viewingSku}
          onClose={handleCloseModal}
          onSave={handleSaveModal}
        />
      )}

      {showBatchEnhanceDialog && (
        <BatchEnhanceDialog
          selectedCount={enrichingSkus.length}
          onConfirm={handleBatchEnhanceConfirm}
          onCancel={() => {
            setShowBatchEnhanceDialog(false);
            setEnrichingSkus([]);
          }}
          isEnhancing={isBulkEnriching}
        />
      )}

      {showManualAddDialog && (
        <ManualAddProductDialog
          onSuccess={() => {
            setShowManualAddDialog(false);
            void handleRefresh(true);
          }}
          onCancel={() => setShowManualAddDialog(false)}
        />
      )}

      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent aria-labelledby="export-dialog-title">
          <DialogHeader>
            <DialogTitle id="export-dialog-title">Export pipeline data</DialogTitle>
            <DialogDescription>
              Export products to CSV using the existing pipeline export endpoint.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Status</label>
              <Select
                value={exportStatus}
                onValueChange={(value) => setExportStatus(value as PipelineStatus)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="registered">{statusLabels.registered}</SelectItem>
                  <SelectItem value="enriched">{statusLabels.enriched}</SelectItem>
                  <SelectItem value="finalized">{statusLabels.finalized}</SelectItem>
                  <SelectItem value="failed">{statusLabels.failed}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Search filter (optional)</label>
              <Input
                value={exportSearch}
                onChange={(e) => setExportSearch(e.target.value)}
                placeholder="Filter by SKU or name"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)} disabled={isExporting}>
              Cancel
            </Button>
            <Button onClick={() => void handleExportCsv()} disabled={isExporting}>
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? 'Exporting...' : 'Download CSV'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showIntegraImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title" aria-describedby="import-dialog-desc">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="border-b border-gray-200 p-6">
              <h2 id="import-dialog-title" className="text-xl font-bold">Import from Integra</h2>
              <p id="import-dialog-desc" className="text-sm text-gray-600">
                Upload your Integra register export to import products
              </p>
            </div>
            <div className="max-h-[70vh] overflow-auto p-6">
              <SyncClient />
            </div>
            <div className="flex justify-end border-t border-gray-200 p-4">
              <button
                type="button"
                onClick={() => {
                  setShowIntegraImport(false);
                  void handleRefresh(true);
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
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
