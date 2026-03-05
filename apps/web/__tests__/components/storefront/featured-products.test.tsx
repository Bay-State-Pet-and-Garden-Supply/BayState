import { render, screen } from '@testing-library/react';
import { FeaturedProducts } from '@/components/storefront/featured-products';
import { type Product } from '@/lib/data';

const mockProducts: Product[] = [
  {
    id: '1',
    brand_id: '1',
    name: 'Product 1',
    slug: 'product-1',
    description: 'Description 1',
    price: 19.99,
    sale_price: null,
    stock_status: 'in_stock',
    images: [],
    is_featured: true,
    is_special_order: false,
    weight: null,
    search_keywords: null,
    compare_at_price: null,
    cost_price: null,
    quantity: 10,
    low_stock_threshold: 5,
    is_taxable: true,
    tax_code: null,
    barcode: null,
    meta_title: null,
    meta_description: null,
    dimensions: null,
    origin_country: null,
    vendor: null,
    published_at: '2024-01-01',
    avg_rating: null,
    review_count: 0,
    category_id: null,
    created_at: '2024-01-01',
  },
  {
    id: '2',
    brand_id: '1',
    name: 'Product 2',
    slug: 'product-2',
    description: 'Description 2',
    price: 29.99,
    sale_price: null,
    stock_status: 'in_stock',
    images: [],
    is_featured: true,
    is_special_order: false,
    weight: null,
    search_keywords: null,
    compare_at_price: null,
    cost_price: null,
    quantity: 10,
    low_stock_threshold: 5,
    is_taxable: true,
    tax_code: null,
    barcode: null,
    meta_title: null,
    meta_description: null,
    dimensions: null,
    origin_country: null,
    vendor: null,
    published_at: '2024-01-01',
    avg_rating: null,
    review_count: 0,
    category_id: null,
    created_at: '2024-01-01',
  },
];

describe('FeaturedProducts', () => {
  it('renders section title', () => {
    render(<FeaturedProducts products={mockProducts} />);
    expect(screen.getByText('Featured Products')).toBeInTheDocument();
  });

  it('renders all products', () => {
    render(<FeaturedProducts products={mockProducts} />);
    expect(screen.getByText('Product 1')).toBeInTheDocument();
    expect(screen.getByText('Product 2')).toBeInTheDocument();
  });

  it('renders View All link', () => {
    render(<FeaturedProducts products={mockProducts} />);
    expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/products');
  });

  it('renders nothing when no products', () => {
    const { container } = render(<FeaturedProducts products={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
