'use client';

import React from 'react';
import { 
  Package, 
  PackageCheck, 
  AlertTriangle, 
  Activity,
  PackagePlus,
  RefreshCw,
  BarChart3,
  Eye
} from 'lucide-react';
import { MetricCard } from './metric-card';
import { ScraperStatusWidget } from './scraper-status-widget';
import { RecentActivityFeed } from './recent-activity-feed';
import { QuickActions } from './quick-actions';
import { FleetStatusWidget } from './FleetStatusWidget';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';

export function AdminDashboardView() {
  const { productStats, scraperStats, loading } = useDashboardStats();

  const quickActions = [
    {
      label: 'Review New Products',
      href: '/admin/pipeline',
      icon: PackagePlus,
      variant: 'default' as const,
    },
    { label: 'Sync Products', href: '/admin/migration', icon: RefreshCw },
    { label: 'View Analytics', href: '/admin/analytics', icon: BarChart3 },
    { label: 'View Store', href: '/', icon: Eye },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-4xl font-black uppercase tracking-tighter text-zinc-950">Dashboard</h1>
        <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest">
          Real-time overview of Bay State Pet & Garden Supply operations.
        </p>
      </div>

      {/* Top Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Products"
          value={productStats?.total_count ?? 0}
          icon={Package}
          isLoading={loading}
        />
        <MetricCard
          title="Published"
          value={productStats?.published_count ?? 0}
          icon={PackageCheck}
          status="success"
          isLoading={loading}
        />
        <MetricCard
          title="Low Stock"
          value={productStats?.low_stock_count ?? 0}
          icon={AlertTriangle}
          status={productStats?.low_stock_count && productStats.low_stock_count > 0 ? "warning" : undefined}
          isLoading={loading}
        />
        <MetricCard
          title="Active Scrapers"
          value={scraperStats?.active_jobs ?? 0}
          icon={Activity}
          status={scraperStats?.active_jobs && scraperStats.active_jobs > 0 ? "info" : undefined}
          isLoading={loading}
        />
      </div>

      {/* Middle Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ScraperStatusWidget />
        </div>
        <div className="lg:col-span-1">
          <FleetStatusWidget />
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentActivityFeed limit={8} />
        </div>
        <div className="lg:col-span-1">
          <QuickActions actions={quickActions} />
        </div>
      </div>
    </div>
  );
}
