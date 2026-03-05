/**
 * @jest-environment node
 */
import { getProductBySlug, getFilteredProducts } from '@/lib/products';

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { createClient } from '@/lib/supabase/server';

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('Products Data Functions', () => {
  const mockSingle = jest.fn();
  const mockSelect = jest.fn();
  const mockFrom = jest.fn();
  const mockEq = jest.fn();
  const mockGte = jest.fn();
  const mockLte = jest.fn();
  const mockIlike = jest.fn();
  const mockOrder = jest.fn();
  const mockRange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Chain mock for getProductBySlug
    mockSingle.mockResolvedValue({ data: null, error: null });
    mockEq.mockReturnValue({ single: mockSingle, eq: mockEq, gte: mockGte, lte: mockLte, ilike: mockIlike, order: mockOrder });
    mockGte.mockReturnValue({ lte: mockLte, order: mockOrder });
    mockLte.mockReturnValue({ order: mockOrder });
    mockIlike.mockReturnValue({ order: mockOrder });
    mockOrder.mockReturnValue({ range: mockRange, limit: jest.fn() });
    mockRange.mockResolvedValue({ data: [], error: null, count: 0 });
    mockSelect.mockReturnValue({ eq: mockEq, order: mockOrder });
    mockFrom.mockReturnValue({ select: mockSelect });

    mockCreateClient.mockResolvedValue({
      from: mockFrom,
    } as never);
  });

  describe('getProductBySlug', () => {
    it('queries products table with slug filter and brand join', async () => {
      await getProductBySlug('test-product');

      expect(mockFrom).toHaveBeenCalledWith('products');
      expect(mockSelect).toHaveBeenCalledWith('*, brand:brands(id, name, slug, logo_url)');
      expect(mockEq).toHaveBeenCalledWith('slug', 'test-product');
    });

    it('returns null on error', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const result = await getProductBySlug('nonexistent');

      expect(result).toBeNull();
    });

    it('returns transformed product when found', async () => {
      const mockProduct = {
        id: 'sku-123',
        name: 'Test Product',
        slug: 'test-product',
        description: 'A test product',
        price: 19.99,
        images: [],
        stock_status: 'in_stock',
        brand_id: null,
        is_featured: false,
        created_at: '2024-01-01',
      };
      mockSingle.mockResolvedValue({ data: mockProduct, error: null });

      const result = await getProductBySlug('test-product');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('sku-123');
      expect(result?.name).toBe('Test Product');
    });
  });

  describe('getFilteredProducts', () => {
    it('queries products table with filters and brand join', async () => {
      await getFilteredProducts({
        stockStatus: 'in_stock',
        minPrice: 10,
        maxPrice: 100,
      });

      expect(mockFrom).toHaveBeenCalledWith('products');
    });

    it('returns empty array on error', async () => {
      mockRange.mockResolvedValue({ data: null, error: { message: 'Error' }, count: 0 });

      const result = await getFilteredProducts();

      expect(result.products).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('applies pagination', async () => {
      await getFilteredProducts({ limit: 10, offset: 20 });

      expect(mockRange).toHaveBeenCalledWith(20, 29);
    });
  });
});
