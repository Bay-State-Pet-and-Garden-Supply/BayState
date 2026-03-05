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
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({
            data: [
              {
                id: '1',
                sku: 'SKU001',
                name: 'Test Product 1',
                slug: 'test-product-1',
                description: 'A test product',
                price: 10.99,
                stock_status: 'in_stock',
                is_featured: false,
                images: [],
                brand_name: 'Test Brand',
                brand_slug: 'test-brand',
                created_at: '2024-01-01',
              },
              {
                id: '2',
                sku: 'SKU002',
                name: 'Test Product 2',
                slug: 'test-product-2',
                description: 'Another test product',
                price: 20.00,
                stock_status: 'out_of_stock',
                is_featured: false,
                images: [],
                brand_name: null,
                brand_slug: null,
                created_at: '2024-01-02',
              },
            ],
            count: 2,
            error: null,
          }),
        }),
      }),
    }),
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

    expect(screen.getByText('2 published products')).toBeInTheDocument();
  });
});
