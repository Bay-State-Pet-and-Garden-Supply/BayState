import { render, screen, fireEvent } from '@testing-library/react';
import { HealthOverview } from '@/components/admin/pipeline/HealthOverview';

describe('HealthOverview', () => {
  const defaultMetrics = {
    totalProducts: 150,
    runningJobs: 5,
    failed24h: 2,
    activeRunners: 3,
    queueDepth: 10,
    successRate: 95,
  };

  const defaultTrends = {
    totalProducts: 10,
    runningJobs: -5,
    failed24h: 20,
    activeRunners: 0,
    queueDepth: -15,
    successRate: 2,
  };

  it('renders all 6 metric cards', () => {
    render(<HealthOverview metrics={defaultMetrics} />);

    expect(screen.getByText('Total Products')).toBeInTheDocument();
    expect(screen.getByText('Running Jobs')).toBeInTheDocument();
    expect(screen.getByText('Failed (24h)')).toBeInTheDocument();
    expect(screen.getByText('Active Runners')).toBeInTheDocument();
    expect(screen.getByText('Queue Depth')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
  });

  it('displays correct metric values', () => {
    render(<HealthOverview metrics={defaultMetrics} />);

    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
  });

  it('displays trend indicators when trends provided', () => {
    render(<HealthOverview metrics={defaultMetrics} trends={defaultTrends} />);

    expect(screen.getByText('↑ 10%')).toBeInTheDocument();
    expect(screen.getByText('↓ 5%')).toBeInTheDocument();
  });

  it('calls onCardClick when card is clicked', () => {
    const handleClick = jest.fn();
    render(<HealthOverview metrics={defaultMetrics} onCardClick={handleClick} />);

    fireEvent.click(screen.getByText('Total Products'));
    expect(handleClick).toHaveBeenCalledWith('totalProducts');
  });

  it('renders skeleton state when isLoading is true', () => {
    render(<HealthOverview metrics={defaultMetrics} isLoading={true} />);

    const skeletons = screen.getAllByRole('generic').filter(
      (el) => el.classList.contains('animate-pulse')
    );
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
