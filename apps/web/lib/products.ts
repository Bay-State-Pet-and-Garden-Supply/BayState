import { createClient, createPublicClient } from '@/lib/supabase/server';
import {
  normalizeProductStorefrontSettings,
  type ProductStorefrontSettingsRelation,
} from '@/lib/product-storefront-settings';
import type { Product, ProductGroup, ProductGroupMember } from '@/lib/types';
import { buildTaxonomyNodes, type TaxonomyCategoryRecord } from '@/lib/taxonomy';
import type { FacetDefinition } from '@/lib/facets';

type ProductReadClient = Awaited<ReturnType<typeof createPublicClient>>;

const STOREFRONT_VISIBLE_STOCK_STATUSES = [
  'in_stock',
  'pre_order',
] satisfies Product['stock_status'][];

type StorefrontVisibleStockStatus = (typeof STOREFRONT_VISIBLE_STOCK_STATUSES)[number];

export interface ProductFilterOptions {
  brands: Array<{ id: string; name: string; slug: string; logo_url: string | null }>;
  petTypes: Array<{ id: string; name: string }>;
  categories: Array<{
    id: string;
    name: string;
    slug: string;
    parent_id: string | null;
    depth: number;
    breadcrumb: string;
    ancestor_slugs: string[];
    ancestor_names: string[];
    is_leaf: boolean;
  }>;
  stockStatuses: Array<{ id: StorefrontVisibleStockStatus; label: string }>;
  dynamicFacets: FacetDefinition[];
}

type ProductFilterQueryOptions = {
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
  facets?: string;
};

function isStorefrontVisibleStockStatus(
  stockStatus: string | undefined
): stockStatus is StorefrontVisibleStockStatus {
  return stockStatus === 'in_stock' || stockStatus === 'pre_order';
}

const PRODUCT_SELECT = `
  id,
  sku,
  brand_id,
  name,
  slug,
  description,
  long_description,
  price,
  stock_status,
  images,
  is_special_order,
  is_taxable,
  weight,
  search_keywords,
  shopsite_pages,
  published_at,
  gtin,
  availability,
  minimum_quantity,
  quantity,
  low_stock_threshold,
  created_at,
  updated_at,
  brand:brands(id, name, slug, logo_url),
  product_categories(
    category:categories(id, name, slug, parent_id, description, image_url, created_at)
  ),
  storefront_settings:product_storefront_settings(is_featured, pickup_only)
`;

/**
 * Transforms a row from products table to Product interface.
 * The query includes brand data directly, eliminating N+1 queries.
 */
interface ProductRow {
  id: string;
  sku?: string | null;
  brand_id?: string | null;
  name: string;
  slug?: string;
  description?: string | null;
  long_description?: string | null;
  price: number;
  stock_status?: string;
  images?: unknown;
  is_special_order?: boolean | null;
  is_taxable?: boolean | null;
  weight?: number | null;
  search_keywords?: string | null;
  shopsite_pages?: unknown;
  published_at?: string | null;
  gtin?: string | null;
  availability?: string | null;
  minimum_quantity?: number | null;
  quantity?: number | null;
  low_stock_threshold?: number | null;
  created_at?: string;
  updated_at?: string;
  brand?:
    | {
        id: string;
        name: string;
        slug: string;
        logo_url: string | null;
      }
    | Array<{
        id: string;
        name: string;
        slug: string;
        logo_url: string | null;
      }>
    | null;
  product_categories?: Array<{
    category?: Array<{
      id: string;
      name: string;
      slug: string;
      parent_id: string | null;
      description: string | null;
      image_url: string | null;
      created_at: string;
    }> | null;
  }> | null;
  storefront_settings?: ProductStorefrontSettingsRelation;
}

interface FacetDefinitionLookup {
  slug: string | null;
}

interface FacetValueLookup {
  id: string;
  slug: string | null;
  facet_definitions: FacetDefinitionLookup | FacetDefinitionLookup[] | null;
}

function getFacetDefinitionSlug(
  facetDefinitions: FacetValueLookup['facet_definitions']
): string | null {
  if (Array.isArray(facetDefinitions)) {
    return facetDefinitions[0]?.slug ?? null;
  }

  return facetDefinitions?.slug ?? null;
}

