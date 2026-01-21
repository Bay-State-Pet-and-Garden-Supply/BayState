'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Calendar,
  Download,
  RefreshCw,
  Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type AnalyticsData } from '@/app/api/admin/analytics/route';

type DateRange = 'today' | '7days' | '30days' | 'all' | 'custom';

interface AnalyticsClientProps {
  initialRange?: DateRange;
}

export function AnalyticsClient({ initialRange = '7days' }: AnalyticsClientProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(initialRange);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let url = `/api/admin/analytics?range=${range}`;
      if (range === 'custom' && customStart && customEnd) {
        url += `&start=${customStart}&end=${customEnd}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const analyticsData = await response.json();
      setData(analyticsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [range, customStart, customEnd]);

  useEffect(() => {
    if (range !== 'custom' || (customStart && customEnd)) {
      fetchAnalytics();
    }
  }, [range, fetchAnalytics, customStart, customEnd]);

  const handleExportCSV = () => {
    if (!data) return;

    const rows = [
      ['Date', 'Revenue', 'Orders'],
      ...data.revenueByDay.map((d) => [d.date, d.revenue.toFixed(2), d.orders.toString()]),
    ];

    const csvContent = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${range}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Header with Date Range Picker */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-purple-600" />
          <div>
            <h1 className="text-3xl font-bold">Store Analytics</h1>
            <p className="text-gray-600">
              {data?.period.label || 'Loading...'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border bg-white p-1">
            {(['today', '7days', '30days', 'all'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${range === r
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                {r === 'today'
                  ? 'Today'
                  : r === '7days'
                    ? '7 Days'
                    : r === '30days'
                      ? '30 Days'
                      : 'All Time'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-600" />
            <input
              type="date"
              value={customStart}
              onChange={(e) => {
                setCustomStart(e.target.value);
                if (e.target.value && customEnd) setRange('custom');
              }}
              className="rounded-md border px-2 py-1.5 text-sm"
            />
            <span className="text-gray-600">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => {
                setCustomEnd(e.target.value);
                if (customStart && e.target.value) setRange('custom');
              }}
              className="rounded-md border px-2 py-1.5 text-sm"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchAnalytics}
            disabled={loading}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={!data}
          >
            <Download className="mr-1 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-lg border bg-gray-100"
            />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Key Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-white p-4">
              <div className="flex items-center gap-2 text-gray-600">
                <DollarSign className="h-5 w-5" />
                <span className="text-sm">Total Revenue</span>
              </div>
              <p className="mt-2 text-3xl font-bold text-green-600">
                {formatCurrency(data.revenue.total)}
              </p>
            </div>

            <div className="rounded-lg border bg-white p-4">
              <div className="flex items-center gap-2 text-gray-600">
                <ShoppingCart className="h-5 w-5" />
                <span className="text-sm">Orders</span>
              </div>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {data.revenue.orderCount}
              </p>
            </div>

            <div className="rounded-lg border bg-white p-4">
              <div className="flex items-center gap-2 text-gray-600">
                <TrendingUp className="h-5 w-5" />
                <span className="text-sm">Avg. Order Value</span>
              </div>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {formatCurrency(data.revenue.averageOrderValue)}
              </p>
            </div>

            <div className="rounded-lg border bg-white p-4">
              <div className="flex items-center gap-2 text-gray-600">
                <Package className="h-5 w-5" />
                <span className="text-sm">Top Product Revenue</span>
              </div>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {data.topProducts[0]
                  ? formatCurrency(data.topProducts[0].revenue)
                  : '$0.00'}
              </p>
              {data.topProducts[0] && (
                <p className="mt-1 truncate text-xs text-gray-600">
                  {data.topProducts[0].name}
                </p>
              )}
            </div>
          </div>

          {/* Revenue Chart */}
          <div className="rounded-lg border bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold">Revenue Over Time</h2>
            <RevenueChart data={data.revenueByDay} />
          </div>

          {/* Bottom Grid: Orders by Status & Top Products */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Orders by Status */}
            <div className="rounded-lg border bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">Orders by Status</h2>
              {data.ordersByStatus.length === 0 ? (
                <p className="text-gray-600">No orders in this period.</p>
              ) : (
                <div className="space-y-3">
                  {data.ordersByStatus.map(({ status, count }) => {
                    const total = data.revenue.orderCount;
                    const percentage = total > 0 ? (count / total) * 100 : 0;
                    const colorClass = getStatusColor(status);

                    return (
                      <div key={status}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="capitalize">{status}</span>
                          <span className="font-medium">
                            {count} ({percentage.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={`h-full ${colorClass}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top Products */}
            <div className="rounded-lg border bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">Top Products</h2>
              {data.topProducts.length === 0 ? (
                <p className="text-gray-600">No product sales in this period.</p>
              ) : (
                <div className="space-y-3">
                  {data.topProducts.slice(0, 5).map((product, idx) => (
                    <div
                      key={product.name}
                      className="flex items-center justify-between border-b border-gray-100 pb-3 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-xs font-medium text-purple-600">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="font-medium text-gray-900 line-clamp-1">
                            {product.name}
                          </p>
                          <p className="text-xs text-gray-600">
                            {product.quantity} sold
                          </p>
                        </div>
                      </div>
                      <span className="font-semibold text-green-600">
                        {formatCurrency(product.revenue)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-green-500';
    case 'processing':
      return 'bg-blue-500';
    case 'pending':
      return 'bg-yellow-500';
    case 'cancelled':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
}

interface RevenueChartProps {
  data: Array<{ date: string; revenue: number; orders: number }>;
}

function RevenueChart({ data }: RevenueChartProps) {
  if (data.length === 0) {
    return <p className="text-gray-600">No data available.</p>;
  }

  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);

  // For many days, show fewer labels
  const showLabels = data.length <= 14;
  const labelInterval = data.length > 14 ? Math.ceil(data.length / 7) : 1;

  return (
    <div className="flex h-48 items-end gap-1">
      {data.map((day, idx) => {
        const heightPercent = (day.revenue / maxRevenue) * 100;
        const showLabel = showLabels || idx % labelInterval === 0;

        return (
          <div
            key={day.date}
            className="group relative flex flex-1 flex-col items-center"
          >
            {/* Tooltip */}
            <div className="pointer-events-none absolute bottom-full mb-2 hidden rounded bg-gray-900 px-2 py-1 text-xs text-white group-hover:block">
              <p className="font-medium">${day.revenue.toFixed(2)}</p>
              <p className="text-gray-300">{day.orders} orders</p>
              <p className="text-gray-600">
                {new Date(day.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>

            {/* Bar */}
            <div
              className="w-full rounded-t bg-purple-500 transition-all hover:bg-purple-600"
              style={{
                height: `${Math.max(heightPercent, 2)}%`,
                minHeight: '2px',
              }}
            />

            {/* Date label */}
            {showLabel && (
              <span className="mt-2 text-xs text-gray-600">
                {new Date(day.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export { RevenueChart };
