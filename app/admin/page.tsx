import { createClient } from '@/lib/supabase/server';
import {
  ShoppingCart,
  Package,
  DollarSign,
  PackagePlus,
  BarChart3,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { StatCard } from '@/components/admin/dashboard/stat-card';
import { RecentActivity } from '@/components/admin/dashboard/recent-activity';
import { QuickActions } from '@/components/admin/dashboard/quick-actions';
import { PipelineStatus } from '@/components/admin/dashboard/pipeline-status';
import { formatCurrency } from '@/lib/utils';

export default async function AdminDashboard() {
  const supabase = await createClient();

  // Fetch all dashboard data in parallel
  const [
    { count: pendingOrdersCount },
    { count: totalPublishedProducts },
    { data: recentOrders },
    { data: pipelineCounts },
    { data: outOfStockProducts },
  ] = await Promise.all([
    // Pending orders
    supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),

    // Published products
    supabase
      .from('products')
      .select('*', { count: 'exact', head: true }),

    // Recent orders (last 10)
    supabase
      .from('orders')
      .select('id, order_number, status, total, created_at, customer_name')
      .order('created_at', { ascending: false })
      .limit(10),

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

  // Calculate today's revenue
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todaysOrders = (recentOrders || []).filter(
    (order) => new Date(order.created_at) >= today
  );
  const todaysRevenue = todaysOrders.reduce(
    (sum, order) => sum + (order.total || 0),
    0
  );

  // Build activity feed from recent orders
  const activities = (recentOrders || []).slice(0, 5).map((order) => ({
    id: order.id,
    type: 'order' as const,
    title: `Order #${order.order_number || order.id.slice(0, 8)}`,
    description: `${order.customer_name || 'Customer'} - ${formatCurrency(order.total || 0)}`,
    timestamp: order.created_at,
    status:
      order.status === 'completed'
        ? ('success' as const)
        : order.status === 'pending'
          ? ('pending' as const)
          : ('info' as const),
    href: `/admin/orders/${order.id}`,
  }));

  // Quick actions
  const quickActions = [
    {
      label: 'Review New Products',
      href: '/admin/pipeline',
      icon: PackagePlus,
      variant: needsReviewCount > 0 ? ('default' as const) : ('outline' as const),
    },
    { label: 'View Orders', href: '/admin/orders', icon: ShoppingCart },
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
          title="Pending Orders"
          value={pendingOrdersCount || 0}
          icon={ShoppingCart}
          href="/admin/orders?status=pending"
          variant={pendingOrdersCount && pendingOrdersCount > 0 ? 'warning' : 'default'}
          subtitle={
            pendingOrdersCount && pendingOrdersCount > 0
              ? 'Needs attention'
              : 'All caught up'
          }
        />

        <StatCard
          title="New Product Review"
          value={needsReviewCount}
          icon={PackagePlus}
          href="/admin/pipeline"
          variant={needsReviewCount > 0 ? 'info' : 'default'}
          subtitle={`${needsReviewCount} new items to review`}
        />

        <StatCard
          title="Today's Revenue"
          value={formatCurrency(todaysRevenue)}
          icon={DollarSign}
          variant="success"
          subtitle={`${todaysOrders.length} order${todaysOrders.length !== 1 ? 's' : ''} today`}
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
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pipeline Status */}
        <PipelineStatus counts={pipelineStatusCounts} />

        {/* Recent Activity */}
        <RecentActivity activities={activities} />
      </div>

      {/* Quick Actions */}
      <QuickActions actions={quickActions} />
    </div>
  );
}
