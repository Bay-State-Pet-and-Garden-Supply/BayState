import { render, screen } from '@testing-library/react';
import AdminProductsPage from '@/app/admin/products/page';

// Mock next/navigation hooks used by AdminProductsClient
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/products',
}));

// Mock the server component data fetching
// In Next.js App Router, pages are async components.
// We can test them by awaiting them or mocking the data source.

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    from: jest.fn((table: string) => ({
      select: jest.fn(() => {
        if (table === 'products') {
          return {
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [
                  {
                    id: '1',
                    sku: 'SKU001',
                    name: 'Test Product 1',
                    slug: 'test-product-1',
                    description: 'A test product',
                    long_description: null,
                    price: 10.99,
                    weight: null,
                    stock_status: 'in_stock',
                    images: [],
                    brand_id: 'brand-1',
                    category: 'Dog Food',
                    product_type: 'Food',
                    search_keywords: null,
                    gtin: null,
                    availability: 'in stock',
                    minimum_quantity: 0,
                    is_special_order: false,
                    is_taxable: true,
                    shopsite_pages: [],
                    created_at: '2024-01-01',
                    storefront_settings: { is_featured: false, pickup_only: false },
                    product_categories: [{ category_id: 'cat-1' }],
                    brand: { id: 'brand-1', name: 'Test Brand', slug: 'test-brand' },
                  },
                  {
                    id: '2',
                    sku: 'SKU002',
                    name: 'Test Product 2',
                    slug: 'test-product-2',
                    description: 'Another test product',
                    long_description: null,
                    price: 20.0,
                    weight: null,
                    stock_status: 'out_of_stock',
                    images: [],
                    brand_id: null,
                    category: null,
                    product_type: 'Treats',
                    search_keywords: null,
                    gtin: null,
                    availability: null,
                    minimum_quantity: 0,
                    is_special_order: false,
                    is_taxable: true,
                    shopsite_pages: [],
                    created_at: '2024-01-02',
                    storefront_settings: { is_featured: false, pickup_only: false },
                    product_categories: [],
                    brand: null,
                  },
                ],
                count: 2,
                error: null,
              }),
            }),
            not: jest.fn().mockResolvedValue({
              data: [{ product_type: 'Food' }, { product_type: 'Treats' }],
              error: null,
            }),
          };
        }

        if (table === 'brands') {
          return {
            order: jest.fn().mockResolvedValue({
              data: [{ id: 'brand-1', name: 'Test Brand' }],
              error: null,
            }),
          };
        }

        if (table === 'categories') {
          return {
            order: jest.fn().mockResolvedValue({
              data: [{ id: 'cat-1', name: 'Dog Food' }],
              error: null,
            }),
          };
        }

        return {
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      }),
    })),
  }),
}));

describe('Admin Products Page', () => {
  it('displays a list of products', async () => {
    // Resolve the async component
    const Page = await AdminProductsPage();
    render(Page);

    expect(screen.getByText('Test Product 1')).toBeInTheDocument();
    expect(screen.getByText('Test Product 2')).toBeInTheDocument();
  });

  it('displays product count', async () => {
    const Page = await AdminProductsPage();
    render(Page);

    expect(screen.getByText('2 published products total')).toBeInTheDocument();
  });
});
