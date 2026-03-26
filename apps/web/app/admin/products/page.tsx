import { createClient } from '@/lib/supabase/server';
import { AdminProductsClient } from '@/components/admin/products/AdminProductsClient';
import { PublishedProduct } from '@/components/admin/products/ProductEditModal';
import { splitMultiValueFacet } from '@/lib/facets/normalization';
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
      .select('*, brand:brands(id, name, slug), product_categories(category:categories(id, name))', { count: 'exact' })
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
  const clientProducts: PublishedProduct[] = (products || []).map(product => ({
    id: product.id,
    sku: product.sku || '',
    name: product.name,
    slug: product.slug,
    description: product.description,
    long_description: product.long_description,
    price: product.price,
    weight: product.weight,
    stock_status: product.stock_status,
    is_featured: product.is_featured,
    images: product.images,
    brand_id: product.brand_id,
    brand_name: product.brand?.name || null,
    brand_slug: product.brand?.slug || null,
    category: product.category || null,
    product_type: product.product_type || null,
    search_keywords: product.search_keywords || null,
    gtin: product.gtin || null,
    availability: product.availability || null,
    minimum_quantity: product.minimum_quantity ?? 0,
    is_special_order: product.is_special_order || false,
    is_taxable: product.is_taxable ?? true,
    product_on_pages: product.shopsite_pages || [],
    category_ids: (product.product_categories || []).map((pc: { category?: { id: string } }) => pc.category?.id).filter(Boolean),
    created_at: product.created_at,
  }));

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

