/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { PipelineStats } from '@/components/admin/pipeline/PipelineStats';
import type { StatusCount } from '@/lib/pipeline';

const mockCounts: StatusCount[] = [
  { status: 'imported', count: 10 },
  { status: 'awaiting_brand', count: 0 },
  { status: 'extracting', count: 25 },
  { status: 'processed', count: 3 },
  { status: 'merging', count: 15 },
  { status: 'reviewing', count: 7 },
  { status: 'publishing', count: 2 },
  { status: 'failed', count: 1 },
];

describe('PipelineStats', () => {
  it('renders all status cards with counts', () => {
    render(<PipelineStats counts={mockCounts} />);

    expect(screen.getByText('Imported')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();

    expect(screen.getByText('Extracting')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();

    expect(screen.getByText('Merging')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();

    expect(screen.getByText('Publishing')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

  });

  it('renders zero counts when no products', () => {
    const emptyCounts: StatusCount[] = [
      { status: 'imported', count: 0 },
      { status: 'awaiting_brand', count: 0 },
      { status: 'extracting', count: 0 },
      { status: 'processed', count: 0 },
      { status: 'merging', count: 0 },
      { status: 'reviewing', count: 0 },
      { status: 'publishing', count: 0 },
      { status: 'failed', count: 0 },
    ];

    render(<PipelineStats counts={emptyCounts} />);

    expect(screen.getAllByText('0')).toHaveLength(8);
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

    expect(handleStatusChange).toHaveBeenCalledWith('imported');
  });

  it('renders trend indicators when trends are provided', () => {
    const trends = {
      imported: 5,
      processed: -3,
      reviewing: 0,
    };

    render(<PipelineStats counts={mockCounts} trends={trends} />);

    expect(screen.getByText('↑ 5%')).toBeInTheDocument();
    expect(screen.getByText('↓ 3%')).toBeInTheDocument();
    expect(screen.getByText('↑ 0%')).toBeInTheDocument();
  });

  it('does not render trend indicators when trends are not provided', () => {
    render(<PipelineStats counts={mockCounts} />);

    expect(screen.queryByText(/↑/)).not.toBeInTheDocument();
    expect(screen.queryByText(/↓/)).not.toBeInTheDocument();
  });

  it('renders loading skeleton when isLoading is true', () => {
    render(<PipelineStats counts={mockCounts} isLoading />);

    // Should render workflow skeleton cards
    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('handles missing counts gracefully', () => {
    const partialCounts: StatusCount[] = [
      { status: 'imported', count: 10 },
    ];

    render(<PipelineStats counts={partialCounts} />);

    expect(screen.getByText('Imported')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    // Missing statuses should show 0
    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(7);
  });
  it('renders correct icons for each status', () => {
    render(<PipelineStats counts={mockCounts} />);

    const icons = document.querySelectorAll('svg');
    expect(icons.length).toBeGreaterThanOrEqual(7);
  });

  it('formats large numbers with locale string', () => {
    const largeCounts: StatusCount[] = [
      { status: 'imported', count: 10000 },
      { status: 'processed', count: 25000 },
      { status: 'reviewing', count: 15000 },
    ];

    render(<PipelineStats counts={largeCounts} />);

    expect(screen.getByText('10,000')).toBeInTheDocument();
    expect(screen.getByText('25,000')).toBeInTheDocument();
    expect(screen.getByText('15,000')).toBeInTheDocument();
  });
});
