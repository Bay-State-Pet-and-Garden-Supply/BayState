import { createClient } from '@/lib/supabase/server';
import { AdminProductsClient } from '@/components/admin/products/AdminProductsClient';
import { PublishedProduct } from '@/components/admin/products/ProductEditModal';
import { splitMultiValueFacet } from '@/lib/facets/normalization';
import { normalizeProductStorefrontSettings } from '@/lib/product-storefront-settings';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Products | Bay State Pet Admin',
  description: 'Manage published products in the storefront.',
};

export default async function AdminProductsPage() {
  const supabase = await createClient();

  // Fetch products, brands, categories, and unique product types in parallel
  const [productsRes, brandsRes, categoriesRes, productTypesRes] = await Promise.all([
    supabase
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
          category,
          product_type,
          search_keywords,
          gtin,
          availability,
          minimum_quantity,
          is_special_order,
          is_taxable,
          shopsite_pages,
          created_at,
          brand:brands(id, name, slug),
          storefront_settings:product_storefront_settings(is_featured, pickup_only),
          product_categories(category_id)
        `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('brands')
      .select('id, name')
      .order('name', { ascending: true }),
    supabase
      .from('categories')
      .select('id, name')
      .order('name', { ascending: true }),
    supabase
      .from('products')
      .select('product_type')
      .not('product_type', 'is', null)
  ]);

  const { data: products, count } = productsRes;
  const { data: brands } = brandsRes;
  const { data: categories } = categoriesRes;
  
  // Get unique product types
  const productTypes = Array.from(new Set((productTypesRes.data || [])
    .flatMap(p => splitMultiValueFacet(p.product_type))))
    .sort();

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
      category: product.category || null,
      product_type: product.product_type || null,
      search_keywords: product.search_keywords || null,
      gtin: product.gtin || null,
      availability: product.availability || null,
      minimum_quantity: product.minimum_quantity ?? 0,
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
      productTypes={productTypes}
    />
  );
}
