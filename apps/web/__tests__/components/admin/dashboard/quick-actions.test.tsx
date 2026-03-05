import { render, screen } from '@testing-library/react';
import { QuickActions } from '@/components/admin/dashboard/quick-actions';
import { ShoppingCart, BarChart3 } from 'lucide-react';

describe('QuickActions', () => {
  const mockActions = [
    { label: 'View Orders', href: '/admin/orders', icon: ShoppingCart },
    { label: 'View Analytics', href: '/admin/analytics', icon: BarChart3 },
  ];

  it('renders all action buttons', () => {
    render(<QuickActions actions={mockActions} />);

    expect(screen.getByText('View Orders')).toBeInTheDocument();
    expect(screen.getByText('View Analytics')).toBeInTheDocument();
  });

  it('renders action buttons as links', () => {
    render(<QuickActions actions={mockActions} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/admin/orders');
    expect(links[1]).toHaveAttribute('href', '/admin/analytics');
  });

  it('renders section heading', () => {
    render(<QuickActions actions={mockActions} />);

    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
  });

  it('handles empty actions array', () => {
    render(<QuickActions actions={[]} />);

    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
