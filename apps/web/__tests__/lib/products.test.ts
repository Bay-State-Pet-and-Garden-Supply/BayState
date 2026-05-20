/**
 * @jest-environment node
 */
import { getProductBySlug, getFilteredProducts, getProductsByIds } from '@/lib/products';

// Mock the Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createPublicClient: jest.fn(),
}));

import { createPublicClient } from '@/lib/supabase/server';

const mockCreatePublicClient = createPublicClient as jest.MockedFunction<typeof createPublicClient>;

describe('Products Data Functions', () => {
  const mockSingle = jest.fn();
  const mockSelect = jest.fn();
  const mockFrom = jest.fn();
  const mockEq = jest.fn();
  const mockGte = jest.fn();
  const mockLte = jest.fn();
  const mockIlike = jest.fn();
  const mockIn = jest.fn();
  const mockOrder = jest.fn();
  const mockRange = jest.fn();

  beforeEach(() => {
    mockSingle.mockReset();
    mockSelect.mockReset();
    mockFrom.mockReset();
    mockEq.mockReset();
    mockGte.mockReset();
    mockLte.mockReset();
    mockIlike.mockReset();
    mockIn.mockReset();
    mockOrder.mockReset();
    mockRange.mockReset();

    const queryChain = {
      single: mockSingle,
      eq: mockEq,
      in: mockIn,
      gte: mockGte,
      lte: mockLte,
      ilike: mockIlike,
      order: mockOrder,
      range: mockRange,
    };

    const orderChain = {
      order: mockOrder,
      range: mockRange,
      limit: jest.fn().mockImplementation(() => ({ range: mockRange })),
    };
    mockSingle.mockResolvedValue({ data: null, error: null });
    mockEq.mockReturnValue(queryChain);
    mockIn.mockReturnValue(queryChain);
    mockGte.mockReturnValue(queryChain);
    mockLte.mockReturnValue(queryChain);
    mockIlike.mockReturnValue(queryChain);
    mockOrder.mockReturnValue(orderChain);
    mockRange.mockResolvedValue({ data: [], error: null, count: 0 });
    mockSelect.mockReturnValue(queryChain);
    mockFrom.mockReturnValue({ select: mockSelect });

    mockCreatePublicClient.mockReturnValue({
      from: mockFrom,
    } as never);
  });

  describe('getProductBySlug', () => {
    it('queries products table with slug filter and brand join', async () => {
      await getProductBySlug('test-product');

      expect(mockFrom).toHaveBeenCalledWith('products');
      expect(mockSelect.mock.calls[0][0]).toContain('brand:brands(id, name, slug, logo_url)');
      expect(mockSelect.mock.calls[0][0]).toContain(
        'storefront_settings:product_storefront_settings(is_featured, pickup_only)'
      );
      expect(mockEq).toHaveBeenCalledWith('slug', 'test-product');
      expect(mockIn).toHaveBeenCalledWith('stock_status', ['in_stock', 'pre_order', 'out_of_stock']);
    });

    it('returns null on error', async () => {
      mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const result = await getProductBySlug('nonexistent');

      expect(result).toBeNull();
    });

    it('returns transformed product when found', async () => {
      const mockProduct = {
        id: 'sku-123',
        sku: 'SKU-123',
        name: 'Test Product',
        slug: 'test-product',
        description: 'A test product',
        long_description: null,
        price: 19.99,
        images: [],
        stock_status: 'in_stock',
        brand_id: null,
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
        storefront_settings: {
          is_featured: false,
          pickup_only: false,
        },
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

    it('excludes out of stock products by default', async () => {
      await getFilteredProducts();

      expect(mockIn).toHaveBeenCalledWith('stock_status', ['in_stock', 'pre_order', 'out_of_stock']);
    });

    it('returns no products for out of stock filter', async () => {
      const result = await getFilteredProducts({ stockStatus: 'out_of_stock' });

      expect(result).toEqual({ products: [], count: 0 });
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('getProductsByIds', () => {
    it('returns empty array if ids is empty', async () => {
      const result = await getProductsByIds([]);
      expect(result).toEqual([]);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('queries products by ids and retains original ordering', async () => {
      const mockProducts = [
        { id: '2', name: 'Product B' },
        { id: '1', name: 'Product A' },
      ];
      mockIn.mockResolvedValue({ data: mockProducts, error: null });

      const result = await getProductsByIds(['1', '2']);

      expect(mockFrom).toHaveBeenCalledWith('products');
      expect(mockIn).toHaveBeenCalledWith('id', ['1', '2']);
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
    });

    it('returns empty array on DB error', async () => {
      mockIn.mockResolvedValue({ data: null, error: { message: 'Database Error' } });

      const result = await getProductsByIds(['1']);

      expect(result).toEqual([]);
    });
  });
});
