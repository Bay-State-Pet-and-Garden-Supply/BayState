/**
 * @jest-environment node
 */
import { getFeaturedProducts, getActiveServices, getBrands, getProducts } from '@/lib/data';
import { createPublicClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
  createPublicClient: jest.fn(),
}));

import type { Product } from '@/lib/types';

const mockCreatePublicClient = createPublicClient as jest.MockedFunction<typeof createPublicClient>;

type QueryError = { message: string };

describe('Data Fetching Functions', () => {
  const mockFrom = jest.fn();
  const mockProductsSelect = jest.fn();
  const mockServicesSelect = jest.fn();
  const mockBrandsSelect = jest.fn();
  const mockStorefrontSettingsSelect = jest.fn();

  const productQuery = {
    eq: jest.fn(),
    in: jest.fn(),
    order: jest.fn(),
    gte: jest.fn(),
    lte: jest.fn(),
    ilike: jest.fn(),
    range: jest.fn(),
  };

  const servicesQuery = {
    eq: jest.fn(),
    order: jest.fn(),
  };

  const brandsQuery = {
    order: jest.fn(),
  };

  const storefrontSettingsQuery = {
    eq: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    productQuery.eq.mockReturnValue(productQuery);
    productQuery.in.mockReturnValue(productQuery);
    productQuery.order.mockReturnValue(productQuery);
    productQuery.gte.mockReturnValue(productQuery);
    productQuery.lte.mockReturnValue(productQuery);
    productQuery.ilike.mockReturnValue(productQuery);
    productQuery.range.mockResolvedValue({ data: [], error: null, count: 0 });

    servicesQuery.eq.mockReturnValue(servicesQuery);
    servicesQuery.order.mockResolvedValue({ data: [], error: null });

    brandsQuery.order.mockResolvedValue({ data: [], error: null });

    storefrontSettingsQuery.eq.mockResolvedValue({
      data: [{ product_id: 'product-1' }],
      error: null,
    });

    mockProductsSelect.mockReturnValue(productQuery);
    mockServicesSelect.mockReturnValue(servicesQuery);
    mockBrandsSelect.mockReturnValue(brandsQuery);
    mockStorefrontSettingsSelect.mockReturnValue(storefrontSettingsQuery);

    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case 'products':
          return { select: mockProductsSelect };
        case 'services':
          return { select: mockServicesSelect };
        case 'brands':
          return { select: mockBrandsSelect };
        case 'product_storefront_settings':
          return { select: mockStorefrontSettingsSelect };
        default:
          throw new Error(`Unexpected table: ${table}`);
      }
    });

    mockCreatePublicClient.mockReturnValue({
      from: mockFrom,
    } as never);
  });

  describe('getFeaturedProducts', () => {
    it('queries products table with storefront settings and stock filters', async () => {
      await getFeaturedProducts();

      expect(mockFrom).toHaveBeenCalledWith('products');
      expect(mockProductsSelect).toHaveBeenCalledWith(
        expect.stringContaining('brand:brands(id, name, slug, logo_url)'),
        { count: 'exact' }
      );
      expect(mockProductsSelect).toHaveBeenCalledWith(
        expect.stringContaining('storefront_settings:product_storefront_settings(is_featured, pickup_only)'),
        { count: 'exact' }
      );
      expect(mockFrom).toHaveBeenCalledWith('product_storefront_settings');
      expect(mockStorefrontSettingsSelect).toHaveBeenCalledWith('product_id');
      expect(storefrontSettingsQuery.eq).toHaveBeenCalledWith('is_featured', true);
      expect(productQuery.in).toHaveBeenCalledWith('id', ['product-1']);
      expect(productQuery.eq).toHaveBeenCalledWith('stock_status', 'in_stock');
    });

    it('returns empty array on error', async () => {
      productQuery.range.mockResolvedValue({
        data: null,
        error: { message: 'Test error' } satisfies QueryError,
        count: 0,
      });

      const result = await getFeaturedProducts();

      expect(result).toEqual([]);
    });

    it('respects limit parameter via pagination', async () => {
      await getFeaturedProducts(3);

      expect(productQuery.range).toHaveBeenCalledWith(0, 2);
    });
  });

  describe('getActiveServices', () => {
    it('queries services table with active filter', async () => {
      await getActiveServices();

      expect(mockFrom).toHaveBeenCalledWith('services');
      expect(mockServicesSelect).toHaveBeenCalledWith('*');
      expect(servicesQuery.eq).toHaveBeenCalledWith('is_active', true);
    });

    it('returns empty array on error', async () => {
      servicesQuery.order.mockResolvedValue({
        data: null,
        error: { message: 'Test error' } satisfies QueryError,
      });

      const result = await getActiveServices();

      expect(result).toEqual([]);
    });
  });

  describe('getBrands', () => {
    it('queries brands table', async () => {
      await getBrands();

      expect(mockFrom).toHaveBeenCalledWith('brands');
      expect(mockBrandsSelect).toHaveBeenCalledWith('*');
    });

    it('returns empty array on error', async () => {
      brandsQuery.order.mockResolvedValue({
        data: null,
        error: { message: 'Test error' } satisfies QueryError,
      });

      const result = await getBrands();

      expect(result).toEqual([]);
    });
  });

  describe('getProducts', () => {
    it('queries products table with optional filters and brand join', async () => {
      await getProducts({ brandId: 'test-id', stockStatus: 'in_stock', limit: 10, offset: 0 });

      expect(mockFrom).toHaveBeenCalledWith('products');
      expect(mockProductsSelect).toHaveBeenCalledWith(expect.any(String), { count: 'exact' });
      expect(productQuery.eq).toHaveBeenCalledWith('brand_id', 'test-id');
      expect(productQuery.eq).toHaveBeenCalledWith('stock_status', 'in_stock');
    });

    it('returns products and count', async () => {
      const mockProducts: Product[] = [{
        id: '1',
        sku: 'SKU-1',
        name: 'Test Product',
        slug: 'test-product',
        description: 'Test',
        long_description: null,
        price: 10,
        images: [],
        stock_status: 'in_stock',
        brand_id: null,
        is_featured: false,
        is_special_order: false,
        pickup_only: false,
        weight: null,
        search_keywords: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
        quantity: 0,
        low_stock_threshold: 5,
        is_taxable: true,
        published_at: null,
        gtin: null,
        availability: null,
        minimum_quantity: 0,
        shopsite_pages: [],
      }];

      productQuery.range.mockResolvedValue({
        data: mockProducts.map((product) => ({
          ...product,
          brand: null,
          storefront_settings: null,
        })),
        error: null,
        count: 1,
      });

      const result = await getProducts();

      expect(result).toHaveProperty('products');
      expect(result).toHaveProperty('count');
      expect(result.products).toHaveLength(1);
      expect(result.count).toBe(1);
    });

    it('applies pagination with range', async () => {
      await getProducts({ limit: 10, offset: 20 });

      expect(productQuery.range).toHaveBeenCalledWith(20, 29);
    });
  });
});
