'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Search, RefreshCw, Filter, Upload, Download, Plus, LayoutDashboard, Activity, Image as ImageIcon } from 'lucide-react';
import { PipelineProductCard } from './PipelineProductCard';
import { BulkActionsToolbar } from './BulkActionsToolbar';
import { PipelineProductDetail } from './PipelineProductDetail';
import { BatchEnhanceDialog } from './BatchEnhanceDialog';
import { ManualAddProductDialog } from './ManualAddProductDialog';
import { UndoToast } from './UndoToast';
import { HealthOverview } from './HealthOverview';
import { MonitoringClient } from './MonitoringClient';
import { ImageSelectionTab } from './ImageSelectionTab';
import { ExportTab } from './ExportTab';
import { ConsolidationDetailsModal } from './ConsolidationDetailsModal';
import { ConsolidationProgressBanner } from './ConsolidationProgressBanner';
import { useConsolidationWebSocket } from '@/lib/hooks/useConsolidationWebSocket';

import { AlertBanner } from './AlertBanner';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
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
import { useRealtimeJobs } from '@/hooks/useRealtimeJobs';
import { undoQueue } from '@/lib/pipeline/undo';
import { cn } from '@/lib/utils';
import type { PipelineProduct, PipelineStatus, StatusCount, NewPipelineStatus } from '@/lib/pipeline';
import { PipelineFilters, type PipelineFiltersState } from './PipelineFilters';

const statusLabels: Record<PipelineStatus, string> = {
  staging: 'Imported',
  scraped: 'Enhanced',
  consolidated: 'Ready for Review',
  approved: 'Verified',
  published: 'Live',
  failed: 'Failed',
};

