import { render, screen } from '@testing-library/react';
import AddProductPage from '@/app/admin/products/new/page';

// Mock server actions if necessary
jest.mock('@/app/admin/products/new/actions', () => ({
  createProduct: jest.fn(),
}));

describe('Add Product Page', () => {
  it('renders product form fields', () => {
    render(<AddProductPage />);

    expect(screen.getByLabelText(/product name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/slug/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/price/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create product/i })).toBeInTheDocument();
  });
});
