'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileSpreadsheet, FileText, ImageIcon, Loader2, Package, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';

type ExportStatus = 'finalizing' | 'exporting' | 'all';

interface StatusCount {
  status: string;
  count: number;
}

interface ExportResult {
  success: boolean;
  productCount: number;
  filename: string;
}

const STATUS_LABELS: Record<ExportStatus, string> = {
  finalizing: 'Finalizing',
  exporting: 'Exporting',
  all: 'All Products',
};

export function ExportWorkspace() {
  const [selectedStatus, setSelectedStatus] = useState<ExportStatus>('exporting');
  const [statusCounts, setStatusCounts] = useState<StatusCount[]>([]);
  const [isLoadingCounts, setIsLoadingCounts] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingXml, setIsGeneratingXml] = useState(false);
  const [isGeneratingZip, setIsGeneratingZip] = useState(false);
  const [isGeneratingImageManifest, setIsGeneratingImageManifest] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchCounts = useCallback(async () => {
    setIsLoadingCounts(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/pipeline/counts');
      if (!res.ok) {
        throw new Error('Failed to fetch product counts');
      }
      const data = await res.json();
      setStatusCounts(data.counts || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      toast.error('Failed to load product counts');
    } finally {
      setIsLoadingCounts(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const getProductCount = (status: ExportStatus): number => {
    if (status === 'all') {
      return statusCounts.reduce((sum, item) => sum + item.count, 0);
    }
    const found = statusCounts.find((item) => item.status === status);
    return found?.count || 0;
  };

  const handleGenerateExport = async () => {
    setIsGenerating(true);
    setExportResult(null);
    setError(null);

    try {
      const res = await fetch(`/api/admin/pipeline/export?status=${selectedStatus}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate export');
      }

      // Get the blob from the response
      const blob = await res.blob();

      // Extract product count from Content-Disposition header or estimate
      const contentDisposition = res.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || 'products-export.xlsx';

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      // Get count from our local state for display
      const productCount = getProductCount(selectedStatus);

      setExportResult({
        success: true,
        productCount,
        filename,
      });

      toast.success('Export generated successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate export';
      setError(message);
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const currentCount = getProductCount(selectedStatus);
  const hasProducts = currentCount > 0;

  const handleGenerateXml = async () => {
    setIsGeneratingXml(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/pipeline/export-xml');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate XML export');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'shopsite-products.xml';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('ShopSite XML export downloaded');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate XML';
      setError(message);
      toast.error(message);
    } finally {
      setIsGeneratingXml(false);
    }
  };

  const handleGenerateZip = async () => {
    setIsGeneratingZip(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pipeline/export-zip?status=${selectedStatus}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate ZIP export');
      }

      const contentDisposition = res.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || 'baystate-export.zip';

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('ZIP package downloaded successfully. This includes XML and resized images.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate ZIP';
      setError(message);
      toast.error(message);
    } finally {
      setIsGeneratingZip(false);
    }
  };

  const handleExportImageManifest = async () => {
    setIsGeneratingImageManifest(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/pipeline/export-images');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate image manifest');
      }

      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'image-manifest.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(`Image manifest downloaded (${data.total_images} images across ${data.total_products} products)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate image manifest';
      setError(message);
      toast.error(message);
    } finally {
      setIsGeneratingImageManifest(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Export Products
        </CardTitle>
        <CardDescription>
          Work the export queue and download Excel, ShopSite XML, ZIP packages, or image manifests
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Filter */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
             Filter by Workflow Stage
          </label>
          <Select
            value={selectedStatus}
            onValueChange={(value) => {
              setSelectedStatus(value as ExportStatus);
              setExportResult(null);
            }}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exporting">Exporting</SelectItem>
              <SelectItem value="finalizing">Finalizing</SelectItem>
              <SelectItem value="all">All Products</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Product Count */}
        {isLoadingCounts ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner size="sm" />
            <span>Loading product counts…</span>
          </div>
        ) : error ? (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
            {error}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">{currentCount.toLocaleString()}</span>
              {' active products in '}
              <span className="font-medium">{STATUS_LABELS[selectedStatus].toLowerCase()}</span>
              {' stage'}
            </span>
          </div>
        )}

        {/* Empty State */}
        {!isLoadingCounts && !hasProducts && !error && (
          <EmptyState
            icon={Package}
            title="No Products Found"
            description={`No products found in ${STATUS_LABELS[selectedStatus].toLowerCase()} stage. Try selecting a different filter.`}
            actionLabel="Refresh Counts"
            onAction={fetchCounts}
          />
        )}

        {/* Generate Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleGenerateExport}
            disabled={isGenerating || isLoadingCounts || !hasProducts}
            className="bg-primary hover:bg-primary/80 text-white"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-4 w-4" />
                Export Excel
              </>
            )}
          </Button>
          <Button
            onClick={handleGenerateXml}
            disabled={isGeneratingXml || isLoadingCounts}
            variant="outline"
          >
            {isGeneratingXml ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                Export ShopSite XML
              </>
            )}
          </Button>
          <Button
            onClick={handleGenerateZip}
            disabled={isGeneratingZip || isLoadingCounts || !hasProducts}
            variant="outline"
          >
            {isGeneratingZip ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating ZIP…
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" />
                Export ZIP Package
              </>
            )}
          </Button>
          <Button
            onClick={handleExportImageManifest}
            disabled={isGeneratingImageManifest || isLoadingCounts}
            variant="outline"
          >
            {isGeneratingImageManifest ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <ImageIcon className="h-4 w-4" />
                Export Image Manifest
              </>
            )}
          </Button>
        </div>

        {/* Export Result */}
        {exportResult && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary">
                  Export generated successfully
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-mono">{exportResult.filename}</span>
                  {' ('}
                  <span className="font-medium">{exportResult.productCount.toLocaleString()}</span>
                  {' products)'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Download should start automatically. Check your downloads folder.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
