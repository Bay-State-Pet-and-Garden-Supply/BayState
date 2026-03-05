import { createClient } from '@/lib/supabase/server';
import type { Product, ProductGroup, ProductGroupMember } from '@/lib/types';

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

  // PGRST116 means "result contains 0 rows" - product doesn't exist
  if (error || !data) {
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching product by slug:', error);
    }
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

  // PGRST116 means "result contains 0 rows" - product doesn't exist
  if (error || !data) {
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching product by id:', error);
    }
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

// ============================================================================
// Product Group Functions (Amazon-style size grouping)
// ============================================================================

/**
 * Fetch a product group by slug with all member products.
 * Returns null if group doesn't exist or is inactive.
 * Uses query-based approach instead of database function.
 */
export async function getProductGroupBySlug(
  slug: string
): Promise<{
  group: ProductGroup | null;
  members: Array<{ member: ProductGroupMember; product: Product }>;
  defaultMember: ProductGroupMember | null;
}> {
  const supabase = await createClient();

  // First, fetch the group
  const { data: groupData, error: groupError } = await supabase
    .from('product_groups')
    .select('*')
    .eq('slug', slug)
    .is('is_active', true)
    .single();

  // PGRST116 means "result contains 0 rows" - group doesn't exist
  if (groupError || !groupData) {
    if (groupError && groupError.code !== 'PGRST116') {
      console.error('Error fetching product group by slug:', groupError);
    }
    return { group: null, members: [], defaultMember: null };
  }

  const group = groupData as ProductGroup;

  // Then, fetch the members with product data
  const { data: membersData, error: membersError } = await supabase
    .from('product_group_products')
    .select(`
      *,
      product:products(
        id, name, slug, price, stock_status, images,
        brand_id, description, is_featured
      )
    `)
    .eq('group_id', group.id)
    .order('sort_order', { ascending: true });

  if (membersError) {
    console.error('Error fetching group members:', membersError);
    return { group, members: [], defaultMember: null };
  }

  // Build members array
  const members: Array<{ member: ProductGroupMember; product: Product }> = [];
  let defaultMember: ProductGroupMember | null = null;

  for (const row of membersData || []) {
    const product = row.product as Record<string, unknown> | undefined;
    if (!product) continue;

    const member: ProductGroupMember = {
      group_id: row.group_id,
      product_id: row.product_id,
      sort_order: Number(row.sort_order),
      is_default: Boolean(row.is_default),
      display_label: row.display_label as string | null,
      metadata: row.metadata as Record<string, unknown> | null,
      created_at: row.created_at,
    };

    const productData: Product = {
      id: product.id as string,
      brand_id: product.brand_id as string | null,
      name: product.name as string,
      slug: product.slug as string,
      description: product.description as string | null,
      price: Number(product.price),
      sale_price: null,
      stock_status: (product.stock_status as Product['stock_status']) || 'in_stock',
      images: parseImages(product.images),
      is_featured: Boolean(product.is_featured),
      is_special_order: false,
      weight: null,
      search_keywords: null,
      category_id: null,
      created_at: '',
      compare_at_price: null,
      cost_price: null,
      quantity: 0,
      low_stock_threshold: 5,
      is_taxable: true,
      tax_code: null,
      barcode: null,
      meta_title: null,
      meta_description: null,
      dimensions: null,
      origin_country: null,
      vendor: null,
      published_at: null,
      avg_rating: null,
      review_count: 0,
    };

    members.push({ member, product: productData });

    if (member.is_default) {
      defaultMember = member;
    }
  }

  return { group, members, defaultMember };
}

/**
 * Fetch a product group by ID.
 */
export async function getProductGroupById(
  id: string
): Promise<ProductGroup | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('product_groups')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('Error fetching product group by id:', error);
    return null;
  }

  return data as ProductGroup;
}

/**
 * Get all products in a group (lightweight version without full product data).
 */
export async function getGroupProductIds(
  groupId: string
): Promise<Array<{ productId: string; sortOrder: number; isDefault: boolean; displayLabel: string | null }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('product_group_products')
    .select('product_id, sort_order, is_default, display_label')
    .eq('group_id', groupId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching group product IDs:', error);
    return [];
  }

  return (data || []).map((row) => ({
    productId: row.product_id,
    sortOrder: row.sort_order,
    isDefault: row.is_default,
    displayLabel: row.display_label,
  }));
}

/**
 * Create a new product group.
 */
