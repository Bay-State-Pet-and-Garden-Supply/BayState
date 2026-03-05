import { render, screen, fireEvent } from '@testing-library/react';
import { AddServiceToCartButton } from '@/components/storefront/add-service-to-cart-button';
import { type Service } from '@/lib/data';

// Mock the cart store
const mockAddItem = jest.fn();
jest.mock('@/lib/cart-store', () => ({
  useCartStore: (selector: (state: { addItem: typeof mockAddItem }) => unknown) =>
    selector({ addItem: mockAddItem }),
}));

const mockService: Service = {
  id: '1',
  name: 'Propane Refill',
  slug: 'propane-refill',
  description: 'Tank refills',
  price: 19.99,
  unit: 'tank',
  is_active: true,
  created_at: '2024-01-01',
};

describe('AddServiceToCartButton', () => {
  beforeEach(() => {
    mockAddItem.mockClear();
  });

  it('renders Reserve Now button for priced service', () => {
    render(<AddServiceToCartButton service={mockService} />);
    expect(screen.getByRole('button', { name: /reserve now/i })).toBeInTheDocument();
  });

  it('renders Call to Reserve for service without price', () => {
    const serviceNoPrice = { ...mockService, price: null };
    render(<AddServiceToCartButton service={serviceNoPrice} />);
    expect(screen.getByRole('link', { name: /call to reserve/i })).toBeInTheDocument();
  });

  it('adds service to cart when clicked', () => {
    render(<AddServiceToCartButton service={mockService} />);
    const button = screen.getByRole('button', { name: /reserve now/i });
    fireEvent.click(button);

    expect(mockAddItem).toHaveBeenCalledWith({
      id: 'service-1',
      name: 'Propane Refill (Service)',
      slug: 'services/propane-refill',
      price: 19.99,
      imageUrl: null,
    });
  });

  it('shows Added to Cart feedback after click', () => {
    render(<AddServiceToCartButton service={mockService} />);
    const button = screen.getByRole('button', { name: /reserve now/i });
    fireEvent.click(button);

    expect(screen.getByText(/added to cart/i)).toBeInTheDocument();
  });
});
