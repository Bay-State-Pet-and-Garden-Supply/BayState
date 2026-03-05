'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  ImageOff,
  FileText,
  Tag,
  DollarSign,
  RefreshCw,
  TrendingUp,
  Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/admin/dashboard/stat-card';
import type { QualityMetrics } from '@/app/api/admin/quality/route';

interface QualityDashboardProps {
  initialMetrics?: QualityMetrics | null;
}

const fieldIcons: Record<string, React.ElementType> = {
  name: Tag,
  price: DollarSign,
  description: FileText,
  images: ImageOff,
  brand_id: Package,
};

const fieldLabels: Record<string, string> = {
  name: 'Product Name',
  price: 'Price',
  description: 'Description',
  images: 'Images',
  brand_id: 'Brand',
};

const severityColors = {
  required: 'bg-red-500',
  recommended: 'bg-yellow-500',
};

const severityBg = {
  required: 'bg-red-50 border-red-200',
  recommended: 'bg-yellow-50 border-yellow-200',
};

export function QualityDashboard({ initialMetrics }: QualityDashboardProps) {
  const [metrics, setMetrics] = useState<QualityMetrics | null>(initialMetrics || null);
  const [loading, setLoading] = useState(!initialMetrics);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/quality');
      if (!response.ok) throw new Error('Failed to fetch metrics');
      const data = await response.json();
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialMetrics) {
      fetchMetrics();
    }
  }, [initialMetrics, fetchMetrics]);

  if (loading && !metrics) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg border bg-gray-100" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg border bg-gray-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <XCircle className="mx-auto h-12 w-12 text-red-500" />
        <p className="mt-2 text-red-700">{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchMetrics}>
          Try Again
        </Button>
      </div>
    );
  }

  if (!metrics) return null;

  const healthyProducts = metrics.totalProducts - metrics.productsWithIssues;
  const healthRate = metrics.totalProducts > 0 
    ? Math.round((healthyProducts / metrics.totalProducts) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CheckCircle className="h-8 w-8 text-green-600" />
          <div>
            <h1 className="text-3xl font-bold">Data Quality</h1>
            <p className="text-muted-foreground">
              Monitor and improve product data completeness
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={fetchMetrics} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Products"
          value={metrics.totalProducts}
          icon={Package}
          subtitle="In ingestion pipeline"
        />
        <StatCard
          title="Healthy Products"
          value={healthyProducts}
          icon={CheckCircle}
          variant="success"
          subtitle={`${healthRate}% complete`}
        />
        <StatCard
          title="Products with Issues"
          value={metrics.productsWithIssues}
          icon={AlertTriangle}
          variant={metrics.productsWithIssues > 0 ? 'warning' : 'default'}
          subtitle={`${metrics.issueRate}% need attention`}
        />
        <StatCard
          title="Updated Today"
          value={metrics.recentlyUpdated}
          icon={TrendingUp}
          variant="info"
          subtitle="Last 24 hours"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Completeness Distribution</h2>
          <div className="space-y-3">
            {metrics.completenessDistribution.map(({ range, count, percentage }) => {
              const isGood = range === '100%' || range === '76-99%';
              const colorClass = range === '100%' 
                ? 'bg-green-500' 
                : range === '76-99%' 
                  ? 'bg-blue-500' 
                  : range === '51-75%' 
                    ? 'bg-yellow-500' 
                    : 'bg-red-500';

              return (
                <div key={range}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className={isGood ? 'text-green-700' : 'text-foreground'}>
                      {range}
                    </span>
                    <span className="font-medium">
                      {count} ({percentage}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full ${colorClass}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Issue Breakdown</h2>
          <div className="space-y-3">
            {metrics.issueBreakdown.map(({ field, severity, count, percentage }) => {
              const Icon = fieldIcons[field] || AlertTriangle;
              const label = fieldLabels[field] || field;
              
              return (
                <div
                  key={field}
                  className={`flex items-center justify-between rounded-lg border p-3 ${severityBg[severity]}`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5" />
                    <div>
                      <p className="font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">
                        {severity === 'required' ? 'Required' : 'Recommended'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground">{percentage}% missing</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Issues by Pipeline Status</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {metrics.byPipelineStatus.map(({ status, total, withIssues }) => {
            const healthyPercent = total > 0 ? Math.round(((total - withIssues) / total) * 100) : 0;
            
            return (
              <div key={status} className="rounded-lg border p-4 text-center">
                <p className="text-sm font-medium capitalize text-muted-foreground">
                  {status}
                </p>
                <p className="mt-1 text-2xl font-bold">{total}</p>
                <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                  {withIssues > 0 ? (
                    <>
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <span className="text-yellow-700">{withIssues} issues</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-green-700">All good</span>
                    </>
                  )}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-green-500"
                    style={{ width: `${healthyPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
