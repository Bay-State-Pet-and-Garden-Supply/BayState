import { createClient } from '@/lib/supabase/server';
import { type Product } from '@/lib/types';

/**
 * Transforms a row from products table to Product interface.
 * The query includes brand data directly, eliminating N+1 queries.
 */
interface ProductRow {
  id: string;
  brand_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  sale_price: number | null;
  stock_status: string;
  images: unknown;
  is_featured: boolean;
  is_special_order: boolean;
  weight: number | null;
  search_keywords: string | null;
  category_id: string | null;
  created_at: string;
  compare_at_price: number | null;
  cost_price: number | null;
  quantity: number | null;
  low_stock_threshold: number | null;
  is_taxable: boolean | null;
  tax_code: string | null;
  barcode: string | null;
  meta_title: string | null;
  meta_description: string | null;
  dimensions: Record<string, unknown> | null;
  origin_country: string | null;
  vendor: string | null;
  published_at: string | null;
  avg_rating: number | null;
  review_count: number | null;
  brand: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  } | null;
}

function transformProductRow(row: ProductRow): Product {
  const product: Product = {
    id: row.id,
    brand_id: row.brand_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: Number(row.price),
    sale_price: row.sale_price ? Number(row.sale_price) : null,
    stock_status: (row.stock_status as Product['stock_status']) || 'in_stock',
    images: parseImages(row.images),
    is_featured: Boolean(row.is_featured),
    is_special_order: Boolean(row.is_special_order),
    weight: row.weight ? Number(row.weight) : null,
    search_keywords: row.search_keywords,
    category_id: row.category_id,
    created_at: row.created_at,
    compare_at_price: row.compare_at_price ? Number(row.compare_at_price) : null,
    cost_price: row.cost_price ? Number(row.cost_price) : null,
    quantity: row.quantity ?? 0,
    low_stock_threshold: row.low_stock_threshold ?? 5,
    is_taxable: row.is_taxable ?? true,
    tax_code: row.tax_code,
    barcode: row.barcode,
    meta_title: row.meta_title,
    meta_description: row.meta_description,
    dimensions: row.dimensions as Product['dimensions'],
    origin_country: row.origin_country,
    vendor: row.vendor,
    published_at: row.published_at,
    avg_rating: row.avg_rating ? Number(row.avg_rating) : null,
    review_count: row.review_count ?? 0,
  };

  // Brand data is included via join
  if (row.brand) {
    product.brand = {
      id: row.brand.id,
      name: row.brand.name,
      slug: row.brand.slug,
      logo_url: row.brand.logo_url,
    };
  }

  return product;
}

/**
 * Parse images from various formats (JSONB array, string array, etc.)
 */
function parseImages(images: unknown): string[] {
  if (!images) return [];
  if (Array.isArray(images)) {
    return images.filter((img): img is string => typeof img === 'string');
  }
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      if (Array.isArray(parsed)) {
        return parsed.filter((img): img is string => typeof img === 'string');
      }
    } catch {
      // Not valid JSON, treat as single image URL
      return images.trim() ? [images] : [];
    }
  }
  return [];
}

/**
 * Fetches a single product by slug.
 * Uses products table which includes brand data.
 */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .select('*, brand:brands(id, name, slug, logo_url)')
    .eq('slug', slug)
    .single();

  if (error || !data) {
    console.error('Error fetching product by slug:', error);
    return null;
  }

  return transformProductRow(data);
}

/**
 * Fetches a single product by SKU/ID.
 * Uses products table.
 */
export async function getProductById(id: string): Promise<Product | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .select('*, brand:brands(id, name, slug, logo_url)')
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('Error fetching product by id:', error);
    return null;
  }

  return transformProductRow(data);
}

/**
 * Fetches products with optional filtering and pagination.
 * Uses products table which includes brand data.
 */
export async function getFilteredProducts(options?: {
  brandSlug?: string;
  brandId?: string;
  categoryId?: string;
  categorySlug?: string;
  petTypeId?: string;
  stockStatus?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  featured?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ products: Product[]; count: number }> {
  const supabase = await createClient();
  let query = supabase
    .from('products')
    .select('*, brand:brands(id, name, slug, logo_url)', { count: 'exact' });

  // Filter by category slug - resolve to ID first
  if (options?.categorySlug) {
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', options.categorySlug)
      .single();

    if (category) {
      query = query.eq('category_id', category.id);
    } else {
      return { products: [], count: 0 };
    }
  }
  // Filter by category ID
  if (options?.categoryId) {
    query = query.eq('category_id', options.categoryId);
  }
  // Filter by brand slug - resolve to ID first for performance/simplicity
  if (options?.brandSlug) {
    const { data: brand } = await supabase
      .from('brands')
      .select('id')
      .eq('slug', options.brandSlug)
      .single();

    if (brand) {
      query = query.eq('brand_id', brand.id);
    } else {
      return { products: [], count: 0 };
    }
  }
  // Filter by brand ID
  if (options?.brandId) {
    query = query.eq('brand_id', options.brandId);
  }
  // Filter by pet type - join with product_pet_types table
  if (options?.petTypeId) {
    const { data: productIds } = await supabase
      .from('product_pet_types')
      .select('product_id')
      .eq('pet_type_id', options.petTypeId);

    if (productIds && productIds.length > 0) {
      const ids = productIds.map((p) => p.product_id);
      query = query.in('id', ids);
    } else {
      return { products: [], count: 0 };
    }
  }
  // Filter by stock status
  if (options?.stockStatus) {
    query = query.eq('stock_status', options.stockStatus);
  }
  // Filter by price range
  if (options?.minPrice !== undefined) {
    query = query.gte('price', options.minPrice);
  }
  if (options?.maxPrice !== undefined) {
    query = query.lte('price', options.maxPrice);
  }
  // Search by name
  if (options?.search) {
    query = query.ilike('name', `%${options.search}%`);
  }
  // Filter featured only
  if (options?.featured) {
    query = query.eq('is_featured', true);
  }

  query = query.order('created_at', { ascending: false });

  const limit = options?.limit || 12;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching products:', error);
    return { products: [], count: 0 };
  }

  return {
    products: (data || []).map(transformProductRow),
    count: count || 0,
  };
}

/**
 * Fetches featured products for the homepage.
 * Uses products table.
 */
export async function getFeaturedProducts(limit = 6): Promise<Product[]> {
  const { products } = await getFilteredProducts({
    featured: true,
    stockStatus: 'in_stock',
    limit,
  });
  return products;
}

/**
 * Fetches all products (for sitemaps, etc.)
 * Uses products table with embedded brand join.
 */
export async function getAllProducts(): Promise<Product[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .select('*, brand:brands(id, name, slug, logo_url)')
    .order('name');

  if (error) {
    console.error('Error fetching all products:', error);
    return [];
  }

  return (data || []).map(transformProductRow);
}

/**
 * Fetches products by brand.
 */
export async function getProductsByBrand(brandSlug: string): Promise<Product[]> {
  const { products } = await getFilteredProducts({ brandSlug });
  return products;
}

/**
 * Search products by name.
 */
export async function searchProducts(
  query: string,
  limit = 10
): Promise<Product[]> {
  const { products } = await getFilteredProducts({ search: query, limit });
  return products;
}
