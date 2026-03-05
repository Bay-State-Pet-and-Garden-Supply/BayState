import { render, screen } from '@testing-library/react';
import { PipelineStatus } from '@/components/admin/dashboard/pipeline-status';

describe('PipelineStatus', () => {
  const mockCounts = {
    staging: 10,
    scraped: 5,
    consolidated: 15,
    approved: 20,
    published: 50,
  };

  it('renders all status labels', () => {
    render(<PipelineStatus counts={mockCounts} />);

    expect(screen.getByText('Imported')).toBeInTheDocument();
    expect(screen.getByText('Enhanced')).toBeInTheDocument();
    expect(screen.getByText('Ready for Review')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders counts for each status', () => {
    render(<PipelineStatus counts={mockCounts} />);

    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('renders total count', () => {
    render(<PipelineStatus counts={mockCounts} />);

    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText(/items in intake/)).toBeInTheDocument();
  });

  it('shows attention banner when items need review', () => {
    render(<PipelineStatus counts={mockCounts} />);

    // staging (10) + scraped (5) + consolidated (15) = 30
    expect(screen.getByText('30 products need attention')).toBeInTheDocument();
  });

  it('does not show attention banner when no items need review', () => {
    const allPublished = {
      staging: 0,
      scraped: 0,
      consolidated: 0,
      approved: 0,
      published: 100,
    };

    render(<PipelineStatus counts={allPublished} />);

    expect(screen.queryByText(/products need attention/)).not.toBeInTheDocument();
  });

  it('renders View All link', () => {
    render(<PipelineStatus counts={mockCounts} />);

    const link = screen.getByRole('link', { name: /view all/i });
    expect(link).toHaveAttribute('href', '/admin/pipeline');
  });

  it('handles zero counts', () => {
    const zeroCounts = {
      staging: 0,
      scraped: 0,
      consolidated: 0,
      approved: 0,
      published: 0,
    };

    render(<PipelineStatus counts={zeroCounts} />);

    // All status rows show 0, plus the total
    const zeroElements = screen.getAllByText('0');
    expect(zeroElements.length).toBe(6); // 5 statuses + 1 total
    expect(screen.getByText(/items in intake/)).toBeInTheDocument();
  });
});
