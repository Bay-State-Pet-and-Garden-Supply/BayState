import { createClient } from '@/lib/supabase/server';
import { AdminProductsClient } from '@/components/admin/products/AdminProductsClient';
import { PublishedProduct } from '@/components/admin/products/ProductEditModal';

export default async function AdminProductsPage() {
  const supabase = await createClient();

  const { data: products, count } = await supabase
    .from('products')
    .select('*, brand:brands!inner(id, name, slug)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(50);

  // Transform products to match PublishedProduct interface
  // brand:brands!inner returns nested brand object, we flatten it to brand_name/brand_slug
  const clientProducts: PublishedProduct[] = (products || []).map(product => ({
    id: product.id,
    sku: product.sku || '',
    name: product.name,
    slug: product.slug,
    description: product.description,
    price: product.price,
    stock_status: product.stock_status,
    is_featured: product.is_featured,
    images: product.images,
    brand_id: product.brand_id,
    brand_name: product.brand?.name || null,
    brand_slug: product.brand?.slug || null,
    created_at: product.created_at,
  }));

  return (
    <AdminProductsClient
      initialProducts={clientProducts}
      totalCount={count || 0}
    />
  );
}

