'use client';

import React from 'react';
import { 
  Package, 
  PackageCheck, 
  AlertTriangle, 
  PackagePlus,
  BarChart3,
  Eye,
} from 'lucide-react';
import { MetricCard } from './metric-card';
import { QuickActions } from './quick-actions';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { RecentActivityFeed } from './recent-activity-feed';

export function AdminDashboardView() {
  const { productStats, loading } = useDashboardStats();

  const quickActions = [
    {
      label: 'Review New Products',
      href: '/admin/pipeline',
      icon: PackagePlus,
      variant: 'default' as const,
    },
    { label: 'View Analytics', href: '/admin/analytics', icon: BarChart3 },
    { label: 'View Store', href: '/', icon: Eye },
  ];

  return (
    <div className="space-y-6">
      {/* Top Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Total Products"
          value={productStats?.total_count ?? 0}
          icon={Package}
          isLoading={loading}
          href="/admin/products"
        />
        <MetricCard
          title="Published"
          value={productStats?.published_count ?? 0}
          icon={PackageCheck}
          status="success"
          isLoading={loading}
          href="/admin/products"
        />
        <MetricCard
          title="Low Stock"
          value={productStats?.low_stock_count ?? 0}
          icon={AlertTriangle}
          status={productStats?.low_stock_count && productStats.low_stock_count > 0 ? "warning" : undefined}
          isLoading={loading}
          href="/admin/products"
        />
      </div>

      {/* Bottom Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentActivityFeed limit={12} />
        </div>
        <div className="lg:col-span-1">
          <QuickActions actions={quickActions} />
        </div>
      </div>
    </div>
  );
}

