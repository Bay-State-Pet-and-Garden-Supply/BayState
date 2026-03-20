import { createClient } from '@/lib/supabase/server';
import {
  Package,
  PackagePlus,
  BarChart3,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { StatCard } from '@/components/admin/dashboard/stat-card';
import { QuickActions } from '@/components/admin/dashboard/quick-actions';
import { PipelineStatus } from '@/components/admin/dashboard/pipeline-status';
import { formatCurrency } from '@/lib/utils';

export default async function AdminDashboard() {
  const supabase = await createClient();

  // Fetch all dashboard data in parallel (orders are deprecated and no longer tracked here)
  const [
    { count: totalPublishedProducts },
    { data: pipelineCounts },
    { data: outOfStockProducts },
  ] = await Promise.all([
    // Published products
    supabase
      .from('products')
      .select('*', { count: 'exact', head: true }),

    // Pipeline status counts - fetch all and count client-side
    supabase
      .from('products_ingestion')
      .select('pipeline_status'),

    // Out of stock products
    supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('stock_status', 'out_of_stock'),
  ]);

  // Calculate pipeline counts
  const pipelineStatusCounts = {
    staging: 0,
    scraped: 0,
    consolidated: 0,
    approved: 0,
    published: 0,
  };

  if (pipelineCounts) {
    for (const item of pipelineCounts) {
      const status = item.pipeline_status as keyof typeof pipelineStatusCounts;
      if (status in pipelineStatusCounts) {
        pipelineStatusCounts[status]++;
      }
    }
  }

  const needsReviewCount =
    pipelineStatusCounts.staging +
    pipelineStatusCounts.scraped +
    pipelineStatusCounts.consolidated;

  // No order-based revenue/activities; orders are deprecated.
  const activities: Array<{
    id: string;
    type: 'pipeline' | 'product';
    title: string;
    description: string;
    timestamp: string;
    status: 'info' | 'success' | 'warning' | 'pending';
    href: string;
  }> = [];

  // Quick actions
  const quickActions = [
    {
      label: 'Review New Products',
      href: '/admin/pipeline',
      icon: PackagePlus,
      variant: needsReviewCount > 0 ? ('default' as const) : ('outline' as const),
    },
    { label: 'Sync Products', href: '/admin/migration', icon: RefreshCw },
    { label: 'View Analytics', href: '/admin/analytics', icon: BarChart3 },
    { label: 'View Store', href: '/', icon: Eye },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back. Here&apos;s what&apos;s happening with your store.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="New Product Review"
          value={needsReviewCount}
          icon={PackagePlus}
          href="/admin/pipeline"
          variant={needsReviewCount > 0 ? 'info' : 'default'}
          subtitle={`${needsReviewCount} new items to review`}
        />

        <StatCard
          title="Published Products"
          value={totalPublishedProducts || 0}
          icon={Package}
          href="/admin/products"
          subtitle={
            outOfStockProducts?.length
              ? `${outOfStockProducts.length} out of stock`
              : 'Catalog size'
          }
          variant={outOfStockProducts?.length ? 'warning' : 'default'}
        />

        <StatCard
          title="Out of Stock"
          value={outOfStockProducts?.length || 0}
          icon={BarChart3}
          href="/admin/products?status=out-of-stock"
          subtitle={outOfStockProducts?.length ? 'Investigate soon' : 'No issues'}
          variant={outOfStockProducts?.length ? 'warning' : 'default'}
        />

        <StatCard
          title="Pipeline Items"
          value={pipelineCounts?.length || 0}
          icon={RefreshCw}
          href="/admin/pipeline"
          subtitle="Total items in product ingestion pipeline"
          variant="default"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-1">
        {/* Pipeline Status */}
        <PipelineStatus counts={pipelineStatusCounts} />
      </div>

      {/* Quick Actions */}
      <QuickActions actions={quickActions} />
    </div>
  );
}
