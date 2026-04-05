import { createClient } from '@/lib/supabase/server';
import { AdminProductsClient } from '@/components/admin/products/AdminProductsClient';
import { PublishedProduct } from '@/components/admin/products/ProductEditModal';
import { normalizeProductStorefrontSettings } from '@/lib/product-storefront-settings';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Products | Bay State Pet Admin',
  description: 'Manage published products in the storefront.',
};

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; brand?: string; category?: string; stock?: string; featured?: string }>;
}) {
  const { search, brand, category, stock, featured } = await searchParams;
  const supabase = await createClient();
  const productCategoriesSelect = category && category !== 'all'
    ? 'product_categories!inner(category_id)'
    : 'product_categories(category_id)';

  // Build the products query
  let productsQuery = supabase
    .from('products')
    .select(
      `
        id,
        sku,
        name,
        slug,
        description,
        long_description,
        price,
        weight,
        stock_status,
        images,
        brand_id,
        search_keywords,
        gtin,
        availability,
        minimum_quantity,
        quantity,
        low_stock_threshold,
        published_at,
        is_special_order,
        is_taxable,
        shopsite_pages,
        created_at,
        brand:brands(id, name, slug),
        storefront_settings:product_storefront_settings(is_featured, pickup_only),
        ${productCategoriesSelect}
      `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .limit(50);

  // Apply server-side filters
  if (search) {
    productsQuery = productsQuery.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
  }
  if (brand && brand !== 'all') {
    productsQuery = productsQuery.eq('brand_id', brand);
  }
  if (category && category !== 'all') {
    productsQuery = productsQuery.eq('product_categories.category_id', category);
  }
  if (stock && stock !== 'all') {
    productsQuery = productsQuery.eq('stock_status', stock);
  }

  // Fetch data in parallel
  const [productsRes, brandsRes, categoriesRes] = await Promise.all([
    productsQuery,
    supabase
      .from('brands')
      .select('id, name')
      .order('name', { ascending: true }),
    supabase
      .from('categories')
      .select('id, name')
      .order('name', { ascending: true })
  ]);

  const { data: products, count } = productsRes;
  const { data: brands } = brandsRes;
  const { data: categories } = categoriesRes;
  
  // Transform products to match PublishedProduct interface
  const clientProducts: PublishedProduct[] = (products || []).map((product) => {
    const storefrontSettings = normalizeProductStorefrontSettings(product.storefront_settings);
    const brand = Array.isArray(product.brand) ? product.brand[0] ?? null : product.brand;

    return {
      id: product.id,
      sku: product.sku || '',
      name: product.name,
      slug: product.slug,
      description: product.description,
      long_description: product.long_description,
      price: product.price,
      weight: product.weight,
      stock_status: product.stock_status,
      is_featured: storefrontSettings.is_featured,
      images: product.images,
      brand_id: product.brand_id,
      brand_name: brand?.name || null,
      brand_slug: brand?.slug || null,
      search_keywords: product.search_keywords || null,
      gtin: product.gtin || null,
      availability: product.availability || null,
      minimum_quantity: product.minimum_quantity ?? 0,
      quantity: product.quantity ?? null,
      low_stock_threshold: product.low_stock_threshold ?? null,
      published_at: product.published_at ?? null,
      is_special_order: product.is_special_order || false,
      is_taxable: product.is_taxable ?? true,
      product_on_pages: product.shopsite_pages || [],
      category_ids: (product.product_categories || [])
        .map((pc: { category_id?: string | null }) => pc.category_id)
        .filter((value: string | null | undefined): value is string => Boolean(value)),
      created_at: product.created_at,
    };
  });

  return (
    <AdminProductsClient
      initialProducts={clientProducts}
      totalCount={count || 0}
      brands={brands || []}
      categories={categories || []}
    />
  );
}
