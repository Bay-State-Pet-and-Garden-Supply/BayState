import { render, screen } from '@testing-library/react';
import { RecentActivity } from '@/components/admin/dashboard/recent-activity';

// Mock date-fns to avoid timezone issues
jest.mock('date-fns', () => ({
  formatDistanceToNow: jest.fn(() => '5 minutes ago'),
}));

describe('RecentActivity', () => {
  const mockActivities = [
    {
      id: '1',
      type: 'order' as const,
      title: 'Order #1234',
      description: 'John Doe - $45.99',
      timestamp: new Date().toISOString(),
      status: 'pending' as const,
      href: '/admin/orders/1',
    },
    {
      id: '2',
      type: 'product' as const,
      title: 'Product Updated',
      description: 'Dog Food Premium',
      timestamp: new Date().toISOString(),
      status: 'success' as const,
    },
  ];

  it('renders activity titles', () => {
    render(<RecentActivity activities={mockActivities} />);

    expect(screen.getByText('Order #1234')).toBeInTheDocument();
    expect(screen.getByText('Product Updated')).toBeInTheDocument();
  });

  it('renders activity descriptions', () => {
    render(<RecentActivity activities={mockActivities} />);

    expect(screen.getByText('John Doe - $45.99')).toBeInTheDocument();
    expect(screen.getByText('Dog Food Premium')).toBeInTheDocument();
  });

  it('renders timestamps', () => {
    render(<RecentActivity activities={mockActivities} />);

    // Both activities should show the mocked time
    const timestamps = screen.getAllByText('5 minutes ago');
    expect(timestamps).toHaveLength(2);
  });

  it('renders section heading', () => {
    render(<RecentActivity activities={mockActivities} />);

    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
  });

  it('renders empty state when no activities', () => {
    render(<RecentActivity activities={[]} />);

    expect(screen.getByText('No recent activity')).toBeInTheDocument();
  });

  it('limits displayed items based on maxItems prop', () => {
    const manyActivities = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      type: 'order' as const,
      title: `Order #${i}`,
      timestamp: new Date().toISOString(),
    }));

    render(<RecentActivity activities={manyActivities} maxItems={3} />);

    expect(screen.getByText('Order #0')).toBeInTheDocument();
    expect(screen.getByText('Order #1')).toBeInTheDocument();
    expect(screen.getByText('Order #2')).toBeInTheDocument();
    expect(screen.queryByText('Order #3')).not.toBeInTheDocument();
  });

  it('renders activities with href as links', () => {
    render(<RecentActivity activities={mockActivities} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/admin/orders/1');
  });
});
