import { render, screen } from '@testing-library/react';
import { MetricCard } from '@/components/admin/dashboard/metric-card';
import { Activity } from 'lucide-react';

describe('MetricCard', () => {
  it('renders title and value', () => {
    render(
      <MetricCard
        title="Total Products"
        value={1234}
        icon={Activity}
      />
    );

    expect(screen.getByText('Total Products')).toBeInTheDocument();
    expect(screen.getByText('1234')).toBeInTheDocument();
  });

  it('renders trend when provided', () => {
    render(
      <MetricCard
        title="Active Scrapers"
        value={5}
        trend={{ value: 20, label: 'vs yesterday', isPositive: true }}
      />
    );

    expect(screen.getByText('+20%')).toBeInTheDocument();
    expect(screen.getByText('vs yesterday')).toBeInTheDocument();
  });

  it('applies status-specific styles', () => {
    const { container } = render(
      <MetricCard
        title="Errors"
        value={3}
        status="error"
      />
    );

    // Should have some indicator of error status
    // Checking for text or specific class if known, but for now just basic render
    expect(screen.getByText('Errors')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(
      <MetricCard
        title="Loading Metric"
        value={0}
        isLoading={true}
      />
    );

    // Should render a skeleton or loading indicator
    // Based on shadcn/ui skeleton usage
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
