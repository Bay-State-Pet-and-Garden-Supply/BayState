import { render, screen, fireEvent } from '@testing-library/react';
import { PipelineStats } from '@/components/admin/pipeline/PipelineStats';
import type { StatusCount } from '@/lib/pipeline';

const mockCounts: StatusCount[] = [
  { status: 'registered', count: 10 },
  { status: 'enriched', count: 25 },
  { status: 'finalized', count: 30 },
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
  });

  it('renders zero counts when no products', () => {
    const emptyCounts: StatusCount[] = [
      { status: 'registered', count: 0 },
      { status: 'enriched', count: 0 },
      { status: 'finalized', count: 0 },
    ];

    render(<PipelineStats counts={emptyCounts} />);

    expect(screen.getAllByText('0')).toHaveLength(3);
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

  it('renders trend indicators when trends are provided', () => {
    const trends = {
      registered: 5,
      enriched: -3,
      finalized: 10,
    };

    render(<PipelineStats counts={mockCounts} trends={trends} />);

    expect(screen.getByText('↑ 5%')).toBeInTheDocument();
    expect(screen.getByText('↓ 3%')).toBeInTheDocument();
    expect(screen.getByText('↑ 10%')).toBeInTheDocument();
  });

  it('does not render trend indicators when trends are not provided', () => {
    render(<PipelineStats counts={mockCounts} />);

    expect(screen.queryByText(/↑/)).not.toBeInTheDocument();
    expect(screen.queryByText(/↓/)).not.toBeInTheDocument();
  });

  it('renders loading skeleton when isLoading is true', () => {
    render(<PipelineStats counts={mockCounts} isLoading />);

    // Should render 3 skeleton cards
    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('handles missing counts gracefully', () => {
    const partialCounts: StatusCount[] = [
      { status: 'registered', count: 10 },
    ];

    render(<PipelineStats counts={partialCounts} />);

    expect(screen.getByText('Registered')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    // Missing statuses should show 0 (enriched and finalized both show 0)
    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(2);
  });
  it('renders correct icons for each status', () => {
    render(<PipelineStats counts={mockCounts} />);

    const icons = document.querySelectorAll('svg');
    expect(icons.length).toBeGreaterThanOrEqual(3);
  });

  it('formats large numbers with locale string', () => {
    const largeCounts: StatusCount[] = [
      { status: 'registered', count: 10000 },
      { status: 'enriched', count: 25000 },
      { status: 'finalized', count: 30000 },
    ];

    render(<PipelineStats counts={largeCounts} />);

    expect(screen.getByText('10,000')).toBeInTheDocument();
    expect(screen.getByText('25,000')).toBeInTheDocument();
    expect(screen.getByText('30,000')).toBeInTheDocument();
  });
});