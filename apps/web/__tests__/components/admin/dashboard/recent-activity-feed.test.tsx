import { render, screen } from '@testing-library/react';
import { RecentActivityFeed } from '@/components/admin/dashboard/recent-activity-feed';

// Mock the hook
jest.mock('@/hooks/use-recent-activity', () => ({
  useRecentActivity: () => ({
    activities: [
      {
        id: '1',
        type: 'pipeline',
        title: 'Scraper Job completed',
        description: 'amazon, orgill',
        status: 'success',
        activity_timestamp: new Date().toISOString(),
        href: '/admin/scrapers/runs/1',
      },
      {
        id: '2',
        type: 'product',
        title: 'Product Updated: Dog Food',
        description: 'SKU-123',
        status: 'info',
        activity_timestamp: new Date().toISOString(),
        href: '/admin/products/2',
      },
    ],
    loading: false,
    error: null,
  }),
}));

// Mock date-fns
jest.mock('date-fns', () => ({
  formatDistanceToNow: jest.fn(() => '2 minutes ago'),
}));

describe('RecentActivityFeed', () => {
  it('renders activities from the hook', () => {
    render(<RecentActivityFeed />);

    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(screen.getByText('Scraper Job completed')).toBeInTheDocument();
    expect(screen.getByText('Product Updated: Dog Food')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    // Override mock
    const { useRecentActivity } = require('@/hooks/use-recent-activity');
    jest.spyOn(require('@/hooks/use-recent-activity'), 'useRecentActivity').mockReturnValue({
      activities: [],
      loading: true,
      error: null,
    });

    render(<RecentActivityFeed />);
    
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
