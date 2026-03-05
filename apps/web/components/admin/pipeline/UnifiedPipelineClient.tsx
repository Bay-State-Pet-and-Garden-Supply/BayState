'use client';

import { useState } from 'react';
import { Package, Search, RefreshCw, Filter, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const [products] = useState<PipelineProduct[]>(initialProducts);
  const [counts] = useState<StatusCount[]>(initialCounts);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PipelineStatus | 'all'>('all');

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

        <div className="relative">
          <Button variant="outline" className="min-w-[180px] justify-between">
            <span>{statusFilter === 'all' ? 'All Statuses' : statusLabels[statusFilter]}</span>
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <Button variant="outline">
          <Filter className="mr-2 h-4 w-4" />
          Filters
        </Button>

        <Button variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center min-h-[400px] flex items-center justify-center">
        <div>
          <Package className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">Product Grid</h3>
          <p className="mt-2 text-sm text-gray-600">
            Product cards will be displayed here ({totalProducts} products available)
          </p>
        </div>
      </div>
    </div>
  );
}
