/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { PipelineStats } from '@/components/admin/pipeline/PipelineStats';
import type { StatusCount } from '@/lib/pipeline';

const mockCounts: StatusCount[] = [
  { status: 'imported', count: 10 },
  { status: 'scraped', count: 25 },
  { status: 'consolidated', count: 20 },
  { status: 'finalized', count: 15 },
  { status: 'published', count: 30 },
];

describe('PipelineStats', () => {
  it('renders all status cards with counts', () => {
    render(<PipelineStats counts={mockCounts} />);

    expect(screen.getByText('Imported')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();

    expect(screen.getByText('Scraped')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();

    expect(screen.getByText('Consolidated')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();

    expect(screen.getByText('Finalized')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();

    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('renders zero counts when no products', () => {
    const emptyCounts: StatusCount[] = [
      { status: 'imported', count: 0 },
      { status: 'scraped', count: 0 },
      { status: 'consolidated', count: 0 },
      { status: 'finalized', count: 0 },
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

    expect(handleStatusChange).toHaveBeenCalledWith('imported');
  });

  it('renders trend indicators when trends are provided', () => {
    const trends = {
      imported: 5,
      scraped: -3,
      consolidated: 10,
      finalized: 0,
      published: 15,
    };

    render(<PipelineStats counts={mockCounts} trends={trends} />);

    expect(screen.getByText('↑ 5%')).toBeInTheDocument();
    expect(screen.getByText('↓ 3%')).toBeInTheDocument();
    expect(screen.getByText('↑ 10%')).toBeInTheDocument();
    expect(screen.getByText('↑ 15%')).toBeInTheDocument();
  });

  it('does not render trend indicators when trends are not provided', () => {
    render(<PipelineStats counts={mockCounts} />);

    expect(screen.queryByText(/↑/)).not.toBeInTheDocument();
    expect(screen.queryByText(/↓/)).not.toBeInTheDocument();
  });

  it('renders loading skeleton when isLoading is true', () => {
    render(<PipelineStats counts={mockCounts} isLoading />);

    // Should render 5 skeleton cards
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
    expect(zeros).toHaveLength(4);
  });
  it('renders correct icons for each status', () => {
    render(<PipelineStats counts={mockCounts} />);

    const icons = document.querySelectorAll('svg');
    expect(icons.length).toBeGreaterThanOrEqual(5);
  });

  it('formats large numbers with locale string', () => {
    const largeCounts: StatusCount[] = [
      { status: 'imported', count: 10000 },
      { status: 'scraped', count: 25000 },
      { status: 'consolidated', count: 20000 },
      { status: 'finalized', count: 15000 },
      { status: 'published', count: 30000 },
    ];

    render(<PipelineStats counts={largeCounts} />);

    expect(screen.getByText('10,000')).toBeInTheDocument();
    expect(screen.getByText('25,000')).toBeInTheDocument();
    expect(screen.getByText('20,000')).toBeInTheDocument();
    expect(screen.getByText('15,000')).toBeInTheDocument();
    expect(screen.getByText('30,000')).toBeInTheDocument();
  });
});
