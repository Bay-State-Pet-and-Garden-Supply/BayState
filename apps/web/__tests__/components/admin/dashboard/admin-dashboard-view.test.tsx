import { render, screen } from '@testing-library/react';
import { AdminDashboardView } from '@/components/admin/dashboard/admin-dashboard-view';

// Mock the components used in the dashboard
jest.mock('@/components/admin/dashboard/metric-card', () => ({
  MetricCard: () => <div data-testid="metric-card" />,
}));
jest.mock('@/components/admin/dashboard/recent-activity-feed', () => ({
  RecentActivityFeed: () => <div data-testid="recent-activity-feed" />,
}));
jest.mock('@/components/admin/dashboard/quick-actions', () => ({
  QuickActions: () => <div data-testid="quick-actions" />,
}));

// Mock the hook
jest.mock('@/hooks/use-dashboard-stats', () => ({
  useDashboardStats: () => ({
    productStats: { total_count: 100, published_count: 80, low_stock_count: 5, out_of_stock_count: 2, last_updated: new Date().toISOString() },
    scraperStats: { total_jobs: 50, completed_jobs: 45, failed_jobs: 5, active_jobs: 1, last_job_created: new Date().toISOString() },
    orderStats: { today_order_count: 3, today_sales: 150.00, open_orders: 2, unpaid_orders: 1, ready_for_pickup: 0, today_register_orders: 1, today_web_orders: 2 },
    inventoryStats: { open_issues: 5, register_only_products: 3, price_mismatches: 1, quantity_mismatches: 1, last_issue_created_at: new Date().toISOString() },
    loading: false,
    error: null,
  }),
}));

describe('AdminDashboardView', () => {
  it('renders the dashboard components', () => {
    render(<AdminDashboardView />);

    expect(screen.getAllByTestId('metric-card')).toHaveLength(3);
    expect(screen.getByTestId('recent-activity-feed')).toBeInTheDocument();
    expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
  });
});
