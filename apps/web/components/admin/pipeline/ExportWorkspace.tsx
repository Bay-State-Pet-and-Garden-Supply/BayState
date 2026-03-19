'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download, FileSpreadsheet, Loader2, Package } from 'lucide-react';
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

type ExportStatus = 'registered' | 'enriched' | 'finalized' | 'all';

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
  registered: 'Registered',
  enriched: 'Enriched',
  finalized: 'Finalized',
  all: 'All Products',
};

export function ExportWorkspace() {
  const [selectedStatus, setSelectedStatus] = useState<ExportStatus>('finalized');
  const [statusCounts, setStatusCounts] = useState<StatusCount[]>([]);
  const [isLoadingCounts, setIsLoadingCounts] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
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

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-[#008850]" />
          Export Products
        </CardTitle>
        <CardDescription>
          Generate Excel export of products from the pipeline
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Filter */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Filter by Status
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
              <SelectItem value="finalized">Finalized</SelectItem>
              <SelectItem value="enriched">Enriched</SelectItem>
              <SelectItem value="registered">Registered</SelectItem>
              <SelectItem value="all">All Products</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Product Count */}
        {isLoadingCounts ? (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Spinner size="sm" />
            <span>Loading product counts…</span>
          </div>
        ) : error ? (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
            {error}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Package className="h-4 w-4 text-gray-500" />
            <span className="text-gray-600">
              <span className="font-semibold text-gray-900">{currentCount.toLocaleString()}</span>
              {' products ready for export in '}
              <span className="font-medium">{STATUS_LABELS[selectedStatus].toLowerCase()}</span>
              {' status'}
            </span>
          </div>
        )}

        {/* Empty State */}
        {!isLoadingCounts && !hasProducts && !error && (
          <EmptyState
            icon={Package}
            title="No Products Found"
            description={`No products found in ${STATUS_LABELS[selectedStatus].toLowerCase()} status. Try selecting a different status filter.`}
            actionLabel="Refresh Counts"
            onAction={fetchCounts}
          />
        )}

        {/* Generate Button */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleGenerateExport}
            disabled={isGenerating || isLoadingCounts || !hasProducts}
            className="bg-[#008850] hover:bg-[#2a7034] text-white"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Generate Export
              </>
            )}
          </Button>
        </div>

        {/* Export Result */}
        {exportResult && (
          <div className="rounded-lg bg-[#008850]/5 border border-[#008850]/20 p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <FileSpreadsheet className="h-5 w-5 text-[#008850]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#008850]">
                  Export generated successfully
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-mono">{exportResult.filename}</span>
                  {' ('}
                  <span className="font-medium">{exportResult.productCount.toLocaleString()}</span>
                  {' products)'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
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