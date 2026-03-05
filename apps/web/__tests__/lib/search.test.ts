import { createSearchIndex, fuzzySearch } from '@/lib/search';
import { type Product, type Service, type Brand } from '@/lib/data';

const mockProducts: Product[] = [
  {
    id: '1',
    brand_id: '1',
    name: 'Premium Dog Food',
    slug: 'premium-dog-food',
    description: 'High-quality nutrition for dogs',
    price: 49.99,
    sale_price: null,
    stock_status: 'in_stock',
    images: ['https://example.com/dog-food.jpg'],
    is_featured: true,
    is_special_order: false,
    weight: null,
    search_keywords: null,
    category_id: null,
    created_at: '2024-01-01',
    compare_at_price: null,
    cost_price: null,
    quantity: 100,
    low_stock_threshold: 10,
    is_taxable: true,
    tax_code: null,
    barcode: null,
    meta_title: null,
    meta_description: null,
    dimensions: null,
    origin_country: null,
    vendor: null,
    published_at: '2024-01-01',
    avg_rating: 5,
    review_count: 20,
    brand: { id: '1', name: 'Purina', slug: 'purina', logo_url: null, created_at: '2024-01-01' },
  },
  {
    id: '2',
    brand_id: '2',
    name: 'Garden Shovel',
    slug: 'garden-shovel',
    description: 'Durable steel shovel',
    price: 29.99,
    sale_price: null,
    stock_status: 'in_stock',
    images: [],
    is_featured: false,
    is_special_order: false,
    weight: null,
    search_keywords: null,
    category_id: null,
    created_at: '2024-01-01',
    compare_at_price: null,
    cost_price: null,
    quantity: 50,
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
  },
];

const mockServices: Service[] = [
  {
    id: '1',
    name: 'Propane Refill',
    slug: 'propane-refill',
    description: 'Quick propane tank refills',
    price: 19.99,
    unit: 'tank',
    is_active: true,
    created_at: '2024-01-01',
  },
];

const mockBrands: Brand[] = [
  { id: '1', name: 'Purina', slug: 'purina', logo_url: null, created_at: '2024-01-01' },
  { id: '2', name: 'Scotts', slug: 'scotts', logo_url: null, created_at: '2024-01-01' },
];

describe('Search Functions', () => {
  describe('createSearchIndex', () => {
    it('creates an index from products, services, and brands', () => {
      const index = createSearchIndex(mockProducts, mockServices, mockBrands);
      expect(index).toBeDefined();
    });
  });

  describe('fuzzySearch', () => {
    it('returns empty array for short queries', () => {
      const index = createSearchIndex(mockProducts, mockServices, mockBrands);
      const results = fuzzySearch(index, 'a');
      expect(results).toEqual([]);
    });

    it('finds products by name', () => {
      const index = createSearchIndex(mockProducts, mockServices, mockBrands);
      const results = fuzzySearch(index, 'dog food');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Premium Dog Food');
      expect(results[0].type).toBe('product');
    });

    it('finds services by name', () => {
      const index = createSearchIndex(mockProducts, mockServices, mockBrands);
      const results = fuzzySearch(index, 'propane');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Propane Refill');
      expect(results[0].type).toBe('service');
    });

    it('finds brands by name', () => {
      const index = createSearchIndex(mockProducts, mockServices, mockBrands);
      const results = fuzzySearch(index, 'purina');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.type === 'brand' && r.name === 'Purina')).toBe(true);
    });

    it('handles typos with fuzzy matching', () => {
      const index = createSearchIndex(mockProducts, mockServices, mockBrands);
      const results = fuzzySearch(index, 'shovl'); // typo for shovel
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('Garden Shovel');
    });

    it('respects limit parameter', () => {
      const index = createSearchIndex(mockProducts, mockServices, mockBrands);
      const results = fuzzySearch(index, 'a', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });
});
