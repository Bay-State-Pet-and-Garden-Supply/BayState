import { render, screen } from '@testing-library/react';
import { PipelineStatus } from '@/components/admin/dashboard/pipeline-status';

describe('PipelineStatus', () => {
  const mockCounts = {
    imported: 10,
    scraped: 5,
    finalized: 35,
    failed: 2,
    published: 50,
  };

  it('renders all canonical status labels', () => {
    render(<PipelineStatus counts={mockCounts} />);

    expect(screen.getByText('Imported')).toBeInTheDocument();
    expect(screen.getByText('Scraped')).toBeInTheDocument();
    expect(screen.getByText('Finalized')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('renders counts for each status', () => {
    render(<PipelineStatus counts={mockCounts} />);

    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('35')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders total count including published', () => {
    render(<PipelineStatus counts={mockCounts} />);

    // Total includes all statuses: 10 + 5 + 35 + 2 + 50 = 102
    expect(screen.getByText('102')).toBeInTheDocument();
    expect(screen.getByText(/items in intake/)).toBeInTheDocument();
  });

  it('shows intake pipeline banner with total count', () => {
    render(<PipelineStatus counts={mockCounts} />);

    // Banner shows total count of items in intake pipeline
    expect(screen.getByText(/52/)).toBeInTheDocument();
    expect(screen.getByText(/products are in the intake pipeline/)).toBeInTheDocument();
  });

  it('does not show banner when no items in pipeline', () => {
    const emptyCounts = {
      imported: 0,
      scraped: 0,
      finalized: 0,
      failed: 0,
      published: 0,
    };

    render(<PipelineStatus counts={emptyCounts} />);

    expect(screen.queryByText(/products are in the intake pipeline/)).not.toBeInTheDocument();
  });

  it('renders View All link', () => {
    render(<PipelineStatus counts={mockCounts} />);

    const link = screen.getByRole('link', { name: /view all/i });
    expect(link).toHaveAttribute('href', '/admin/pipeline');
  });

  it('handles zero counts', () => {
    const zeroCounts = {
      imported: 0,
      scraped: 0,
      finalized: 0,
      failed: 0,
      published: 0,
    };

    render(<PipelineStatus counts={zeroCounts} />);

    // All 4 canonical status rows show 0, plus the total
    const zeroElements = screen.getAllByText('0');
    expect(zeroElements.length).toBe(5); // 4 canonical statuses + 1 total
    expect(screen.getByText(/items in intake/)).toBeInTheDocument();
  });
});
