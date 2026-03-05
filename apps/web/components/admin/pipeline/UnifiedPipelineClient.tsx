'use client';

import { useState } from 'react';
import { Package, Search, RefreshCw, Filter, Upload, Download } from 'lucide-react';
import { PipelineProductCard } from './PipelineProductCard';
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
import type { PipelineProduct, PipelineStatus, StatusCount } from '@/lib/pipeline';

const statusLabels: Record<PipelineStatus, string> = {
  staging: 'Imported',
  scraped: 'Enhanced',
  consolidated: 'Ready for Review',
  approved: 'Verified',
  published: 'Live',
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

  const [showIntegraImport, setShowIntegraImport] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportStatus, setExportStatus] = useState<PipelineStatus>('staging');
  const [exportSearch, setExportSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const getCount = (status: PipelineStatus): number => {
    const found = counts.find(c => c.status === status);
    return found ? found.count : 0;
  };

  const totalProducts = counts.reduce((sum, c) => sum + c.count, 0);

  const pipelineStages: Array<{ status: PipelineStatus; color: string }> = [
    { status: 'staging', color: 'bg-orange-500' },
    { status: 'scraped', color: 'bg-blue-500' },
    { status: 'consolidated', color: 'bg-purple-500' },
    { status: 'approved', color: 'bg-green-500' },
    { status: 'published', color: 'bg-emerald-600' },
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
  };

  const handleView = (sku: string) => {
    console.log('View product:', sku);
  };

  const openExportDialog = () => {
    // If getRequestStatus() returns null (meaning 'all'), fall back to 'staging'
    // so export dialog always has a valid PipelineStatus selected.
    setExportStatus(getRequestStatus() ?? 'staging');
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
          <div
            key={status}
            className="rounded-lg border bg-white p-4"
          >
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${color}`} />
              <span className="text-sm text-gray-600">{statusLabels[status]}</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {getCount(status)}
            </p>
          </div>
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
            <SelectItem value="staging">{statusLabels.staging}</SelectItem>
            <SelectItem value="scraped">{statusLabels.scraped}</SelectItem>
            <SelectItem value="consolidated">{statusLabels.consolidated}</SelectItem>
            <SelectItem value="approved">{statusLabels.approved}</SelectItem>
            <SelectItem value="published">{statusLabels.published}</SelectItem>
            <SelectItem value="failed">{statusLabels.failed}</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline">
          <Filter className="mr-2 h-4 w-4" />
          Filters
        </Button>

        <Button variant="outline" onClick={() => void handleRefresh(true)} disabled={isRefreshing}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

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
              showBatchSelect
              currentStage={product.pipeline_status}
            />
          ))}
        </div>
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
                  <SelectItem value="staging">{statusLabels.staging}</SelectItem>
                  <SelectItem value="scraped">{statusLabels.scraped}</SelectItem>
                  <SelectItem value="consolidated">{statusLabels.consolidated}</SelectItem>
                  <SelectItem value="approved">{statusLabels.approved}</SelectItem>
                  <SelectItem value="published">{statusLabels.published}</SelectItem>
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
