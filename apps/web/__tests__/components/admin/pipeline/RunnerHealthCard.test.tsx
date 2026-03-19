import { render, screen, fireEvent } from '@testing-library/react';
import { RunnerHealthCard } from '@/components/admin/pipeline/RunnerHealthCard';

describe('RunnerHealthCard', () => {
  const mockRunner = {
    id: 'runner-1',
    name: 'Runner 1',
    status: 'busy' as const,
    activeJobs: 2,
    lastSeen: new Date(),
    cpuUsage: 75,
    memoryUsage: 60,
    currentJob: {
      id: 'job-1',
      name: 'Current Job',
      progress: 50,
    },
  };

  it('renders runner name and status', () => {
    render(<RunnerHealthCard runner={mockRunner} />);

    expect(screen.getByText('Runner 1')).toBeInTheDocument();
    expect(screen.getByText('Busy')).toBeInTheDocument();
  });

  it('displays active jobs count', () => {
    render(<RunnerHealthCard runner={mockRunner} />);

    expect(screen.getByText('Active Jobs')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('displays CPU and memory usage when showDetails is true', () => {
    render(<RunnerHealthCard runner={mockRunner} showDetails={true} />);

    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('displays current job progress when busy', () => {
    render(<RunnerHealthCard runner={mockRunner} showDetails={true} />);

    expect(screen.getByText('Current Job')).toBeInTheDocument();
  });

  it('calls onClick when card is clicked', () => {
    const handleClick = jest.fn();
    render(<RunnerHealthCard runner={mockRunner} onClick={handleClick} />);

    fireEvent.click(screen.getByText('Runner 1'));
    expect(handleClick).toHaveBeenCalledWith(mockRunner);
  });

  it('does not call onClick when runner is offline', () => {
    const offlineRunner = { ...mockRunner, status: 'offline' as const };
    const handleClick = jest.fn();
    render(<RunnerHealthCard runner={offlineRunner} onClick={handleClick} />);

    fireEvent.click(screen.getByText('Runner 1'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('shows different status colors', () => {
    const { rerender } = render(
      <RunnerHealthCard runner={{ ...mockRunner, status: 'online' as const }} />
    );
    expect(screen.getByText('Online')).toBeInTheDocument();

    rerender(
      <RunnerHealthCard runner={{ ...mockRunner, status: 'idle' as const }} />
    );
    expect(screen.getByText('Idle')).toBeInTheDocument();

    rerender(
      <RunnerHealthCard runner={{ ...mockRunner, status: 'offline' as const }} />
    );
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });
});
