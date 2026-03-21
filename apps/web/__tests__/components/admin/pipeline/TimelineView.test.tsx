import { render, screen, fireEvent } from '@testing-library/react';
import { TimelineView } from '@/components/admin/pipeline/TimelineView';

describe('TimelineView', () => {
  const mockJobs = [
    {
      id: '1',
      name: 'Job 1',
      startTime: new Date(Date.now() - 3600000),
      endTime: new Date(Date.now() - 1800000),
      status: 'completed' as const,
      runner: 'runner-1',
    },
    {
      id: '2',
      name: 'Job 2',
      startTime: new Date(Date.now() - 7200000),
      status: 'running' as const,
      runner: 'runner-2',
    },
    {
      id: '3',
      name: 'Job 3',
      startTime: new Date(Date.now() - 10800000),
      endTime: new Date(Date.now() - 9000000),
      status: 'failed' as const,
    },
  ];

  it('renders time range buttons', () => {
    render(<TimelineView jobs={mockJobs} timeRange="24h" />);

    expect(screen.getByRole('button', { name: '1h' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '6h' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '24h' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7d' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30d' })).toBeInTheDocument();
  });

  it('renders job names', () => {
    render(<TimelineView jobs={mockJobs} timeRange="24h" />);

    expect(screen.getByText('Job 1')).toBeInTheDocument();
    expect(screen.getByText('Job 2')).toBeInTheDocument();
    expect(screen.getByText('Job 3')).toBeInTheDocument();
  });

  it('calls onTimeRangeChange when time range button clicked', () => {
    const handleRangeChange = jest.fn();
    render(
      <TimelineView
        jobs={mockJobs}
        timeRange="24h"
        onTimeRangeChange={handleRangeChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '6h' }));
    expect(handleRangeChange).toHaveBeenCalledWith('6h');
  });

  it('calls onJobClick when job row clicked', () => {
    const handleJobClick = jest.fn();
    render(
      <TimelineView
        jobs={mockJobs}
        timeRange="24h"
        onJobClick={handleJobClick}
      />
    );

    fireEvent.click(screen.getByText('Job 1'));
    expect(handleJobClick).toHaveBeenCalledWith(expect.objectContaining({
      id: '1',
      name: 'Job 1',
    }));
  });

  it('shows warning when more than 50 jobs', () => {
    const manyJobs = Array.from({ length: 60 }, (_, i) => ({
      id: String(i),
      name: `Job ${i}`,
      startTime: new Date(Date.now() - i * 60000),
      status: 'completed' as const,
    }));

    render(<TimelineView jobs={manyJobs} timeRange="24h" />);
    expect(screen.getByText(/Showing 50 of 60 jobs/)).toBeInTheDocument();
  });
});