function transformProductRow(row: ProductRow): Product {
  const storefrontSettings = normalizeProductStorefrontSettings(row.storefront_settings);
  const brand = Array.isArray(row.brand) ? row.brand[0] ?? null : row.brand;
  const categories = (row.product_categories || [])
    .flatMap((productCategory) => productCategory.category || [])
    .filter((category): category is NonNullable<typeof category> => Boolean(category));
  const primaryCategory = categories[0];
  const product: Product = {
    id: row.id,
    sku: row.sku ?? null,
    brand_id: row.brand_id ?? null,
    name: row.name,
    slug: row.slug ?? row.id,
    description: row.description ?? null,
    long_description: row.long_description ?? null,
    price: Number(row.price),
    stock_status: (row.stock_status as Product['stock_status']) || 'in_stock',
    images: parseImages(row.images),
    is_featured: storefrontSettings.is_featured,
    is_special_order: Boolean(row.is_special_order),
    pickup_only: storefrontSettings.pickup_only,
    weight: row.weight !== undefined && row.weight !== null ? Number(row.weight) : null,
    search_keywords: row.search_keywords ?? null,
    category_ids: categories.map((category) => category.id),
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
    quantity: row.quantity ?? 0,
    low_stock_threshold: row.low_stock_threshold ?? 5,
    is_taxable: row.is_taxable ?? true,
    published_at: row.published_at ?? null,
    gtin: row.gtin ?? null,
    availability: row.availability ?? null,
    minimum_quantity: row.minimum_quantity ?? 0,
    shopsite_pages: parseShopsitePages(row.shopsite_pages),
    brand: brand
      ? {
          id: brand.id,
          name: brand.name,
          slug: brand.slug,
          logo_url: brand.logo_url ?? null,
        }
      : undefined,
    primary_category: primaryCategory
      ? {
          id: primaryCategory.id,
          name: primaryCategory.name,
          slug: primaryCategory.slug,
          parent_id: primaryCategory.parent_id,
          description: primaryCategory.description,
          image_url: primaryCategory.image_url,
          created_at: primaryCategory.created_at,
        }
      : undefined,
  };
  return product;
}

async function resolveCategoryIds(
  supabase: ProductReadClient,
  options: { categoryId?: string; categorySlug?: string }
): Promise<string[] | null> {
  let resolvedCategoryId = options.categoryId ?? null;

  if (!resolvedCategoryId && options.categorySlug) {
    const { data: category, error } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', options.categorySlug)
      .single();

    if (error || !category) {
      return [];
    }

    resolvedCategoryId = category.id;
  }

  if (!resolvedCategoryId) {
    return null;
  }

  // Fetch all categories to build the tree in memory
  const { data: allCategories, error: catError } = await supabase
    .from('categories')
    .select('id, parent_id');

  if (catError || !allCategories) {
    console.error('Error fetching categories for resolution:', catError);
    return [];
  }

  // Find all descendant IDs recursively
  const descendantIds = new Set<string>([resolvedCategoryId]);
  let added = true;
  while (added) {
    added = false;
    for (const cat of allCategories) {
      if (cat.parent_id && descendantIds.has(cat.parent_id) && !descendantIds.has(cat.id)) {
        descendantIds.add(cat.id);
        added = true;
      }
    }
  }

  const targetCategoryIds = Array.from(descendantIds);
  return targetCategoryIds;
}