const newStatusLabels: Record<NewPipelineStatus, string> = {
  registered: 'Registered',
  enriched: 'Enriched',
  finalized: 'Finalized',
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
  const [statusFilter, setStatusFilter] = useState<NewPipelineStatus | 'all'>('all');
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
  
  // Consolidation state
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [consolidationBatchId, setConsolidationBatchId] = useState<string | null>(null);
  const [consolidationProgress, setConsolidationProgress] = useState(0);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  
  const ws = useConsolidationWebSocket();

  const [showIntegraImport, setShowIntegraImport] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportStatus, setExportStatus] = useState<NewPipelineStatus>('registered');
  const [exportSearch, setExportSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [filters, setFilters] = useState<PipelineFiltersState>({});
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [errors, setErrors] = useState<Array<{
    id: string;
    jobId: string;
    message: string;
    timestamp: Date;
  }>>([]);
  const [runnerFilter, setRunnerFilter] = useState<'all' | 'online' | 'busy' | 'offline'>('all');
  const [selectedRunners, setSelectedRunners] = useState<Set<string>>(new Set());
  const lastToastedJobRef = useRef<string | null>(null);
  const lastRefreshedJobRef = useRef<string | null>(null);

  const { jobs, connectionStatus, lastUpdate } = useRealtimeJobs({
    autoConnect: true,
    pollingFallback: true,
  });

  const totalProducts = counts.reduce((sum, c) => sum + c.count, 0);

  // Mock data for Timeline tab
  const mockJobs = [
    {
      id: '1',
      name: 'Product Enrichment Batch',
      startTime: new Date(Date.now() - 3600000),
      endTime: new Date(Date.now() - 1800000),
      status: 'completed' as const,
      runner: 'runner-01',
    },
    {
      id: '2',
      name: 'Image Scraping Job',
      startTime: new Date(Date.now() - 7200000),
      status: 'running' as const,
      runner: 'runner-02',
    },
    {
      id: '3',
      name: 'Price Update Job',
      startTime: new Date(Date.now() - 14400000),
      endTime: new Date(Date.now() - 10800000),
      status: 'failed' as const,
      runner: 'runner-01',
    },
    {
      id: '4',
      name: 'Inventory Sync',
      startTime: new Date(Date.now() - 21600000),
      endTime: new Date(Date.now() - 18000000),
      status: 'completed' as const,
      runner: 'runner-03',
    },
  ];

  // Mock data for Runners tab
  const mockRunners: Array<{
    id: string;
    name: string;
    status: 'online' | 'busy' | 'idle' | 'offline';
    activeJobs: number;
    lastSeen: Date;
    cpuUsage?: number;
    memoryUsage?: number;
    currentJob?: {
      id: string;
      name: string;
      progress: number;
    };
  }> = [
    {
      id: 'runner-01',
      name: 'Production Runner 1',
      status: 'online' as const,
      activeJobs: 0,
      lastSeen: new Date(),
      cpuUsage: 45,
      memoryUsage: 62,
    },
    {
      id: 'runner-02',
      name: 'Production Runner 2',
      status: 'busy' as const,
      activeJobs: 3,
      lastSeen: new Date(),
      cpuUsage: 78,
      memoryUsage: 85,
      currentJob: {
        id: 'job-123',
        name: 'Image Scraping Job',
        progress: 65,
      },
    },
    {
      id: 'runner-03',
      name: 'Staging Runner',
      status: 'idle' as const,
      activeJobs: 0,
      lastSeen: new Date(Date.now() - 300000),
      cpuUsage: 12,
      memoryUsage: 34,
    },
  ];

  // Mock health metrics for Overview tab
  const healthMetrics = {
    totalProducts,
    runningJobs: mockJobs.filter(j => j.status === 'running').length,
    failed24h: mockJobs.filter(j => j.status === 'failed').length,
    activeRunners: mockRunners.length,
    queueDepth: 12,
    successRate: 94.5,
  };

  const getCount = (status: NewPipelineStatus): number => {
    const found = counts.find(c => c.status === status);
    return found ? found.count : 0;
  };

  const newPipelineStages: Array<{ status: NewPipelineStatus; color: string; label: string }> = [
    { status: 'registered', color: 'bg-orange-500', label: 'Registered' },
    { status: 'enriched', color: 'bg-blue-500', label: 'Enriched' },
    { status: 'finalized', color: 'bg-green-500', label: 'Finalized' },
  ];

  const getRequestStatus = (): NewPipelineStatus | null => {
    return statusFilter === 'all' ? null : statusFilter;
  };

  const handleRefresh = useCallback(async (showSuccessToast = false) => {
    setIsRefreshing(true);

    try {
      const params = new URLSearchParams();
      const requestStatus = statusFilter === 'all' ? null : statusFilter;
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
  }, [searchQuery, statusFilter]);

  // Refresh products when status filter changes
  useEffect(() => {
    void handleRefresh();
  }, [statusFilter, handleRefresh]);

  useEffect(() => {
    if (jobs.length === 0) {
      return;
    }

    const latestJob = jobs[jobs.length - 1];
    const toastKey = `${latestJob.jobId}:${latestJob.status}`;

    if (lastToastedJobRef.current === toastKey) {
      return;
    }

    if (latestJob.status === 'completed') {
      lastToastedJobRef.current = toastKey;
      toast.success(`Job ${latestJob.jobId} completed`, {
        action: {
          label: 'Refresh',
          onClick: () => {
            void handleRefresh(true);
          },
        },
      });
      return;
    }

    if (latestJob.status === 'failed') {
      lastToastedJobRef.current = toastKey;
      setErrors(prev => [...prev, {
        id: `${latestJob.jobId}:${Date.now()}`,
        jobId: latestJob.jobId,
        message: `Job ${latestJob.jobId} failed`,
        timestamp: new Date(),
      }]);
      toast.error(`Job ${latestJob.jobId} failed`);
    }
  }, [jobs, handleRefresh]);

  useEffect(() => {
    if (!lastUpdate || jobs.length === 0) {
      return;
    }

    const latestJob = jobs[jobs.length - 1];
    if (latestJob.status !== 'completed') {
      return;
    }

    const timeSinceUpdate = Date.now() - lastUpdate.getTime();
    if (timeSinceUpdate >= 5000) {
      return;
    }

    const refreshKey = `${latestJob.jobId}:${latestJob.status}`;
    if (lastRefreshedJobRef.current === refreshKey) {
      return;
    }

    lastRefreshedJobRef.current = refreshKey;
    void handleRefresh();
  }, [jobs, lastUpdate, handleRefresh]);

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

  const handleBulkAction = async (action: 'moveToEnriched' | 'moveToFinalized' | 'delete' | 'enrich') => {
    if (selectedProducts.size === 0) return;
    if (action === 'enrich') return; // Handled separately by handleBulkEnrich

    const selectedSkus = Array.from(selectedProducts);
    const selectedCount = selectedSkus.length;
    const currentStatus = getRequestStatus() || 'registered';
    const actionLabels: Record<'moveToEnriched' | 'moveToFinalized' | 'delete', string> = {
      moveToEnriched: 'Moved to Enriched',
      moveToFinalized: 'Moved to Finalized',
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

      // Map actions to new status values
      const newStatusMap: Record<'moveToEnriched' | 'moveToFinalized', NewPipelineStatus> = {
        moveToEnriched: 'enriched',
        moveToFinalized: 'finalized',
      };

      const newStatus = newStatusMap[action];
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
        toast.error(error?.error || `Failed to ${action}`);
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
            toStatus={newStatusLabels[newStatus]}
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
      toast.error(`Failed to ${action}`);
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

  const handleConsolidate = async () => {
    if (selectedProducts.size === 0) return;

    setIsConsolidating(true);
    setIsBannerDismissed(false);
    setConsolidationProgress(0);

    try {
        const res = await fetch('/api/admin/consolidation/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skus: Array.from(selectedProducts) }),
        });

        if (res.ok) {
            const data = await res.json() as { batch_id?: string; jobId?: string; skus?: string[] };
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
            setSelectedProducts(new Set());
            toast.success(`Started AI consolidation for ${data.skus?.length || selectedProducts.size} products`);
        } else {
            const errorData = await res.json() as { error?: string };
            toast.error(`Failed to start consolidation: ${errorData.error || 'Unknown error'}`);
            setIsConsolidating(false);
        }
    } catch (error) {
        console.error('Error starting consolidation:', error);
        toast.error('An error occurred while starting consolidation');
        setIsConsolidating(false);
    }
  };

  // WebSocket subscription for consolidation progress
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
              void handleRefresh();
          }
      }

      return () => {
          ws.unsubscribeFromBatch(consolidationBatchId);
      };
  }, [consolidationBatchId, ws, handleRefresh]);

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

  const router = useRouter();

  const handleImageSelection = (sku: string) => {
    // Navigate to the image selection page
    router.push(`/admin/pipeline/image-selection?sku=${sku}`);
  };

  const openExportDialog = () => {
    // If getRequestStatus() returns null (meaning 'all'), fall back to 'registered'
    // so export dialog always has a valid NewPipelineStatus selected.
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
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-gray-600">
                Manage products from import to publication
              </p>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'h-2 w-2 rounded-full',
                    connectionStatus === 'connected' && 'bg-green-500',
                    connectionStatus === 'connecting' && 'bg-yellow-500 animate-pulse',
                    connectionStatus === 'disconnected' && 'bg-red-500'
                  )}
                />
                <span className="text-xs text-muted-foreground">
                  {connectionStatus === 'connected' ? 'Live' : connectionStatus}
                </span>
              </div>
            </div>
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex w-full overflow-x-auto lg:w-auto">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Products</span>
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Monitoring</span>
          </TabsTrigger>
          <TabsTrigger value="images" className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Images</span>
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <HealthOverview
            metrics={{
              totalProducts,
              runningJobs: jobs.filter(j => j.status === 'running').length,
              failed24h: jobs.filter(j => j.status === 'failed').length,
              activeRunners: 3,
              queueDepth: products.length,
              successRate: 95,
            }}
            trends={{
              totalProducts: 10,
              runningJobs: -5,
              failed24h: 20,
              activeRunners: 0,
              queueDepth: -15,
              successRate: 2,
            }}
          />
          
          {errors.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Recent Errors</h3>
                <Button variant="ghost" size="sm" onClick={() => setErrors([])}>
                  Clear All
                </Button>
              </div>
              {errors.map((error) => (
                <AlertBanner
                  key={error.id}
                  severity="error"
                  title={`Job ${error.jobId} Failed`}
                  message={error.message}
                  actions={[
                    { label: 'Retry', onClick: () => console.log('Retry', error.jobId) },
                    { label: 'View Logs', onClick: () => console.log('View logs', error.jobId) },
                  ]}
                  onDismiss={() => setErrors(prev => prev.filter(e => e.id !== error.id))}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="products" className="space-y-6">
          {/* Products content */}
      <div className="grid gap-4 sm:grid-cols-3">
        {newPipelineStages.map(({ status, color, label }) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`text-left rounded-lg border p-4 transition-colors ${statusFilter === status ? 'border-[#008850] bg-[#008850]/5 ring-1 ring-[#008850]' : 'bg-white hover:bg-gray-50'}`}
          >
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${color}`} />
              <span className="text-sm text-gray-600">{label}</span>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
              {getCount(status)}
            </p>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="search"
            autoComplete="off"
            placeholder="Search by SKU or name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as NewPipelineStatus | 'all')}
        >
          <SelectTrigger className="min-w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="registered">{newStatusLabels.registered}</SelectItem>
            <SelectItem value="enriched">{newStatusLabels.enriched}</SelectItem>
            <SelectItem value="finalized">{newStatusLabels.finalized}</SelectItem>
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
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
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
              {isSelectingAllMatching ? 'Selecting…' : 'Select All Matching'}
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
          onAction={(action) => {
            if (action === 'approve' || action === 'publish' || action === 'reject' || action === 'consolidate') {
              return;
            }

            void handleBulkAction(action);
          }}
          onMoveToEnriched={() => void handleBulkAction('moveToEnriched')}
          isMovingToEnriched={isBulkActionPending}
          onEnrich={handleBulkEnrich}
          isEnriching={isBulkEnriching}
          onConsolidate={handleConsolidate}
          isConsolidating={isConsolidating}
          onClearSelection={() => {
            setSelectedProducts(new Set());
            setIsSelectingAllMatching(false);
          }}
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
              onImageSelection={handleImageSelection}
              showEnrichButton={product.pipeline_status === 'staging' || product.pipeline_status_new === 'registered'}
              showImageSelectionButton={product.pipeline_status_new === 'enriched'}
              showBatchSelect
              currentStage={product.pipeline_status_new || product.pipeline_status}
            />
          ))}
        </div>
      )}
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-6">
          <MonitoringClient />
        </TabsContent>

        <TabsContent value="images" className="space-y-6">
          <ImageSelectionTab />
        </TabsContent>

        <TabsContent value="export" className="space-y-6">
          <ExportTab
            count={totalProducts}
            filters={{
              status: statusFilter === 'all' ? undefined : statusFilter,
              search: searchQuery
            }}
          />
        </TabsContent>

      </Tabs>

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
                onValueChange={(value) => setExportStatus(value as NewPipelineStatus)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="registered">{newStatusLabels.registered}</SelectItem>
                  <SelectItem value="enriched">{newStatusLabels.enriched}</SelectItem>
                  <SelectItem value="finalized">{newStatusLabels.finalized}</SelectItem>
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
              {isExporting ? 'Exporting…' : 'Download CSV'}
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
