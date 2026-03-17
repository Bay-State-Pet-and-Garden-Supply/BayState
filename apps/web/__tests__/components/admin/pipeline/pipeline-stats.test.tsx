import { render, screen, fireEvent } from '@testing-library/react';
import { PipelineStats } from '@/components/admin/pipeline/PipelineStats';
import type { StatusCount } from '@/lib/pipeline';

const mockCounts: StatusCount[] = [
  { status: 'registered', count: 10 },
  { status: 'enriched', count: 25 },
  { status: 'finalized', count: 30 },
  { status: 'failed', count: 5 },
];

describe('PipelineStats', () => {
  it('renders all status cards with counts', () => {
    render(<PipelineStats counts={mockCounts} />);

    expect(screen.getByText('Registered')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();

    expect(screen.getByText('Enriched')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();

    expect(screen.getByText('Finalized')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders zero counts when no products', () => {
    const emptyCounts: StatusCount[] = [
      { status: 'registered', count: 0 },
      { status: 'enriched', count: 0 },
      { status: 'finalized', count: 0 },
      { status: 'failed', count: 0 },
    ];

    render(<PipelineStats counts={emptyCounts} />);

    expect(screen.getAllByText('0')).toHaveLength(4);
  });

  it('calls onStatusChange when card is clicked', () => {
    const handleStatusChange = jest.fn();
    render(
      <PipelineStats
        counts={mockCounts}
        onStatusChange={handleStatusChange}
      />
    );

    fireEvent.click(screen.getByText('Registered'));

    expect(handleStatusChange).toHaveBeenCalledWith('registered');
  });

  it('shows Filtering subtitle when status is active', () => {
    render(
      <PipelineStats
        counts={mockCounts}
        activeStatus="enriched"
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
      { status: 'registered', count: 10 },
    ];

    render(<PipelineStats counts={partialCounts} />);

    expect(screen.getByText('Registered')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('renders correct icons for each status', () => {
    render(<PipelineStats counts={mockCounts} />);

    const icons = document.querySelectorAll('svg');
    expect(icons.length).toBeGreaterThanOrEqual(4);
  });
});
