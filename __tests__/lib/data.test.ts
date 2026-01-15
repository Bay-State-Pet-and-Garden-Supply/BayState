/**
 * @jest-environment node
 */
import { getFeaturedProducts, getActiveServices, getBrands, getProducts } from '@/lib/data';

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { createClient } from '@/lib/supabase/server';

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe('Data Fetching Functions', () => {
  const mockSelect = jest.fn();
  const mockFrom = jest.fn();
  const mockEq = jest.fn();
  const mockOrder = jest.fn();
  const mockLimit = jest.fn();
  const mockRange = jest.fn();
  const mockIn = jest.fn();
  const mockGte = jest.fn();
  const mockLte = jest.fn();
  const mockIlike = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Chain mock - ensure range returns a promise with data
    mockRange.mockResolvedValue({ data: [], error: null, count: 0 });
    mockLimit.mockResolvedValue({ data: [], error: null });
    mockIn.mockResolvedValue({ data: [], error: null });
    mockGte.mockReturnValue({ lte: mockLte, order: mockOrder });
    mockLte.mockReturnValue({ order: mockOrder });
    mockIlike.mockReturnValue({ order: mockOrder });
    mockOrder.mockReturnValue({ limit: mockLimit, range: mockRange });
    mockEq.mockReturnValue({
      eq: mockEq,
      order: mockOrder,
      gte: mockGte,
      lte: mockLte,
      ilike: mockIlike,
    });
    mockSelect.mockReturnValue({
      eq: mockEq,
      order: mockOrder,
      in: mockIn,
      gte: mockGte,
      lte: mockLte,
      ilike: mockIlike,
    });
    mockFrom.mockReturnValue({ select: mockSelect });

    mockCreateClient.mockResolvedValue({
      from: mockFrom,
    } as never);
  });

  describe('getFeaturedProducts', () => {
    it('queries products table with featured and stock filters using embedded join', async () => {
      // getFeaturedProducts now delegates to getFilteredProducts which uses range()
      await getFeaturedProducts();

      expect(mockFrom).toHaveBeenCalledWith('products');
      expect(mockSelect).toHaveBeenCalledWith('*, brand:brands(id, name, slug, logo_url)', { count: 'exact' });
      expect(mockEq).toHaveBeenCalledWith('is_featured', true);
      expect(mockEq).toHaveBeenCalledWith('stock_status', 'in_stock');
    });

    it('returns empty array on error', async () => {
      mockRange.mockResolvedValue({ data: null, error: { message: 'Test error' }, count: 0 });

      const result = await getFeaturedProducts();

      expect(result).toEqual([]);
    });

    it('respects limit parameter via pagination', async () => {
      await getFeaturedProducts(3);

      // getFilteredProducts uses range(offset, offset + limit - 1)
      // With offset=0 and limit=3, it should call range(0, 2)
      expect(mockRange).toHaveBeenCalledWith(0, 2);
    });
  });

  describe('getActiveServices', () => {
    it('queries services table with active filter', async () => {
      mockOrder.mockResolvedValue({ data: [], error: null });

      await getActiveServices();

      expect(mockFrom).toHaveBeenCalledWith('services');
      expect(mockEq).toHaveBeenCalledWith('is_active', true);
    });

    it('returns empty array on error', async () => {
      mockOrder.mockResolvedValue({ data: null, error: { message: 'Test error' } });

      const result = await getActiveServices();

      expect(result).toEqual([]);
    });
  });

  describe('getBrands', () => {
    it('queries brands table', async () => {
      mockOrder.mockResolvedValue({ data: [], error: null });

      await getBrands();

      expect(mockFrom).toHaveBeenCalledWith('brands');
    });

    it('returns empty array on error', async () => {
      mockOrder.mockResolvedValue({ data: null, error: { message: 'Test error' } });

      const result = await getBrands();

      expect(result).toEqual([]);
    });
  });

  describe('getProducts', () => {
    it('queries products table with optional filters and brand join', async () => {
      await getProducts({ brandId: 'test-id', stockStatus: 'in_stock', limit: 10, offset: 0 });

      expect(mockFrom).toHaveBeenCalledWith('products');
      expect(mockEq).toHaveBeenCalledWith('brand_id', 'test-id');
      expect(mockEq).toHaveBeenCalledWith('stock_status', 'in_stock');
    });

    it('returns products and count', async () => {
      const mockProducts = [{
        id: '1',
        name: 'Test Product',
        slug: 'test-product',
        description: 'Test',
        price: 10,
        images: [],
        stock_status: 'in_stock',
        brand_id: null,
        is_featured: false,
        created_at: '2024-01-01',
      }];
      mockRange.mockResolvedValue({ data: mockProducts, error: null, count: 1 });

      const result = await getProducts();

      expect(result).toHaveProperty('products');
      expect(result).toHaveProperty('count');
      expect(result.products).toHaveLength(1);
      expect(result.count).toBe(1);
    });

    it('applies pagination with range', async () => {
      await getProducts({ limit: 10, offset: 20 });

      // range(offset, offset + limit - 1)
      expect(mockRange).toHaveBeenCalledWith(20, 29);
    });
  });
});
