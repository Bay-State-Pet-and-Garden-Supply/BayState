import { render, screen } from '@testing-library/react';
import { ScraperStatusWidget } from '@/components/admin/dashboard/scraper-status-widget';

// Mock the hook
jest.mock('@/hooks/use-job-stats', () => ({
  useJobStats: () => ({
    stats: {
      totalJobs: 100,
      successRate: 95.5,
      itemsPerMin: 12.3,
      activeJobs: 2,
    },
    loading: false,
    error: null,
  }),
}));

describe('ScraperStatusWidget', () => {
  it('renders scraper statistics', () => {
    render(<ScraperStatusWidget />);

    expect(screen.getByText('Scraper Status')).toBeInTheDocument();
    expect(screen.getByText('95.5%')).toBeInTheDocument();
    expect(screen.getByText('2 Active')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    // Override mock for this test
    const { useJobStats } = require('@/hooks/use-job-stats');
    jest.spyOn(require('@/hooks/use-job-stats'), 'useJobStats').mockReturnValue({
      stats: { totalJobs: 0, successRate: 0, itemsPerMin: 0, activeJobs: 0 },
      loading: true,
      error: null,
    });

    render(<ScraperStatusWidget />);
    
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
