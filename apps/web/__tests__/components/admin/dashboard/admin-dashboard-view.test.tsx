import { render, screen } from '@testing-library/react';
import { AdminDashboardView } from '@/components/admin/dashboard/admin-dashboard-view';

// Mock the components used in the dashboard
jest.mock('@/components/admin/dashboard/metric-card', () => ({
  MetricCard: () => <div data-testid="metric-card" />,
}));
jest.mock('@/components/admin/dashboard/scraper-status-widget', () => ({
  ScraperStatusWidget: () => <div data-testid="scraper-status-widget" />,
}));
jest.mock('@/components/admin/dashboard/recent-activity-feed', () => ({
  RecentActivityFeed: () => <div data-testid="recent-activity-feed" />,
}));
jest.mock('@/components/admin/dashboard/quick-actions', () => ({
  QuickActions: () => <div data-testid="quick-actions" />,
}));
jest.mock('@/components/admin/dashboard/FleetStatusWidget', () => ({
  FleetStatusWidget: () => <div data-testid="fleet-status-widget" />,
}));

// Mock the hook
jest.mock('@/hooks/use-dashboard-stats', () => ({
  useDashboardStats: () => ({
    productStats: { total_count: 100, published_count: 80, low_stock_count: 5, out_of_stock_count: 2 },
    scraperStats: { total_jobs: 50, completed_jobs: 45, failed_jobs: 5, active_jobs: 1 },
    loading: false,
    error: null,
  }),
}));

describe('AdminDashboardView', () => {
  it('renders the dashboard components', () => {
    render(<AdminDashboardView />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getAllByTestId('metric-card')).toHaveLength(4);
    expect(screen.getByTestId('scraper-status-widget')).toBeInTheDocument();
    expect(screen.getByTestId('recent-activity-feed')).toBeInTheDocument();
    expect(screen.getByTestId('fleet-status-widget')).toBeInTheDocument();
  });
});
