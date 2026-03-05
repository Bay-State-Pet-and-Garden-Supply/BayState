import { render, screen } from '@testing-library/react';
import { StatCard } from '@/components/admin/dashboard/stat-card';
import { ShoppingCart } from 'lucide-react';

describe('StatCard', () => {
  it('renders title and value', () => {
    render(
      <StatCard
        title="Pending Orders"
        value={5}
        icon={ShoppingCart}
      />
    );

    expect(screen.getByText('Pending Orders')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(
      <StatCard
        title="Pending Orders"
        value={5}
        icon={ShoppingCart}
        subtitle="Needs attention"
      />
    );

    expect(screen.getByText('Needs attention')).toBeInTheDocument();
  });

  it('renders string values correctly', () => {
    render(
      <StatCard
        title="Revenue"
        value="$1,234.56"
        icon={ShoppingCart}
      />
    );

    expect(screen.getByText('$1,234.56')).toBeInTheDocument();
  });

  it('renders as a link when href is provided', () => {
    render(
      <StatCard
        title="Pending Orders"
        value={5}
        icon={ShoppingCart}
        href="/admin/orders"
      />
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/admin/orders');
  });

  it('does not render as a link when href is not provided', () => {
    render(
      <StatCard
        title="Revenue"
        value="$1,234.56"
        icon={ShoppingCart}
      />
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('applies warning variant styles', () => {
    render(
      <StatCard
        title="Low Stock"
        value={12}
        icon={ShoppingCart}
        variant="warning"
      />
    );

    expect(screen.getByText('Low Stock')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders trend information when provided', () => {
    render(
      <StatCard
        title="Revenue"
        value="$1,234.56"
        icon={ShoppingCart}
        trend={{ value: 15, label: 'vs last week', isPositive: true }}
      />
    );

    expect(screen.getByText('+15% vs last week')).toBeInTheDocument();
  });

  it('renders negative trend correctly', () => {
    render(
      <StatCard
        title="Revenue"
        value="$1,234.56"
        icon={ShoppingCart}
        trend={{ value: -10, label: 'vs last week', isPositive: false }}
      />
    );

    expect(screen.getByText('-10% vs last week')).toBeInTheDocument();
  });
});
