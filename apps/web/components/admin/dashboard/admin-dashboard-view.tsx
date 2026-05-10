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
  Eye,
  ShoppingCart,
  DollarSign,
  Truck,
  AlertCircle,
  CreditCard,
} from 'lucide-react';
import { MetricCard } from './metric-card';
import { ScraperStatusWidget } from './scraper-status-widget';
import { RecentActivityFeed } from './recent-activity-feed';
import { QuickActions } from './quick-actions';
import { FleetStatusWidget } from './FleetStatusWidget';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';

export function AdminDashboardView() {
  const { productStats, scraperStats, orderStats, inventoryStats, loading } = useDashboardStats();

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
    <div className="space-y-6">
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

      {/* Order/Inventory Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Today&apos;s Sales"
          value={orderStats?.today_sales ? `$${Number(orderStats.today_sales).toFixed(2)}` : '$0.00'}
          icon={DollarSign}
          status="success"
          isLoading={loading}
        />
        <MetricCard
          title="Open Orders"
          value={orderStats?.open_orders ?? 0}
          icon={ShoppingCart}
          status={orderStats?.open_orders && orderStats.open_orders > 0 ? 'info' : undefined}
          isLoading={loading}
        />
        <MetricCard
          title="Ready for Pickup"
          value={orderStats?.ready_for_pickup ?? 0}
          icon={Truck}
          status={orderStats?.ready_for_pickup && orderStats.ready_for_pickup > 0 ? 'success' : undefined}
          isLoading={loading}
        />
        <MetricCard
          title="Inventory Issues"
          value={inventoryStats?.open_issues ?? 0}
          icon={AlertCircle}
          status={inventoryStats?.open_issues && inventoryStats.open_issues > 0 ? 'warning' : undefined}
          isLoading={loading}
        />
        <MetricCard
          title="Unpaid Orders"
          value={orderStats?.unpaid_orders ?? 0}
          icon={CreditCard}
          status={orderStats?.unpaid_orders && orderStats.unpaid_orders > 0 ? 'warning' : undefined}
          isLoading={loading}
        />
        <MetricCard
          title="Register-only Products"
          value={inventoryStats?.register_only_products ?? 0}
          icon={PackagePlus}
          status={inventoryStats?.register_only_products && inventoryStats.register_only_products > 0 ? 'info' : undefined}
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