export async function createProductGroup(options: {
  slug: string;
  name: string;
  description?: string;
  heroImageUrl?: string;
  brandId?: string;
}): Promise<ProductGroup | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('product_groups')
    .insert({
      slug: options.slug,
      name: options.name,
      description: options.description,
      hero_image_url: options.heroImageUrl,
      brand_id: options.brandId,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating product group:', error);
    return null;
  }

  return data as ProductGroup;
}

/**
 * Update a product group.
 */
export async function updateProductGroup(
  id: string,
  updates: Partial<Pick<ProductGroup, 'name' | 'slug' | 'description' | 'hero_image_url' | 'default_product_id' | 'brand_id' | 'is_active'>>
): Promise<ProductGroup | null> {
  const supabase = await createClient();

  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.slug !== undefined) updateData.slug = updates.slug;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.hero_image_url !== undefined) updateData.hero_image_url = updates.hero_image_url;
  if (updates.default_product_id !== undefined) updateData.default_product_id = updates.default_product_id;
  if (updates.brand_id !== undefined) updateData.brand_id = updates.brand_id;
  if (updates.is_active !== undefined) updateData.is_active = updates.is_active;

  const { data, error } = await supabase
    .from('product_groups')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating product group:', error);
    return null;
  }

  return data as ProductGroup;
}

/**
 * Delete a product group (and cascade to junction table).
 */
export async function deleteProductGroup(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from('product_groups').delete().eq('id', id);

  if (error) {
    console.error('Error deleting product group:', error);
    return false;
  }

  return true;
}

/**
 * Add a product to a group.
 */
export async function addProductToGroup(
  groupId: string,
  productId: string,
  options?: {
    sortOrder?: number;
    isDefault?: boolean;
    displayLabel?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<boolean> {
  const supabase = await createClient();

  // Get current max sort_order if not provided
  let sortOrder = options?.sortOrder;
  if (sortOrder === undefined) {
    const { data } = await supabase
      .from('product_group_products')
      .select('sort_order')
      .eq('group_id', groupId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();
    sortOrder = (data?.sort_order ?? 0) + 1;
  }

  const { error } = await supabase.from('product_group_products').insert({
    group_id: groupId,
    product_id: productId,
    sort_order: sortOrder,
    is_default: options?.isDefault ?? false,
    display_label: options?.displayLabel,
    metadata: options?.metadata,
  });

  if (error) {
    console.error('Error adding product to group:', error);
    return false;
  }

  return true;
}

/**
 * Remove a product from a group.
 */
export async function removeProductFromGroup(
  groupId: string,
  productId: string
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('product_group_products')
    .delete()
    .eq('group_id', groupId)
    .eq('product_id', productId);

  if (error) {
    console.error('Error removing product from group:', error);
    return false;
  }

  return true;
}

/**
 * Update a product's position in a group.
 */
export async function updateProductGroupPosition(
  groupId: string,
  productId: string,
  sortOrder: number
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('product_group_products')
    .update({ sort_order: sortOrder })
    .eq('group_id', groupId)
    .eq('product_id', productId);

  if (error) {
    console.error('Error updating product group position:', error);
    return false;
  }

  return true;
}

/**
 * Set a product as the default for a group.
 * Clears default flag from other products in the group.
 */
export async function setGroupDefaultProduct(
  groupId: string,
  productId: string
): Promise<boolean> {
  const supabase = await createClient();

  // First clear all defaults in the group
  await supabase
    .from('product_group_products')
    .update({ is_default: false })
    .eq('group_id', groupId);

  // Then set the new default
  const { error } = await supabase
    .from('product_group_products')
    .update({ is_default: true })
    .eq('group_id', groupId)
    .eq('product_id', productId);

  if (error) {
    console.error('Error setting group default product:', error);
    return false;
  }

  // Also update the group's default_product_id
  await supabase
    .from('product_groups')
    .update({ default_product_id: productId })
    .eq('id', groupId);

  return true;
}

/**
 * Get all product groups (for admin).
 */
export async function getAllProductGroups(): Promise<ProductGroup[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('product_groups')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching all product groups:', error);
    return [];
  }

  return (data || []) as ProductGroup[];
}

/**
 * Check if a product belongs to any groups.
 */
export async function getProductGroups(
  productId: string
): Promise<Array<{ groupId: string; groupName: string; groupSlug: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('product_group_products')
    .select('group_id, product_groups!inner(name, slug)')
    .eq('product_id', productId);

  if (error) {
    console.error('Error fetching product groups:', error);
    return [];
  }

  return (data || []).map((row) => {
    const pg = row.product_groups as { name?: string; slug?: string } | undefined;
    return {
      groupId: row.group_id,
      groupName: pg?.name || '',
      groupSlug: pg?.slug || '',
    };
  });
}
