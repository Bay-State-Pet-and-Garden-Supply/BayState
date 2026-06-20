'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { 
  Calendar, 
  Download, 
  ExternalLink, 
  History, 
  Package, 
  Search, 
  Tag, 
  TrendingUp 
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AdminControlBar } from '@/components/admin/admin-control-bar';
import { AdminStatCard } from '@/components/admin/admin-stat-card';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';

interface Product {
  id: string;
  name: string;
  upc: string;
  published_at: string;
  brandName: string;
  brandId: string | null;
}

interface Brand {
  id: string;
  name: string;
}

interface PublishHistoryClientProps {
  initialProducts: Product[];
  brands: Brand[];
  initialStartDate: string;
  initialEndDate: string;
}

const getLocalDateETStr = (isoString: string) => {
  const date = new Date(isoString);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // YYYY-MM-DD
};

const formatDate = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

const formatTime = (isoString: string) => {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const formatDateTime = (isoString: string) => {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};


export function PublishHistoryClient({
  initialProducts,
  brands,
  initialStartDate,
  initialEndDate,
}: PublishHistoryClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [brandFilter, setBrandFilter] = useState(searchParams.get('brand') || 'all');

  const updateParams = useCallback(
    (newParams: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(newParams).forEach(([key, val]) => {
        if (val === null || val === 'all' || val === '') {
          params.delete(key);
        } else {
          params.set(key, val);
        }
      });
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      updateParams({ search });
    }
  };

  const clearFilters = () => {
    setSearch('');
    const now = new Date();
    const defaultEndDate = now.toISOString().split('T')[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    const defaultStartDate = sevenDaysAgo.toISOString().split('T')[0];
    
    setStartDate(defaultStartDate);
    setEndDate(defaultEndDate);
    setBrandFilter('all');
    router.push(pathname);
  };

  // Grouping
  const grouped = useMemo(() => {
    const groups: Record<string, Product[]> = {};
    initialProducts.forEach((p) => {
      const localDate = getLocalDateETStr(p.published_at);
      if (!groups[localDate]) {
        groups[localDate] = [];
      }
      groups[localDate].push(p);
    });
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a)) // Newest days first
      .map((date) => ({
        date,
        products: groups[date],
      }));
  }, [initialProducts]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = initialProducts.length;

    // Date range days count
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
    const dailyAvg = (total / diffDays).toFixed(1);

    // Top Brand
    const brandCounts: Record<string, number> = {};
    initialProducts.forEach((p) => {
      brandCounts[p.brandName] = (brandCounts[p.brandName] || 0) + 1;
    });
    let topBrandName = 'N/A';
    let topBrandCount = 0;
    Object.entries(brandCounts).forEach(([name, count]) => {
      if (count > topBrandCount) {
        topBrandCount = count;
        topBrandName = name;
      }
    });

    // Today's Publishes
    const todayStr = getLocalDateETStr(new Date().toISOString());
    const todayCount = initialProducts.filter(
      (p) => getLocalDateETStr(p.published_at) === todayStr
    ).length;

    return {
      total,
      dailyAvg,
      topBrand: topBrandCount > 0 ? `${topBrandName} (${topBrandCount})` : 'N/A',
      todayCount,
    };
  }, [initialProducts, startDate, endDate]);

  // CSV Export
  const downloadCSV = () => {
    const headers = ['Date Published', 'Time Published (ET)', 'Brand', 'Product Name', 'UPC / SKU', 'Product ID'];
    const rows = initialProducts.map((p) => {
      const localDate = getLocalDateETStr(p.published_at);
      const localTime = formatTime(p.published_at);
      return [
        localDate,
        localTime,
        `"${p.brandName.replace(/"/g, '""')}"`,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.upc}"`,
        p.id,
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `publish_report_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Stats Section */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard
          label="Total Published"
          value={stats.total}
          icon={<Package className="h-5 w-5 text-primary" />}
          tone="default"
          hint="In selected date range"
        />
        <AdminStatCard
          label="Daily Average"
          value={stats.dailyAvg}
          icon={<TrendingUp className="h-5 w-5 text-brand-forest-green" />}
          tone="success"
          hint="Across range period"
        />
        <AdminStatCard
          label="Top Brand Published"
          value={stats.topBrand}
          icon={<Tag className="h-5 w-5 text-amber-600" />}
          tone="default"
          hint="Highest volume brand"
        />
        <AdminStatCard
          label="Published Today"
          value={stats.todayCount}
          icon={<History className="h-5 w-5 text-blue-600" />}
          tone="default"
          hint="Today's live updates"
        />
      </div>

      {/* Control / Toolbar Section */}
      <AdminControlBar>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between w-full">
          <div className="flex flex-wrap items-end gap-3 min-w-0">
            {/* Search */}
            <div className="flex flex-col gap-1.5 w-full sm:w-[220px]">
              <label htmlFor="search" className="text-xs font-medium text-muted-foreground">
                Search Product or UPC
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Press Enter to search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Brand Filter */}
            <div className="flex flex-col gap-1.5 w-full sm:w-[180px]">
              <label htmlFor="brand" className="text-xs font-medium text-muted-foreground">
                Brand
              </label>
              <Select
                value={brandFilter}
                onValueChange={(val) => {
                  setBrandFilter(val);
                  updateParams({ brand: val });
                }}
              >
                <SelectTrigger id="brand">
                  <SelectValue placeholder="All Brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start Date */}
            <div className="flex flex-col gap-1.5 w-full sm:w-[150px]">
              <label htmlFor="startDate" className="text-xs font-medium text-muted-foreground">
                Start Date
              </label>
              <Input
                type="date"
                id="startDate"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  updateParams({ startDate: e.target.value });
                }}
              />
            </div>

            {/* End Date */}
            <div className="flex flex-col gap-1.5 w-full sm:w-[150px]">
              <label htmlFor="endDate" className="text-xs font-medium text-muted-foreground">
                End Date
              </label>
              <Input
                type="date"
                id="endDate"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  updateParams({ endDate: e.target.value });
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={clearFilters} className="w-full sm:w-auto">
              Reset Filters
            </Button>
            <Button 
              variant="default" 
              onClick={downloadCSV} 
              disabled={initialProducts.length === 0}
              className="w-full sm:w-auto gap-2"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>
      </AdminControlBar>

      {/* Main List Section */}
      <div className="space-y-6">
        {grouped.length === 0 ? (
          <AdminEmptyState
            icon={History}
            title="No publishes found"
            description="No product publish records match the selected date range and filter criteria."
            actionLabel="Reset All Filters"
            onAction={clearFilters}
          />
        ) : (
          grouped.map((group) => (
            <div key={group.date} className="admin-panel overflow-hidden border-[var(--surface-admin-border)]">
              {/* Day Header */}
              <div className="border-b border-white/10 bg-white/3 px-4 py-3 sm:px-6 flex items-center justify-between">
                <h3 className="font-semibold text-white text-sm sm:text-base">
                  {formatDate(group.date)}
                </h3>
                <Badge variant="secondary" className="bg-primary/15 text-primary border-primary/20">
                  {group.products.length} {group.products.length === 1 ? 'product' : 'products'}
                </Badge>
              </div>

              {/* Day Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.01] text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <th className="px-4 py-3 sm:px-6">Date/Time (ET)</th>
                      <th className="px-4 py-3">Brand</th>
                      <th className="px-4 py-3">Product Name</th>
                      <th className="px-4 py-3">UPC / SKU</th>
                      <th className="px-4 py-3 text-right sm:pr-6">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {group.products.map((p) => (
                      <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 sm:px-6 text-muted-foreground whitespace-nowrap tabular-nums">
                          {formatDateTime(p.published_at)}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                          {p.brandName}
                        </td>
                        <td className="px-4 py-3 text-foreground line-clamp-1 max-w-[300px] sm:max-w-md md:max-w-lg lg:max-w-xl">
                          {p.name}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs whitespace-nowrap">
                          {p.upc}
                        </td>
                        <td className="px-4 py-3 text-right sm:pr-6 whitespace-nowrap">
                          <Link 
                            href={`/admin/products/${p.id}/edit`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-hover font-medium"
                          >
                            Edit
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
