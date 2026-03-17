import { render, screen, fireEvent } from '@testing-library/react';
import { Package, Search, FileCheck, CheckCircle, Globe } from 'lucide-react';
import { PipelineStats } from '@/components/admin/pipeline/PipelineStats';
import type { StatusCount, PipelineStatus } from '@/lib/pipeline';

const mockCounts: StatusCount[] = [
  { status: 'staging', count: 10 },
  { status: 'scraped', count: 25 },
  { status: 'consolidated', count: 15 },
  { status: 'approved', count: 30 },
  { status: 'published', count: 50 },
];

describe('PipelineStats', () => {
  it('renders all five status cards with counts', () => {
    render(<PipelineStats counts={mockCounts} />);

    expect(screen.getByText('Imported')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();

    expect(screen.getByText('Enhanced')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();

    expect(screen.getByText('Ready for Review')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();

    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();

    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('renders zero counts when no products', () => {
    const emptyCounts: StatusCount[] = [
      { status: 'staging', count: 0 },
      { status: 'scraped', count: 0 },
      { status: 'consolidated', count: 0 },
      { status: 'approved', count: 0 },
      { status: 'published', count: 0 },
    ];

    render(<PipelineStats counts={emptyCounts} />);

    expect(screen.getAllByText('0')).toHaveLength(5);
  });

  it('calls onStatusChange when card is clicked', () => {
    const handleStatusChange = jest.fn();
    render(
      <PipelineStats
        counts={mockCounts}
        onStatusChange={handleStatusChange}
      />
    );

    fireEvent.click(screen.getByText('Imported'));

    expect(handleStatusChange).toHaveBeenCalledWith('staging');
  });

  it('shows Filtering subtitle when status is active', () => {
    render(
      <PipelineStats
        counts={mockCounts}
        activeStatus="scraped"
      />
    );

    expect(screen.getByText('Filtering')).toBeInTheDocument();
  });

  it('does not show Filtering when no status is active', () => {
    render(
      <PipelineStats
        counts={mockCounts}
        activeStatus="all"
      />
    );

    expect(screen.queryByText('Filtering')).not.toBeInTheDocument();
  });

  it('handles missing counts gracefully', () => {
    const partialCounts: StatusCount[] = [
      { status: 'staging', count: 10 },
    ];

    render(<PipelineStats counts={partialCounts} />);

    expect(screen.getByText('Imported')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('renders correct icons for each status', () => {
    render(<PipelineStats counts={mockCounts} />);

    const icons = document.querySelectorAll('svg');
    expect(icons.length).toBeGreaterThanOrEqual(5);
  });
});
