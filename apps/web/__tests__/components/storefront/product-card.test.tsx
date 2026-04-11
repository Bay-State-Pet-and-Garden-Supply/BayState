import { render, screen } from '@testing-library/react';
import { ProductCard } from '@/components/storefront/product-card';
import { type Product } from '@/lib/data';

const mockProduct: Product = {
  id: '1',
  brand_id: '1',
  name: 'Test Product',
  slug: 'test-product',
  description: 'A test product description',
  price: 29.99,
  stock_status: 'in_stock',
  images: ['https://example.com/image.jpg'],
  is_featured: true,
  is_special_order: false,
  weight: null,
  search_keywords: null,
  created_at: '2024-01-01',
  quantity: 10,
  low_stock_threshold: 5,
  is_taxable: true,
  published_at: '2024-01-01',
  brand: {
    id: '1',
    name: 'Test Brand',
    slug: 'test-brand',
    logo_url: null,
    created_at: '2024-01-01',
  },
};

describe('ProductCard', () => {
  it('renders product name', () => {
    render(<ProductCard product={mockProduct} />);
    expect(screen.getByText('Test Product')).toBeInTheDocument();
  });

  it.skip('shows fallback when image URL is invalid', () => {
    const productWithInvalidImage = { ...mockProduct, images: ['not-a-url'] };
    render(<ProductCard product={productWithInvalidImage} />);
    expect(screen.getByText('No image')).toBeInTheDocument();
  });

  it('renders formatted price', () => {
    render(<ProductCard product={mockProduct} />);
    expect(screen.getByText('$29.99')).toBeInTheDocument();
  });

  it('renders brand name', () => {
    render(<ProductCard product={mockProduct} />);
    expect(screen.getByText('Test Brand')).toBeInTheDocument();
  });

  it('links to product detail page', () => {
    render(<ProductCard product={mockProduct} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/products/test-product');
  });

  it('shows out of stock badge when applicable', () => {
    const outOfStockProduct = { ...mockProduct, stock_status: 'out_of_stock' as const };
    render(<ProductCard product={outOfStockProduct} />);
    expect(screen.getByText('Out of Stock')).toBeInTheDocument();
  });

  it('shows pre-order badge when applicable', () => {
    const preOrderProduct = { ...mockProduct, stock_status: 'pre_order' as const };
    render(<ProductCard product={preOrderProduct} />);
    expect(screen.getByText('Pre-Order')).toBeInTheDocument();
  });
});
