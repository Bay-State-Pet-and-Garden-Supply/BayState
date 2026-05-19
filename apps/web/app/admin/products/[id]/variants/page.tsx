import { SplitSquareVertical } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { createClient } from '@/lib/supabase/server';
import { getProductVariants, getProductOptions } from '@/lib/admin/variants';
import { ProductVariantsClient } from '@/components/admin/products/variants/ProductVariantsClient';
import { notFound } from 'next/navigation';

export default async function ProductVariantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  
  const { data: product } = await supabase
    .from('products')
    .select('id, name, slug, price')
    .eq('id', id)
    .single();
  
  if (!product) {
    notFound();
  }
  
  const [variants, options] = await Promise.all([
    getProductVariants(id),
    getProductOptions(id),
  ]);
  
  return (
    <AdminPageShell
      title={product.name}
      description="Manage options, variant pricing, and the storefront buying structure for this product."
      icon={<SplitSquareVertical className="h-5 w-5" />}
      eyebrow="Workspace view"
      backHref="/admin/products"
      backLabel="Back to products"
    >
      <ProductVariantsClient
        productId={id}
        productName={product.name}
        basePrice={product.price}
        initialVariants={variants}
        initialOptions={options}
      />
    </AdminPageShell>
  );
}