async function resolveFeaturedProductIds(
  supabase: ProductReadClient,
  featured?: boolean
): Promise<string[] | null> {
  if (!featured) {
    return null;
  }

  const { data, error } = await supabase
    .from('product_storefront_settings')
    .select('product_id')
    .eq('is_featured', true);

  if (error) {
    console.error('Error resolving featured products:', error);
    return [];
  }

  return (data || []).map((row) => row.product_id);
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
 * Parse shopsite pages from various formats (JSONB array, string array, etc.)
 */
function parseShopsitePages(pages: unknown): string[] {
  if (!pages) return [];
  if (Array.isArray(pages)) {
    return pages.filter((page): page is string => typeof page === 'string');
  }
  if (typeof pages === 'string') {
    try {
      const parsed = JSON.parse(pages);
      if (Array.isArray(parsed)) {
        return parsed.filter((page): page is string => typeof page === 'string');
      }
    } catch {
      // Not valid JSON, treat as single page
      return pages.trim() ? [pages] : [];
    }
  }
  return [];
}

/**
 * Fetches a single product by slug.
 * Uses products table which includes brand data.
 */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('slug', slug)
    .in('stock_status', STOREFRONT_VISIBLE_STOCK_STATUSES)
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
async function getProductById(id: string): Promise<Product | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
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

async function resolveFacetValueIds(
  supabase: ProductReadClient,
  facetsString?: string
): Promise<string[] | null> {
  if (!facetsString) return null;
  
  const facetPairs = facetsString.split(',').filter(Boolean);
  if (facetPairs.length === 0) return null;

  // Get all facet_values to resolve the slugs
  const { data: facetValuesData, error } = await supabase
    .from('facet_values')
    .select('id, slug, facet_definitions(slug)');

  if (error) {
    console.error('Error resolving facet values:', JSON.stringify(error, null, 2));
    return [];
  }

  const facetValues = facetValuesData as FacetValueLookup[] | null;

  if (!facetValues) return [];

  // Find the facet_value_ids that match our requested pairs
  const matchingValueIds = facetPairs.map(pair => {
    const [defSlug, valSlug] = pair.split(':');
    const match = facetValues.find(fv => 
      fv.slug === valSlug && getFacetDefinitionSlug(fv.facet_definitions) === defSlug
    );
    return match?.id;
  }).filter(Boolean) as string[];

  if (matchingValueIds.length === 0) return [];

  return matchingValueIds;
}

async function resolveBrandId(
  supabase: ProductReadClient,
  options?: { brandSlug?: string; brandId?: string }
): Promise<string | null | undefined> {
  if (options?.brandId) {
    return options.brandId;
  }

  if (!options?.brandSlug) {
    return undefined;
  }

  const { data: brand } = await supabase
    .from('brands')
    .select('id')
    .eq('slug', options.brandSlug)
    .single();

  return brand?.id ?? null;
}

async function getFilteredProductIds(
  supabase: ProductReadClient,
  options?: ProductFilterQueryOptions
): Promise<string[]> {
  const stockStatus = options?.stockStatus;

  if (stockStatus === 'out_of_stock') {
    return [];
  }

  const [categoryIds, facetValueIds, brandId, featuredProductIds] = await Promise.all([
    resolveCategoryIds(supabase, {
      categoryId: options?.categoryId,
      categorySlug: options?.categorySlug,
    }),
    resolveFacetValueIds(supabase, options?.facets),
    resolveBrandId(supabase, {
      brandId: options?.brandId,
      brandSlug: options?.brandSlug,
    }),
    resolveFeaturedProductIds(supabase, options?.featured),
  ]);

  if (
    (categoryIds && categoryIds.length === 0) ||
    (facetValueIds && facetValueIds.length === 0) ||
    brandId === null ||
    (featuredProductIds && featuredProductIds.length === 0)
  ) {
    return [];
  }

  let selectString = 'id';

  if (options?.petTypeId) {
    selectString += ', product_pet_types!inner(pet_type_id)';
  }

  if (categoryIds) {
    selectString += ', category_filter:product_categories!inner(category_id)';
  }

  if (facetValueIds) {
    selectString += ', facet_filter:product_facets!inner(facet_value_id)';
  }

  let query = supabase.from('products').select(selectString);

  if (options?.petTypeId) {
    query = query.eq('product_pet_types.pet_type_id', options.petTypeId);
  }

  if (categoryIds) {
    query = query.in('category_filter.category_id', categoryIds);
  }

  if (facetValueIds) {
    query = query.in('facet_filter.facet_value_id', facetValueIds);
  }

  if (brandId) {
    query = query.eq('brand_id', brandId);
  }

  if (isStorefrontVisibleStockStatus(stockStatus)) {
    query = query.eq('stock_status', stockStatus);
  } else {
    query = query.in('stock_status', STOREFRONT_VISIBLE_STOCK_STATUSES);
  }

  if (options?.minPrice !== undefined) {
    query = query.gte('price', options.minPrice);
  }

  if (options?.maxPrice !== undefined) {
    query = query.lte('price', options.maxPrice);
  }

  if (options?.search) {
    query = query.ilike('name', `%${options.search}%`);
  }

  if (featuredProductIds) {
    query = query.in('id', featuredProductIds);
  }

  query = query.order('id');

  const { data, error } = await query.range(0, 9999);

  if (error) {
    console.error('Error fetching filtered product IDs:', JSON.stringify(error, null, 2));
    return [];
  }

  return Array.from(new Set(((data || []) as unknown as Array<{ id: string }>).map((row) => row.id)));
}

interface ProductBrandFacetRow {
  stock_status: string | null;
  brand:
    | { id: string; name: string; slug: string; logo_url: string | null }
    | Array<{ id: string; name: string; slug: string; logo_url: string | null }>
    | null;
}

interface ProductPetTypeFacetRow {
  pet_types:
    | { id: string; name: string; display_order: number | null }
    | Array<{ id: string; name: string; display_order: number | null }>
    | null;
}

interface ProductCategoryFacetRow {
  category_id: string;
}

interface ProductFacetValueRow {
  facet_values:
    | {
        id: string;
        value: string;
        slug: string;
        facet_definition_id: string;
        facet_definitions: { id: string; name: string; slug: string } | Array<{ id: string; name: string; slug: string }> | null;
      }
    | Array<{
        id: string;
        value: string;
        slug: string;
        facet_definition_id: string;
        facet_definitions: { id: string; name: string; slug: string } | Array<{ id: string; name: string; slug: string }> | null;
      }>
    | null;
}

export async function getAvailableProductFilters(
  options?: ProductFilterQueryOptions
): Promise<ProductFilterOptions> {
  const supabase = createPublicClient();
  const productIds = await getFilteredProductIds(supabase, options);

  if (productIds.length === 0) {
    return { brands: [], petTypes: [], categories: [], stockStatuses: [], dynamicFacets: [] };
  }

  const [brandsResult, petTypesResult, categoriesResult, productCategoriesResult, facetsResult] = await Promise.all([
    supabase
      .from('products')
      .select('stock_status, brand:brands(id, name, slug, logo_url)')
      .in('id', productIds),
    supabase
      .from('product_pet_types')
      .select('pet_types(id, name, display_order)')
      .in('product_id', productIds),
    supabase
      .from('categories')
      .select('id, name, slug, parent_id, display_order, image_url, is_featured')
      .order('display_order'),
    supabase
      .from('product_categories')
      .select('category_id')
      .in('product_id', productIds),
    supabase
      .from('product_facets')
      .select('facet_values(id, value, slug, facet_definition_id, facet_definitions(id, name, slug))')
      .in('product_id', productIds),
  ]);

  if (brandsResult.error) {
    console.error('Error fetching available brands:', brandsResult.error);
  }

  if (petTypesResult.error) {
    console.error('Error fetching available pet types:', petTypesResult.error);
  }

  if (categoriesResult.error) {
    console.error('Error fetching available categories:', categoriesResult.error);
  }

  if (productCategoriesResult.error) {
    console.error('Error fetching available product categories:', productCategoriesResult.error);
  }

  if (facetsResult.error) {
    console.error('Error fetching available facets:', facetsResult.error);
  }

  const brandMap = new Map<string, ProductFilterOptions['brands'][number]>();
  const stockStatusSet = new Set<StorefrontVisibleStockStatus>();
  for (const row of ((brandsResult.data || []) as unknown as ProductBrandFacetRow[])) {
    const brand = Array.isArray(row.brand) ? row.brand[0] : row.brand;
    if (brand) {
      brandMap.set(brand.id, brand);
    }

    const stockStatus = row.stock_status ?? undefined;
    if (isStorefrontVisibleStockStatus(stockStatus)) {
      stockStatusSet.add(stockStatus);
    }
  }

  const petTypeMap = new Map<string, { id: string; name: string; display_order: number | null }>();
  for (const row of ((petTypesResult.data || []) as unknown as ProductPetTypeFacetRow[])) {
    const petType = Array.isArray(row.pet_types) ? row.pet_types[0] : row.pet_types;
    if (petType) {
      petTypeMap.set(petType.id, petType);
    }
  }

  const productCategoryIds = new Set(
    ((productCategoriesResult.data || []) as ProductCategoryFacetRow[]).map((row) => row.category_id)
  );
  const categoryNodes = buildTaxonomyNodes((categoriesResult.data || []) as TaxonomyCategoryRecord[]);
  const visibleCategoryIds = new Set<string>();
  for (const category of categoryNodes) {
    if (productCategoryIds.has(category.id)) {
      visibleCategoryIds.add(category.id);
      category.ancestor_ids.forEach((id) => {
        visibleCategoryIds.add(id);
      });
    }
  }

  const facetDefinitionMap = new Map<string, FacetDefinition>();
  for (const row of ((facetsResult.data || []) as unknown as ProductFacetValueRow[])) {
    const facetValue = Array.isArray(row.facet_values) ? row.facet_values[0] : row.facet_values;
    const facetDefinition = Array.isArray(facetValue?.facet_definitions)
      ? facetValue?.facet_definitions[0]
      : facetValue?.facet_definitions;

    if (!facetValue || !facetDefinition) {
      continue;
    }

    const existingDefinition = facetDefinitionMap.get(facetDefinition.id) ?? {
      id: facetDefinition.id,
      name: facetDefinition.name,
      slug: facetDefinition.slug,
      values: [],
    };

    if (!existingDefinition.values.some((value) => value.id === facetValue.id)) {
      existingDefinition.values.push({
        id: facetValue.id,
        value: facetValue.value,
        slug: facetValue.slug,
      });
    }

    facetDefinitionMap.set(facetDefinition.id, existingDefinition);
  }

  return {
    brands: Array.from(brandMap.values()).sort((left, right) => left.name.localeCompare(right.name)),
    petTypes: Array.from(petTypeMap.values())
      .sort((left, right) => {
        const leftOrder = left.display_order ?? 0;
        const rightOrder = right.display_order ?? 0;

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return left.name.localeCompare(right.name);
      })
      .map(({ id, name }) => ({ id, name })),
    categories: categoryNodes.filter((category) => visibleCategoryIds.has(category.id)),
    stockStatuses: ([
      { id: 'in_stock', label: 'In Stock' },
      { id: 'pre_order', label: 'Pre-Order' },
    ] satisfies Array<{ id: StorefrontVisibleStockStatus; label: string }>).filter((status) =>
      stockStatusSet.has(status.id)
    ),
    dynamicFacets: Array.from(facetDefinitionMap.values())
      .map((definition) => ({
        ...definition,
        values: definition.values.sort((left, right) => left.value.localeCompare(right.value)),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

/**
 * Fetches products with optional filtering and pagination. * Uses products table which includes brand data.
 */
export async function getFilteredProducts(options?: ProductFilterQueryOptions & {
  limit?: number;
  offset?: number;
}): Promise<{ products: Product[]; count: number }> {
  const supabase = createPublicClient();
  const stockStatus = options?.stockStatus;

  if (stockStatus === 'out_of_stock') {
    return { products: [], count: 0 };
  }

  const categoryIds = await resolveCategoryIds(supabase, {
    categoryId: options?.categoryId,
    categorySlug: options?.categorySlug,
  });

  if (categoryIds && categoryIds.length === 0) {
    return { products: [], count: 0 };
  }

  const facetValueIds = await resolveFacetValueIds(supabase, options?.facets);

  if (facetValueIds && facetValueIds.length === 0) {
    return { products: [], count: 0 };
  }
  
  // Base selection
  let selectString = PRODUCT_SELECT;
  
  // If filtering by pet type, add the inner join to the select string
  if (options?.petTypeId) {
    selectString += `, product_pet_types!inner(pet_type_id)`;
  }

  if (categoryIds) {
    selectString += `, category_filter:product_categories!inner(category_id)`;
  }

  if (facetValueIds) {
    selectString += `, facet_filter:product_facets!inner(facet_value_id)`;
  }

  let query = supabase
    .from('products')
    .select(selectString, { count: 'exact' });

  // Filter by pet type ID if provided
  if (options?.petTypeId) {
    query = query.eq('product_pet_types.pet_type_id', options.petTypeId);
  }

  if (categoryIds) {
    query = query.in('category_filter.category_id', categoryIds);
  }

  if (facetValueIds) {
    query = query.in('facet_filter.facet_value_id', facetValueIds);
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
  // Filter by stock status
  if (isStorefrontVisibleStockStatus(stockStatus)) {
    query = query.eq('stock_status', stockStatus);
  } else {
    query = query.in('stock_status', STOREFRONT_VISIBLE_STOCK_STATUSES);
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

  const featuredProductIds = await resolveFeaturedProductIds(supabase, options?.featured);
  if (featuredProductIds) {
    if (featuredProductIds.length === 0) {
      return { products: [], count: 0 };
    }

    query = query.in('id', featuredProductIds);
  }

  query = query.order('created_at', { ascending: false });

  const limit = options?.limit || 12;
  const offset = options?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching products:', JSON.stringify(error, null, 2));
    return { products: [], count: 0 };
  }

  return {
    products: ((data || []) as unknown as ProductRow[]).map(transformProductRow),
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
async function getAllProducts(): Promise<Product[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .in('stock_status', STOREFRONT_VISIBLE_STOCK_STATUSES)
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
async function getProductsByBrand(brandSlug: string): Promise<Product[]> {
  const { products } = await getFilteredProducts({ brandSlug });
  return products;
}

/**
 * Search products by name.
 */
async function searchProducts(
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
  const supabase = createPublicClient();

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
      product:products!inner(
        id, sku, name, slug, description, long_description, price,
        stock_status, images, brand_id, is_special_order, is_taxable,
        weight, search_keywords, shopsite_pages,
        published_at, gtin, availability, minimum_quantity, quantity,
        low_stock_threshold, created_at, updated_at,
        storefront_settings:product_storefront_settings(is_featured, pickup_only)
      )
    `)
    .eq('group_id', group.id)
    .in('product.stock_status', STOREFRONT_VISIBLE_STOCK_STATUSES)
    .order('sort_order', { ascending: true });

  if (membersError) {
    console.error('Error fetching group members:', membersError);
    return { group, members: [], defaultMember: null };
  }

  // Build members array
  const members: Array<{ member: ProductGroupMember; product: Product }> = [];
  let defaultMember: ProductGroupMember | null = null;

  for (const row of (membersData || []) as unknown as Array<{ product: Record<string, unknown> | undefined; group_id: string; product_id: string; sort_order: number; is_default: boolean; display_label: string | null; metadata: Record<string, unknown> | null; created_at: string }>) {
    const product = row.product as Record<string, unknown> | undefined;
    if (!product) continue;
    const storefrontSettings = normalizeProductStorefrontSettings(
      product.storefront_settings as ProductStorefrontSettingsRelation
    );

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
      sku: (product.sku as string | null) ?? null,
      brand_id: product.brand_id as string | null,
      name: product.name as string,
      slug: product.slug as string,
      description: product.description as string | null,
      long_description: product.long_description as string | null,
      price: Number(product.price),
      stock_status: (product.stock_status as Product['stock_status']) || 'in_stock',
      images: parseImages(product.images),
      is_featured: storefrontSettings.is_featured,
      is_special_order: Boolean(product.is_special_order),
      pickup_only: storefrontSettings.pickup_only,
      weight: typeof product.weight === 'number' ? (product.weight as number) : null,
      search_keywords: product.search_keywords as string | null,

      created_at: (product.created_at as string | undefined) ?? '',
      updated_at: product.updated_at as string | undefined,
      quantity: typeof product.quantity === 'number' ? (product.quantity as number) : 0,
      low_stock_threshold:
        typeof product.low_stock_threshold === 'number'
          ? (product.low_stock_threshold as number)
          : 5,
      is_taxable: product.is_taxable !== false,
      published_at: product.published_at as string | null,
      gtin: product.gtin as string | null,
      availability: product.availability as string | null,
      minimum_quantity:
        typeof product.minimum_quantity === 'number'
          ? (product.minimum_quantity as number)
          : 0,
      shopsite_pages: parseImages(product.shopsite_pages),
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
async function getProductGroupById(
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
async function getGroupProductIds(
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
async function createProductGroup(options: {
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
async function updateProductGroup(
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
async function deleteProductGroup(id: string): Promise<boolean> {
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
async function addProductToGroup(
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
async function removeProductFromGroup(
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
async function updateProductGroupPosition(
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
async function setGroupDefaultProduct(
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
async function getAllProductGroups(): Promise<ProductGroup[]> {
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
async function getProductGroups(
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
