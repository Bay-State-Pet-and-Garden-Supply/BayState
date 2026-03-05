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
  let mockSelect: jest.Mock;
  let mockEq: jest.Mock;
  let mockOrder: jest.Mock;
  let mockRange: jest.Mock;
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
        data: [
          {
            id: 'prod-1',
            name: 'Featured Product 1',
            slug: 'featured-product-1',
            description: 'A featured product',
            price: 29.99,
            sale_price: null,
            stock_status: 'in_stock',
            images: ['/img1.jpg'],
            is_featured: true,
            is_special_order: false,
            weight: null,
            search_keywords: null,
            category_id: null,
            created_at: '2024-01-01',
            brand_id: 'brand-1',
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

    mockEq = queryChain.eq as jest.Mock;
    mockOrder = queryChain.order as jest.Mock;
    mockRange = queryChain.range as jest.Mock;

    mockSelect = jest.fn().mockReturnValue(queryChain);
    mockFrom = jest.fn().mockReturnValue({ select: mockSelect });

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

    // Verify the select includes brand join with count option
    expect(mockSelect).toHaveBeenCalledWith(
      '*, brand:brands(id, name, slug, logo_url)',
      { count: 'exact' }
    );
  });

  it('should not make separate brand queries for featured products', async () => {
    await getFeaturedProducts();

    // Get all calls to from()
    const fromCalls = mockFrom.mock.calls.map((call) => call[0]);

    // Should only query products table once
    expect(fromCalls.filter((table) => table === 'products')).toHaveLength(1);

    // Should never query brands table separately
    expect(fromCalls.filter((table) => table === 'brands')).toHaveLength(0);
  });

  it('should apply featured and stock filters correctly', async () => {
    await getFeaturedProducts(6);

    // Verify filters are applied in the correct order
    const eqCalls = mockEq.mock.calls;

    // Should filter by is_featured = true
    expect(eqCalls.some((call) => call[0] === 'is_featured' && call[1] === true))
      .toBe(true);

    // Should filter by stock_status = 'in_stock'
    expect(eqCalls.some((call) => call[0] === 'stock_status' && call[1] === 'in_stock'))
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
  let mockEq: jest.Mock;
  let queryChain: Record<string, jest.Mock>;

  beforeEach(() => {
    jest.clearAllMocks();

    queryChain = {
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      }),
    };

    mockEq = queryChain.eq as jest.Mock;

    mockSelect = jest.fn().mockReturnValue(queryChain);
    mockFrom = jest.fn().mockReturnValue({ select: mockSelect });

    mockCreateClient.mockResolvedValue({
      from: mockFrom,
    } as never);
  });

  it('should fetch products with embedded brand data in single query', async () => {
    await getFilteredProducts({ featured: true });

    // The select should include brand:brands() for embedded join with count
    expect(mockSelect).toHaveBeenCalledWith(
      '*, brand:brands(id, name, slug, logo_url)',
      { count: 'exact' }
    );
  });
});
