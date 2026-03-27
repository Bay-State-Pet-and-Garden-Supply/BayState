/**
 * @jest-environment node
 */
import { getFeaturedProducts, getFilteredProducts } from '@/lib/products';

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { createClient } from '@/lib/supabase/server';

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('getFeaturedProducts - Data Fetching Waterfall Fix', () => {
  let mockFrom: jest.Mock;
  let mockProductSelect: jest.Mock;
  let mockProductEq: jest.Mock;
  let mockSettingsSelect: jest.Mock;
  let mockSettingsEq: jest.Mock;
  let mockRange: jest.Mock;
  let productQueryChain: Record<string, jest.Mock>;

  beforeEach(() => {
    jest.clearAllMocks();

    productQueryChain = {
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'prod-1',
            sku: 'SKU-1',
            name: 'Featured Product 1',
            slug: 'featured-product-1',
            description: 'A featured product',
            long_description: null,
            price: 29.99,
            stock_status: 'in_stock',
            images: ['/img1.jpg'],
            is_special_order: false,
            is_taxable: true,
            category: null,
            product_type: null,
            weight: null,
            search_keywords: null,
            shopsite_pages: [],
            published_at: null,
            gtin: null,
            availability: null,
            minimum_quantity: 0,
            quantity: 0,
            low_stock_threshold: 5,
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
            brand_id: 'brand-1',
            storefront_settings: {
              is_featured: true,
              pickup_only: false,
            },
            brand: {
              id: 'brand-1',
              name: 'Test Brand',
              slug: 'test-brand',
              logo_url: '/logo.png',
            },
          },
        ],
        error: null,
        count: 1,
      }),
    };

    mockProductEq = productQueryChain.eq as jest.Mock;
    mockRange = productQueryChain.range as jest.Mock;

    mockProductSelect = jest.fn().mockReturnValue(productQueryChain);

    mockSettingsEq = jest.fn().mockResolvedValue({
      data: [{ product_id: 'prod-1' }],
      error: null,
    });
    mockSettingsSelect = jest.fn().mockReturnValue({
      eq: mockSettingsEq,
    });

    mockFrom = jest.fn((table: string) => {
      if (table === 'product_storefront_settings') {
        return { select: mockSettingsSelect };
      }

      return { select: mockProductSelect };
    });

    mockCreateClient.mockResolvedValue({
      from: mockFrom,
    } as never);
  });

  it('should use products table, not products_published view', async () => {
    await getFeaturedProducts();

    // Verify products table is used, not products_published view
    expect(mockFrom).toHaveBeenCalledWith('products');
    expect(mockFrom).not.toHaveBeenCalledWith('products_published');
  });

  it('should include brand data in single query (no secondary fetch)', async () => {
    await getFeaturedProducts();

    expect(mockProductSelect.mock.calls[0][0]).toContain('brand:brands(id, name, slug, logo_url)');
    expect(mockProductSelect.mock.calls[0][0]).toContain(
      'storefront_settings:product_storefront_settings(is_featured, pickup_only)'
    );
    expect(mockProductSelect.mock.calls[0][1]).toEqual({ count: 'exact' });
  });

  it('should not make separate brand queries for featured products', async () => {
    await getFeaturedProducts();

    // Get all calls to from()
    const fromCalls = mockFrom.mock.calls.map((call) => call[0]);

    expect(fromCalls.filter((table) => table === 'products')).toHaveLength(1);
    expect(fromCalls.filter((table) => table === 'product_storefront_settings')).toHaveLength(1);

    // Should never query brands table separately
    expect(fromCalls.filter((table) => table === 'brands')).toHaveLength(0);
  });

  it('should apply featured and stock filters correctly', async () => {
    await getFeaturedProducts(6);

    // Verify filters are applied in the correct order
    expect(mockSettingsEq).toHaveBeenCalledWith('is_featured', true);

    // Should filter by stock_status = 'in_stock'
    expect(
      mockProductEq.mock.calls.some((call) => call[0] === 'stock_status' && call[1] === 'in_stock')
    )
      .toBe(true);
  });

  it('should respect limit parameter', async () => {
    await getFeaturedProducts(12);

    // Verify range is called with correct offset for limit
    expect(mockRange).toHaveBeenCalledWith(0, 11);
  });
});

describe('getFilteredProducts - Embedded Join Verification', () => {
  let mockFrom: jest.Mock;
  let mockSelect: jest.Mock;
  let queryChain: Record<string, jest.Mock>;

  beforeEach(() => {
    jest.clearAllMocks();

    queryChain = {
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      }),
    };

    mockSelect = jest.fn().mockReturnValue(queryChain);
    mockFrom = jest.fn((table: string) => {
      if (table === 'product_storefront_settings') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [{ product_id: 'prod-1' }],
              error: null,
            }),
          }),
        };
      }

      return { select: mockSelect };
    });

    mockCreateClient.mockResolvedValue({
      from: mockFrom,
    } as never);
  });

  it('should fetch products with embedded brand data in single query', async () => {
    await getFilteredProducts({ featured: true });

    expect(mockSelect.mock.calls[0][0]).toContain('brand:brands(id, name, slug, logo_url)');
    expect(mockSelect.mock.calls[0][0]).toContain(
      'storefront_settings:product_storefront_settings(is_featured, pickup_only)'
    );
    expect(mockSelect.mock.calls[0][1]).toEqual({ count: 'exact' });
  });
});
