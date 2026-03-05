import { render, screen } from '@testing-library/react';
import { ServiceCard } from '@/components/storefront/service-card';
import { type Service } from '@/lib/data';

const mockService: Service = {
  id: '1',
  name: 'Propane Refill',
  slug: 'propane-refill',
  description: 'Quick and easy propane tank refills',
  price: 19.99,
  unit: 'tank',
  is_active: true,
  created_at: '2024-01-01',
};

describe('ServiceCard', () => {
  it('renders service name', () => {
    render(<ServiceCard service={mockService} />);
    expect(screen.getByText('Propane Refill')).toBeInTheDocument();
  });

  it('renders formatted price with unit', () => {
    render(<ServiceCard service={mockService} />);
    expect(screen.getByText('$19.99')).toBeInTheDocument();
    expect(screen.getByText('/tank')).toBeInTheDocument();
  });

  it('renders Service badge', () => {
    render(<ServiceCard service={mockService} />);
    expect(screen.getByText('Service')).toBeInTheDocument();
  });

  it('renders Reserve button', () => {
    render(<ServiceCard service={mockService} />);
    expect(screen.getByRole('button', { name: /reserve/i })).toBeInTheDocument();
  });

  it('links to service detail page', () => {
    render(<ServiceCard service={mockService} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/services/propane-refill');
  });

  it('shows contact for pricing when no price', () => {
    const serviceNoPrice = { ...mockService, price: null };
    render(<ServiceCard service={serviceNoPrice} />);
    expect(screen.getByText('Contact for pricing')).toBeInTheDocument();
  });
});
